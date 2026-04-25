import * as r from '../../../shared/response'
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { getHoa, createBoardAdminOwner } from '../repository'

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? ''

interface CreateHoaAdminBody {
  email: string
  firstName: string
  lastName: string
  phone?: string
  temporaryPassword?: string
}

/**
 * POST /api/admin/hoas/:hoaId/admin-user
 * Creates a board_admin Cognito user for an HOA and inserts the owners record.
 */
export async function handleCreateHoaAdmin(
  hoaId: string,
  body: string | null,
  requesterId: string,
): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body required')

  const input = JSON.parse(body) as CreateHoaAdminBody
  if (!input.email?.includes('@')) return r.badRequest('Valid email required')
  if (!input.firstName?.trim()) return r.badRequest('firstName required')
  if (!input.lastName?.trim()) return r.badRequest('lastName required')

  const hoa = await getHoa(hoaId)
  if (!hoa) return r.notFound('HOA')

  const tempPassword = input.temporaryPassword ?? generateTempPassword()

  // Create Cognito user with board_admin role
  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: input.email,
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS', // Don't send Cognito's default welcome email
      UserAttributes: [
        { Name: 'email',              Value: input.email },
        { Name: 'email_verified',     Value: 'true' },
        { Name: 'given_name',         Value: input.firstName.trim() },
        { Name: 'family_name',        Value: input.lastName.trim() },
        { Name: 'custom:hoaId',       Value: hoaId },
        { Name: 'custom:role',        Value: 'board_admin' },
        ...(input.phone ? [{ Name: 'phone_number', Value: input.phone }] : []),
      ],
    }))

    // Set permanent password so user doesn't need to change it on first login
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: input.email,
      Password: tempPassword,
      Permanent: true,
    }))
  } catch (err: unknown) {
    const awsErr = err as { name?: string; message?: string }
    if (awsErr.name === 'UsernameExistsException') {
      return r.conflict('A user with this email already exists')
    }
    throw err
  }

  // Create the owners DB record (status=active for board_admin)
  const owner = await createBoardAdminOwner({
    hoaId,
    email: input.email,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone ?? null,
  })

  return r.created({
    owner,
    temporaryPassword: tempPassword,
    hoaName: hoa.name,
  })
}

function generateTempPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%'
  const all = upper + lower + digits + special

  // Ensure at least one of each required character class
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]),
  ]

  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
