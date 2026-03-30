import { Amplify } from 'aws-amplify'
import { config } from './config'

export function configureAmplify(): void {
  if (config.useMock) {
    // Skip Amplify configuration in mock mode
    return
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
        loginWith: {
          email: true,
        },
      },
    },
  })
}

export async function getAuthToken(): Promise<string | null> {
  if (config.useMock) {
    return 'mock-jwt-token'
  }

  try {
    const { fetchAuthSession } = await import('aws-amplify/auth')
    const session = await fetchAuthSession()
    return session.tokens?.accessToken?.toString() ?? null
  } catch {
    return null
  }
}
