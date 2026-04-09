/**
 * Amplify configuration — loaded once, client-side only.
 *
 * We use a static top-level import so Amplify is configured synchronously
 * before any auth call fires. The `typeof window` guard prevents this module
 * from running during Next.js SSR (server-side rendering).
 */
import { Amplify } from 'aws-amplify'
import { fetchAuthSession, signIn as amplifySignIn, signOut as amplifySignOut } from 'aws-amplify/auth'
import { config } from './config'

let configured = false

export function configureAmplify(): void {
  if (configured) return
  if (typeof window === 'undefined') return   // SSR guard
  if (config.useMock) return                  // Mock mode: skip entirely

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
        loginWith: { email: true },
      },
    },
  })

  configured = true
}

export async function getAuthToken(): Promise<string | null> {
  if (config.useMock) return 'mock-jwt-token'
  try {
    const session = await fetchAuthSession()
    return session.tokens?.accessToken?.toString() ?? null
  } catch {
    return null
  }
}

export { fetchAuthSession, amplifySignIn, amplifySignOut }
