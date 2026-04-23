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

export async function listCognitoUsers(hoaId?: string): Promise<CognitoUser[]> {
  const filter = hoaId
    ? `custom:hoaId = "${hoaId}"`
    : undefined

  const cmd = new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Filter: filter,
    Limit: 60,
  })

  const res = await client.send(cmd)
  return (res.Users ?? []).map((u: UserType) => ({
    username: u.Username ?? '',
    email: u.Attributes?.find((a: AttributeType) => a.Name === 'email')?.Value ?? '',
    status: u.Enabled ? 'active' : 'disabled',
    enabled: u.Enabled ?? false,
  }))
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
