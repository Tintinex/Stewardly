import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'
import { query, queryOne, execute, param } from '../shared/db/client'
import * as r from '../shared/response'

interface AuthorizerContext {
  hoaId: string
  userId: string
  role: string
}

type ResidentEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

// PII NOTE: This service handles Personally Identifiable Information (PII).
// - Email, phone, name fields are considered PII
// - All data is encrypted at rest via RDS/KMS encryption
// - Data is scoped strictly to the HOA via hoaId (multi-tenant isolation)
// - Never log PII fields — log only IDs

interface Resident {
  id: string
  hoaId: string
  email: string
  firstName: string
  lastName: string
  role: string
  unitId: string | null
  unitNumber: string | null
  phone: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export const handler = async (event: ResidentEvent) => {
  const hoaId = event.requestContext.authorizer.lambda.hoaId
  const userId = event.requestContext.authorizer.lambda.userId
  const role = event.requestContext.authorizer.lambda.role

  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const residentId = event.pathParameters?.residentId

  try {
    // GET /api/residents — available to all roles (homeowners see their community)
    if (method === 'GET' && !residentId) {
      const residents = await query<Resident>(
        `SELECT o.id, o.hoa_id, o.email, o.first_name, o.last_name, o.role,
                o.unit_id, u.unit_number, o.phone, o.avatar_url, o.created_at, o.updated_at
         FROM owners o
         LEFT JOIN units u ON u.id = o.unit_id
         WHERE o.hoa_id = :hoaId
         ORDER BY o.last_name ASC, o.first_name ASC`,
        [param.string('hoaId', hoaId)],
      )

      // Homeowners see limited PII — mask phone/email for non-own records
      if (role === 'homeowner') {
        return r.ok(residents.map(res => ({
          ...res,
          email: res.id === userId ? res.email : res.email.replace(/(.{2}).*(@)/, '$1***$2'),
          phone: res.id === userId ? res.phone : null,
        })))
      }

      return r.ok(residents)
    }

    // POST /api/residents — board members only
    if (method === 'POST') {
      if (role === 'homeowner') return r.forbidden('Only board members can add residents')
      if (!event.body) return r.badRequest('Request body is required')

      const body = JSON.parse(event.body) as {
        firstName?: string
        lastName?: string
        email?: string
        phone?: string
        role?: string
        unitNumber?: string
      }

      if (!body.firstName?.trim()) return r.badRequest('firstName is required')
      if (!body.lastName?.trim()) return r.badRequest('lastName is required')
      if (!body.email?.trim()) return r.badRequest('email is required')
      if (!body.unitNumber?.trim()) return r.badRequest('unitNumber is required')

      const validRoles = ['homeowner', 'board_member', 'board_admin']
      if (body.role && !validRoles.includes(body.role)) {
        return r.badRequest(`role must be one of: ${validRoles.join(', ')}`)
      }

      // Verify unit exists for this HOA
      const unit = await queryOne<{ id: string }>(
        'SELECT id FROM units WHERE hoa_id = :hoaId AND unit_number = :unitNumber',
        [param.string('hoaId', hoaId), param.string('unitNumber', body.unitNumber)],
      )

      const newId = await queryOne<{ id: string }>(
        `INSERT INTO owners (id, hoa_id, email, first_name, last_name, role, unit_id, phone)
         VALUES (gen_random_uuid(), :hoaId, :email, :firstName, :lastName, :role, :unitId, :phone)
         RETURNING id`,
        [
          param.string('hoaId', hoaId),
          param.string('email', body.email.trim().toLowerCase()),
          param.string('firstName', body.firstName.trim()),
          param.string('lastName', body.lastName.trim()),
          param.string('role', body.role ?? 'homeowner'),
          param.stringOrNull('unitId', unit?.id ?? null),
          param.stringOrNull('phone', body.phone ?? null),
        ],
      )

      if (!newId?.id) return r.serverError('Failed to create resident')

      const created = await queryOne<Resident>(
        `SELECT o.id, o.hoa_id, o.email, o.first_name, o.last_name, o.role,
                o.unit_id, u.unit_number, o.phone, o.avatar_url, o.created_at, o.updated_at
         FROM owners o
         LEFT JOIN units u ON u.id = o.unit_id
         WHERE o.id = :id`,
        [param.string('id', newId.id)],
      )

      // Log addition without PII
      console.log(`Resident created: id=${newId.id}, hoaId=${hoaId}, createdBy=${userId}`)

      return r.created(created)
    }

    // PATCH /api/residents/{residentId} — board members can update
    if (method === 'PATCH' && residentId) {
      if (role === 'homeowner' && residentId !== userId) {
        return r.forbidden('Homeowners can only update their own profile')
      }
      if (!event.body) return r.badRequest('Request body is required')

      const body = JSON.parse(event.body) as {
        firstName?: string
        lastName?: string
        phone?: string
        role?: string
        unitNumber?: string
      }

      const existing = await queryOne<{ id: string }>(
        'SELECT id FROM owners WHERE id = :residentId AND hoa_id = :hoaId',
        [param.string('residentId', residentId), param.string('hoaId', hoaId)],
      )
      if (!existing) return r.notFound('Resident')

      const setParts: string[] = ['updated_at = NOW()']
      const params = [
        param.string('residentId', residentId),
        param.string('hoaId', hoaId),
      ]

      if (body.firstName !== undefined) {
        setParts.push('first_name = :firstName')
        params.push(param.string('firstName', body.firstName))
      }
      if (body.lastName !== undefined) {
        setParts.push('last_name = :lastName')
        params.push(param.string('lastName', body.lastName))
      }
      if (body.phone !== undefined) {
        setParts.push('phone = :phone')
        params.push(param.stringOrNull('phone', body.phone))
      }
      // Only board admins can change roles
      if (body.role !== undefined && role === 'board_admin') {
        setParts.push('role = :role')
        params.push(param.string('role', body.role))
      }

      await execute(
        `UPDATE owners SET ${setParts.join(', ')} WHERE id = :residentId AND hoa_id = :hoaId`,
        params,
      )

      const updated = await queryOne<Resident>(
        `SELECT o.id, o.hoa_id, o.email, o.first_name, o.last_name, o.role,
                o.unit_id, u.unit_number, o.phone, o.avatar_url, o.created_at, o.updated_at
         FROM owners o
         LEFT JOIN units u ON u.id = o.unit_id
         WHERE o.id = :residentId`,
        [param.string('residentId', residentId)],
      )

      return r.ok(updated)
    }

    return r.badRequest('Unsupported method')
  } catch (err) {
    console.error('Residents handler error:', err)
    return r.serverError()
  }
}
