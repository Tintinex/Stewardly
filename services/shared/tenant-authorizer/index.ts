/// <reference types="node" />
import type { APIGatewayRequestAuthorizerEventV2, APIGatewaySimpleAuthorizerWithContextResult } from 'aws-lambda'
import * as https from 'https'
import * as crypto from 'crypto'

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? ''
const COGNITO_REGION = process.env.COGNITO_REGION ?? 'us-east-1'

interface JwksKey {
  kid: string
  n: string
  e: string
  alg: string
  kty: string
  use: string
}

interface JwksResponse {
  keys: JwksKey[]
}

interface JwtHeader {
  kid: string
  alg: string
}

interface JwtClaims {
  sub: string
  'custom:hoaId'?: string
  'custom:role'?: string
  'custom:unitId'?: string
  email?: string
  exp: number
  iat: number
  iss: string
  token_use: string
}

// Module-scope JWKS cache (reused across warm Lambda invocations)
let jwksCache: Map<string, JwksKey> | null = null
let jwksCacheExpiry = 0

async function fetchJwks(): Promise<Map<string, JwksKey>> {
  const now = Date.now()
  if (jwksCache && now < jwksCacheExpiry) {
    return jwksCache
  }

  const jwksUrl = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`

  const data = await new Promise<string>((resolve, reject) => {
    https.get(jwksUrl, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    }).on('error', reject)
  })

  const jwks = JSON.parse(data) as JwksResponse
  jwksCache = new Map(jwks.keys.map(k => [k.kid, k]))
  jwksCacheExpiry = now + 3600000 // 1 hour
  return jwksCache
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  return Buffer.from(padded, 'base64')
}

function parseJwt(token: string): { header: JwtHeader; claims: JwtClaims; signature: Buffer; signingInput: string } {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf-8')) as JwtHeader
  const claims = JSON.parse(base64UrlDecode(parts[1]).toString('utf-8')) as JwtClaims
  const signature = base64UrlDecode(parts[2])
  const signingInput = `${parts[0]}.${parts[1]}`
  return { header, claims, signature, signingInput }
}

function rsaPublicKeyFromJwk(key: JwksKey): crypto.KeyObject {
  const n = base64UrlDecode(key.n)
  const e = base64UrlDecode(key.e)
  return crypto.createPublicKey({
    key: {
      kty: 'RSA',
      n: key.n,
      e: key.e,
    },
    format: 'jwk',
  })
}

function verifySignature(signingInput: string, signature: Buffer, publicKey: crypto.KeyObject): boolean {
  const verify = crypto.createVerify('SHA256')
  verify.update(signingInput)
  return verify.verify(publicKey, signature)
}

interface AuthorizerContext {
  hoaId: string
  userId: string
  role: string
}

export const handler = async (
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>> => {
  const deny = { isAuthorized: false, context: { hoaId: '', userId: '', role: '' } }

  try {
    const authHeader = event.headers?.authorization ?? event.headers?.Authorization
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn('Missing or invalid Authorization header')
      return deny
    }

    const token = authHeader.slice(7)
    const { header, claims, signature, signingInput } = parseJwt(token)

    // Check expiry
    if (Date.now() / 1000 > claims.exp) {
      console.warn('Token expired')
      return deny
    }

    // Check issuer
    const expectedIssuer = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
    if (claims.iss !== expectedIssuer) {
      console.warn('Invalid token issuer')
      return deny
    }

    // Check token_use
    if (claims.token_use !== 'access') {
      console.warn('Invalid token_use, expected access token')
      return deny
    }

    // Fetch JWKS and verify signature
    const jwks = await fetchJwks()
    const jwk = jwks.get(header.kid)
    if (!jwk) {
      console.warn(`No matching JWK found for kid: ${header.kid}`)
      return deny
    }

    const publicKey = rsaPublicKeyFromJwk(jwk)
    const valid = verifySignature(signingInput, signature, publicKey)
    if (!valid) {
      console.warn('Token signature verification failed')
      return deny
    }

    const userId = claims.sub
    const role = claims['custom:role'] ?? 'homeowner'

    // Superadmin bypass — these users have no hoaId but are platform operators
    if (role === 'superadmin') {
      return { isAuthorized: true, context: { hoaId: '', userId, role } }
    }

    const hoaId = claims['custom:hoaId']
    if (!hoaId) {
      console.warn('Token missing custom:hoaId claim')
      return deny
    }

    return {
      isAuthorized: true,
      context: { hoaId, userId, role },
    }
  } catch (err) {
    console.error('Authorizer error:', err)
    return deny
  }
}
