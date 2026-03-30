export const config = {
  useMock: process.env.NEXT_PUBLIC_USE_MOCK === 'true',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
  cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
  cognitoRegion: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
}
