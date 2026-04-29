import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminResetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  type UserType,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider'

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? ''

export interface CognitoUser {
  username: string
  email: string
  status: 'active' | 'disabled'
  enabled: boolean
}

/**
 * List Cognito users. NOTE: Cognito ListUsers does NOT support filtering by
 * custom attributes (e.g. custom:hoaId) — only standard attributes are
 * filterable. When hoaId is provided we skip Cognito entirely and rely on the
 * DB owners table for status; the caller merges appropriately.
 */
export async function listCognitoUsers(hoaId?: string): Promise<CognitoUser[]> {
  if (hoaId) return [] // per-HOA view uses DB status — see handleListUsers

  const users: CognitoUser[] = []
  let paginationToken: string | undefined
  do {
    const cmd = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: 60,
      ...(paginationToken ? { PaginationToken: paginationToken } : {}),
    })
    const res = await client.send(cmd)
    for (const u of res.Users ?? []) {
      users.push({
        username: u.Username ?? '',
        email: u.Attributes?.find((a: AttributeType) => a.Name === 'email')?.Value ?? '',
        status: u.Enabled ? 'active' : 'disabled',
        enabled: u.Enabled ?? false,
      })
    }
    paginationToken = res.PaginationToken
  } while (paginationToken)
  return users
}

export async function adminDisableUser(username: string): Promise<void> {
  await client.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }))
}

export async function adminEnableUser(username: string): Promise<void> {
  await client.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }))
}

export async function adminResetUserPassword(username: string): Promise<void> {
  await client.send(new AdminResetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: username }))
}

export async function adminUpdateUserRole(username: string, role: string): Promise<void> {
  await client.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
    UserAttributes: [{ Name: 'custom:role', Value: role }],
  }))
}

export async function clearUserHoaAttribute(username: string): Promise<void> {
  try {
    await client.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [{ Name: 'custom:hoaId', Value: '' }],
    }))
  } catch {
    // Best-effort — don't fail the remove operation if Cognito update fails
  }
}
