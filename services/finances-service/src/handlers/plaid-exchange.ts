import * as r from '../../../shared/response'
import * as repo from '../repository'
import { getPlaidClient, mapPlaidCategory } from '../plaid-client'
import { inferCategory } from '../categorize'
import type { PlaidAccountInput } from '../repository'

/** POST /api/finances/plaid/exchange
 *  Body: { publicToken: string }
 */
export async function handleExchangeToken(
  body: string | null,
  hoaId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can connect bank accounts')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { publicToken: string }
  try {
    parsed = JSON.parse(body) as { publicToken: string }
  } catch {
    return r.badRequest('Invalid JSON')
  }
  if (!parsed.publicToken) return r.badRequest('publicToken is required')

  const plaid = await getPlaidClient()

  // Exchange public token for access token
  const exchangeResponse = await plaid.itemPublicTokenExchange({
    public_token: parsed.publicToken,
  })
  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data

  // Fetch institution info
  const itemResponse = await plaid.itemGet({ access_token: accessToken })
  const institutionId = itemResponse.data.item.institution_id ?? 'unknown'

  let institutionName = 'Unknown Bank'
  try {
    const instResponse = await plaid.institutionsGetById({
      institution_id: institutionId,
      country_codes: ['US' as never],
    })
    institutionName = instResponse.data.institution.name
  } catch {
    // Non-fatal — use fallback name
  }

  // Persist the Plaid item
  const plaidItem = await repo.createPlaidItem(hoaId, itemId, accessToken, institutionId, institutionName)

  // Fetch accounts
  const accountsResponse = await plaid.accountsGet({ access_token: accessToken })
  const plaidAccounts: PlaidAccountInput[] = accountsResponse.data.accounts.map(a => ({
    plaidAccountId: a.account_id,
    accountName: a.name,
    accountType: normalizeAccountType(a.type, a.subtype),
    balance: a.balances.current ?? a.balances.available ?? 0,
    currency: (a.balances.iso_currency_code ?? 'USD').toUpperCase(),
    institutionName,
  }))

  const accounts = await repo.upsertPlaidAccounts(hoaId, plaidItem.id, plaidAccounts)

  // Kick off initial transaction sync
  let added = 0
  try {
    const syncResult = await syncTransactions(hoaId, plaidItem.id, accessToken, null, plaid)
    added = syncResult.added
    await repo.updatePlaidItemCursor(plaidItem.id, syncResult.nextCursor)
  } catch (err) {
    console.error('[plaid-exchange] Initial transaction sync failed:', err)
    // Non-fatal — accounts are connected, sync can be retried
  }

  return r.created({
    item: {
      id: plaidItem.id,
      institutionName,
      status: 'active',
      errorCode: null,
      lastSyncedAt: new Date().toISOString(),
      accountCount: accounts.length,
    },
    accounts,
    transactionsAdded: added,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeAccountType(type: string, subtype: string | null | undefined): string {
  if (type === 'depository') {
    if (subtype === 'checking') return 'checking'
    if (subtype === 'savings' || subtype === 'money market') return 'savings'
    if (subtype === 'money market') return 'money_market'
    return 'checking'
  }
  return 'other'
}

interface PlaidClient {
  transactionsSync: (req: { access_token: string; cursor?: string }) => Promise<{
    data: {
      added: Array<{
        transaction_id: string
        account_id: string
        name: string
        merchant_name?: string | null
        amount: number
        date: string
        category?: string[] | null
      }>
      modified: Array<{
        transaction_id: string
        account_id: string
        name: string
        merchant_name?: string | null
        amount: number
        date: string
        category?: string[] | null
      }>
      removed: Array<{ transaction_id: string }>
      next_cursor: string
      has_more: boolean
    }
  }>
}

export async function syncTransactions(
  hoaId: string,
  plaidItemDbId: string,
  accessToken: string,
  cursor: string | null,
  plaid: PlaidClient,
): Promise<{ added: number; modified: number; removed: number; nextCursor: string }> {
  let totalAdded = 0
  let totalModified = 0
  let totalRemoved = 0
  let currentCursor = cursor ?? undefined
  let hasMore = true

  while (hasMore) {
    const response = await plaid.transactionsSync({
      access_token: accessToken,
      ...(currentCursor ? { cursor: currentCursor } : {}),
    })

    const { added, modified, removed, next_cursor, has_more } = response.data

    // Process added + modified
    const toUpsert: import('../repository').PlaidTransactionInput[] = []
    for (const txn of [...added, ...modified]) {
      const acct = await repo.getAccountByPlaidId(txn.account_id)
      if (!acct || acct.hoaId !== hoaId) continue

      // Plaid: positive amount = money out (debit), negative = money in (credit)
      const type = txn.amount > 0 ? 'debit' : 'credit'
      const amount = Math.abs(txn.amount)

      // Use Plaid's category first; fall back to keyword inference when it can't determine one
      const plaidCat = mapPlaidCategory(txn.category)
      const category = plaidCat === 'Other'
        ? inferCategory(txn.name, txn.merchant_name)
        : plaidCat

      toUpsert.push({
        plaidTxnId: txn.transaction_id,
        accountId: acct.id,
        amount,
        description: txn.name,
        vendor: txn.merchant_name ?? null,
        category,
        date: txn.date,
        type,
      })
    }

    if (toUpsert.length > 0) {
      const result = await repo.upsertPlaidTransactions(hoaId, toUpsert)
      totalAdded += result.added
      totalModified += result.modified
    }

    // Process removed
    if (removed.length > 0) {
      const removedCount = await repo.removePlaidTransactions(removed.map(r => r.transaction_id))
      totalRemoved += removedCount
    }

    currentCursor = next_cursor
    hasMore = has_more
  }

  // Sync budget actuals once after all pages are processed
  if (totalAdded + totalModified + totalRemoved > 0) {
    await repo.syncCurrentYearBudgetActuals(hoaId)
  }

  return { added: totalAdded, modified: totalModified, removed: totalRemoved, nextCursor: currentCursor ?? '' }
}
