import * as r from '../../../shared/response'
import { getSubscriptionsData, updateSubscriptionTier, extendTrialDays, writeAuditLog } from '../repository'

export async function handleGetSubscriptions(): Promise<r.ApiResponse> {
  const data = await getSubscriptionsData()
  return r.ok(data)
}

export async function handleUpdateSubscription(
  hoaId: string,
  body: string | null,
  adminUserId: string,
): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body required')
  const { tier } = JSON.parse(body) as { tier?: string }
  if (!tier) return r.badRequest('tier is required')
  const validTiers = ['starter', 'growth', 'pro']
  if (!validTiers.includes(tier)) return r.badRequest(`tier must be one of: ${validTiers.join(', ')}`)

  await updateSubscriptionTier(hoaId, tier)
  await writeAuditLog(adminUserId, 'UPDATE_SUBSCRIPTION_TIER', 'hoa', hoaId, { tier })
  return r.noContent()
}

export async function handleExtendTrial(
  hoaId: string,
  body: string | null,
  adminUserId: string,
): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body required')
  const { days } = JSON.parse(body) as { days?: number }
  if (!days || days < 1 || days > 90) return r.badRequest('days must be between 1 and 90')

  await extendTrialDays(hoaId, days)
  await writeAuditLog(adminUserId, 'EXTEND_TRIAL', 'hoa', hoaId, { days })
  return r.noContent()
}
