import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

interface PlaidCredentials {
  clientId: string
  secret: string
  environment: 'sandbox' | 'development' | 'production'
}

let cachedClient: PlaidApi | null = null

export async function getPlaidClient(): Promise<PlaidApi> {
  if (cachedClient) return cachedClient

  const secretArn = process.env.PLAID_SECRET_ARN
  if (!secretArn) throw new Error('PLAID_SECRET_ARN environment variable not set')

  const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  const result = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }))
  const creds = JSON.parse(result.SecretString ?? '{}') as PlaidCredentials

  const basePath =
    creds.environment === 'production'
      ? PlaidEnvironments.production
      : creds.environment === 'development'
        ? PlaidEnvironments.development
        : PlaidEnvironments.sandbox

  const config = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': creds.clientId,
        'PLAID-SECRET':    creds.secret,
      },
    },
  })

  cachedClient = new PlaidApi(config)
  return cachedClient
}

// Map Plaid category array to our HOA category taxonomy
export function mapPlaidCategory(categories: string[] | null | undefined): string {
  if (!categories || categories.length === 0) return 'Other'
  const cats = categories.map(c => c.toLowerCase())

  if (cats.some(c => c.includes('landscap') || c.includes('garden') || c.includes('lawn'))) return 'Landscaping'
  if (cats.some(c => c.includes('electric') || c.includes('gas') || c.includes('water') || c.includes('utility') || c.includes('utilities'))) return 'Utilities'
  if (cats.some(c => c.includes('insurance'))) return 'Insurance'
  if (cats.some(c => c.includes('legal') || c.includes('attorney') || c.includes('audit') || c.includes('accounting'))) return 'Legal'
  if (cats.some(c => c.includes('pool') || c.includes('recreation') || c.includes('gym') || c.includes('amenity'))) return 'Amenities'
  if (cats.some(c => c.includes('repair') || c.includes('maintenance') || c.includes('plumbing') || c.includes('hvac') || c.includes('contractor'))) return 'Maintenance'
  if (cats.some(c => c.includes('management') || c.includes('property mgmt'))) return 'Management'
  if (cats.some(c => c.includes('tax') || c.includes('government') || c.includes('office'))) return 'Administrative'
  if (cats.some(c => c.includes('security'))) return 'Security'
  if (cats.some(c => c.includes('transfer'))) return 'Transfer'
  if (cats.some(c => c.includes('payment') || c.includes('deposit'))) return 'Income'

  return categories[1] ?? categories[0] ?? 'Other'
}
