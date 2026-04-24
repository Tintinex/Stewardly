import * as r from '../../../shared/response'
import * as repo from '../repository'
import type { LambdaEvent } from '../../../shared/types'

/** POST /api/residents/me — called after email confirmation + sign-in to upsert the DB owner record */
export async function handleEnsureOwner(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId } = event.requestContext.authorizer.lambda

  if (!event.body) return r.badRequest('Request body is required')

  const parsed = JSON.parse(event.body) as {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    unitNumber?: string
  }

  if (!parsed.firstName) return r.badRequest('firstName is required')
  if (!parsed.lastName) return r.badRequest('lastName is required')
  if (!parsed.email) return r.badRequest('email is required')

  const owner = await repo.ensureOwner({
    hoaId,
    cognitoSub: userId,
    email: parsed.email,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    phone: parsed.phone ?? null,
    unitNumber: parsed.unitNumber ?? null,
  })

  if (!owner) return r.serverError('Failed to ensure owner record')

  return r.ok(owner)
}
