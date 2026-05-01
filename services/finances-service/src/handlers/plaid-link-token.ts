import * as r from '../../../shared/response'
import * as repo from '../repository'
import { getPlaidClient } from '../plaid-client'
import { CountryCode, Products } from 'plaid'

/** POST /api/finances/plaid/link-token
 *  Body (optional): { itemId?: string; redirectUri?: string }
 *  - itemId: creates an update-mode token for re-auth
 *  - redirectUri: required for OAuth institutions (Chase, BoA, etc.)
 */
export async function handleCreateLinkToken(
  body: string | null,
  hoaId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can connect bank accounts')
  }

  let accessToken: string | undefined
  let redirectUri: string | undefined

  if (body) {
    try {
      const parsed = JSON.parse(body) as { itemId?: string; redirectUri?: string }
      if (parsed.itemId) {
        const item = await repo.getPlaidItemWithToken(hoaId, parsed.itemId)
        if (!item) return r.notFound('Plaid item not found')
        accessToken = item.accessToken
      }
      if (parsed.redirectUri) {
        redirectUri = parsed.redirectUri
      }
    } catch {
      return r.badRequest('Invalid JSON')
    }
  }

  const plaid = await getPlaidClient()

  const request: Parameters<typeof plaid.linkTokenCreate>[0] = {
    user: { client_user_id: hoaId },
    client_name: 'Stewardly HOA',
    products: accessToken ? undefined : [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(accessToken ? { access_token: accessToken } : {}),
    // redirect_uri is required for OAuth institutions (Chase, BoA, Wells Fargo, etc.)
    // Must be registered in the Plaid dashboard under Team Settings → API → Allowed redirect URIs
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  }

  const response = await plaid.linkTokenCreate(request)
  return r.ok({ linkToken: response.data.link_token })
}
