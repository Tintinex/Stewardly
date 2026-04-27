import * as r from '../../../shared/response'
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  createHoa,
  createSubscription,
  createBoardAdminOwner,
  createInitialInviteCode,
} from '../repository'

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? ''

interface RegisterHoaBody {
  hoaName: string
  address?: string
  city?: string
  state?: string
  zip?: string
  unitCount?: number
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
}

/**
 * POST /auth/register-hoa  (public — no authorizer)
 *
 * Creates a brand-new HOA with a 14-day trial, provisions a board_admin
 * Cognito user that can sign in immediately, and returns the first invite code.
 */
export async function handleRegisterHoa(body: string | null): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body required')

  let input: RegisterHoaBody
  try {
    input = JSON.parse(body) as RegisterHoaBody
  } catch {
    return r.badRequest('Invalid JSON body')
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  if (!input.hoaName?.trim()) return r.badRequest('hoaName is required')
  if (!input.firstName?.trim()) return r.badRequest('firstName is required')
  if (!input.lastName?.trim()) return r.badRequest('lastName is required')
  if (!input.email?.includes('@')) return r.badRequest('A valid email address is required')
  if (!input.password || input.password.length < 8) {
    return r.badRequest('Password must be at least 8 characters')
  }
  if (!/[A-Z]/.test(input.password)) return r.badRequest('Password must contain at least one uppercase letter')
  if (!/[a-z]/.test(input.password)) return r.badRequest('Password must contain at least one lowercase letter')
  if (!/[0-9]/.test(input.password)) return r.badRequest('Password must contain at least one number')
  if (!/[^A-Za-z0-9]/.test(input.password)) return r.badRequest('Password must contain at least one special character (e.g. !@#$%)')

  const email = input.email.toLowerCase().trim()

  // Normalize phone to E.164 (+1XXXXXXXXXX for US numbers).
  // Cognito rejects anything that isn't valid E.164 — phone is optional so we
  // strip it rather than blocking registration if the format is unrecognised.
  const phone = normalizePhone(input.phone)

  // ── 1. Create HOA ────────────────────────────────────────────────────────────
  const hoa = await createHoa({
    name: input.hoaName.trim(),
    address: input.address?.trim() ?? '',
    city: input.city?.trim() ?? '',
    state: (input.state?.trim().toUpperCase() ?? '').slice(0, 2),
    zip: input.zip?.trim() ?? '',
    unitCount: Math.max(0, Math.round(input.unitCount ?? 0)),
  })

  // ── 2. Create subscription (14-day trial) ────────────────────────────────────
  await createSubscription(hoa.id)

  // ── 3. Provision Cognito user ────────────────────────────────────────────────
  let cognitoSub: string | undefined
  try {
    const createResult = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      MessageAction: 'SUPPRESS', // suppress Cognito's default welcome email
      TemporaryPassword: input.password,
      UserAttributes: [
        { Name: 'email',           Value: email },
        { Name: 'email_verified',  Value: 'true' },
        { Name: 'given_name',      Value: input.firstName.trim() },
        { Name: 'family_name',     Value: input.lastName.trim() },
        { Name: 'custom:hoaId',    Value: hoa.id },
        { Name: 'custom:role',     Value: 'board_admin' },
        { Name: 'custom:unitId',   Value: '' },
        ...(phone ? [{ Name: 'phone_number', Value: phone }] : []),
      ],
    }))

    cognitoSub = createResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value

    // Set a permanent password so the user can sign in without changing it first
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: input.password,
      Permanent: true,
    }))
  } catch (err: unknown) {
    const awsErr = err as { name?: string }
    if (awsErr.name === 'UsernameExistsException') {
      return r.conflict('An account with this email already exists. Please sign in instead.')
    }
    // Rethrow unexpected Cognito errors (will be caught by the Lambda handler)
    throw err
  }

  // ── 4. Create owner record ───────────────────────────────────────────────────
  const owner = await createBoardAdminOwner({
    hoaId: hoa.id,
    email,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: phone ?? null,
    cognitoSub,
  })

  // ── 5. Generate first invite code ────────────────────────────────────────────
  const inviteCode = await createInitialInviteCode(hoa.id, owner.id)

  return r.created({
    hoa: { id: hoa.id, name: hoa.name },
    owner: {
      id: owner.id,
      email: owner.email,
      firstName: owner.firstName,
      lastName: owner.lastName,
      role: owner.role,
    },
    inviteCode,
    message: `"${hoa.name}" is live on a 14-day free trial. Share the invite code with your residents!`,
  })
}

/**
 * Normalise a phone string to E.164 format (+1XXXXXXXXXX for US/CA numbers).
 * Returns null if the number can't be understood — Cognito rejects non-E.164
 * values so we'd rather omit the field than cause a 500.
 */
function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null
  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, '')
  // Already E.164 (starts with +)
  if (raw.trim().startsWith('+')) {
    // Keep it but re-strip to ensure only digits after +
    return `+${digits}`
  }
  // 10-digit US number → +1XXXXXXXXXX
  if (digits.length === 10) return `+1${digits}`
  // 11-digit with leading 1 (US) → +1XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  // Unrecognised — omit rather than send a bad value to Cognito
  return null
}
