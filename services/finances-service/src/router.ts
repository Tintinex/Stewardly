import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleGetSummary } from './handlers/get-summary'
import { handleGetBudget } from './handlers/get-budget'
import { handleUpsertBudget, handleApproveBudget } from './handlers/upsert-budget'
import { handleImportBudget } from './handlers/import-budget'
import { handleListTransactions } from './handlers/list-transactions'
import { handleCreateTransaction } from './handlers/create-transaction'
import { handleUpdateTransaction } from './handlers/update-transaction'
import { handleDeleteTransaction } from './handlers/delete-transaction'
import { handleImportTransactions } from './handlers/import-transactions'
import { handleListAccounts } from './handlers/list-accounts'
import { handleCreateAccount } from './handlers/create-account'
import { handleUpdateAccount } from './handlers/update-account'
import { handleDeleteAccount } from './handlers/delete-account'
import { handleListAssessments } from './handlers/list-assessments'
import { handleCreateAssessment, handleBulkAssessments } from './handlers/create-assessment'
import { handleUpdateAssessment, handleDeleteAssessment } from './handlers/update-assessment'
import { handleGetAnalytics } from './handlers/get-analytics'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, role } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const path = event.requestContext.http.path

  // ── Summary ──────────────────────────────────────────────────────────────────
  if (method === 'GET' && path.endsWith('/finances')) return handleGetSummary(hoaId)

  // ── Analytics ─────────────────────────────────────────────────────────────────
  if (method === 'GET' && path.endsWith('/finances/analytics')) return handleGetAnalytics(hoaId)

  // ── Budget ────────────────────────────────────────────────────────────────────
  if (method === 'GET'  && path.endsWith('/finances/budget'))        return handleGetBudget(hoaId, event.queryStringParameters?.year)
  if (method === 'POST' && path.endsWith('/finances/budget'))        return handleUpsertBudget(event.body ?? null, hoaId, role)
  if (method === 'POST' && path.endsWith('/finances/budget/import')) return handleImportBudget(event.body ?? null, hoaId, role)

  const budgetApproveMatch = path.match(/\/finances\/budget\/([^/]+)\/approve$/)
  if (budgetApproveMatch && method === 'POST') return handleApproveBudget(budgetApproveMatch[1], hoaId, role)

  // ── Transactions ──────────────────────────────────────────────────────────────
  if (method === 'GET'  && path.endsWith('/finances/transactions'))          return handleListTransactions(event, hoaId)
  if (method === 'POST' && path.endsWith('/finances/transactions'))          return handleCreateTransaction(event.body ?? null, hoaId, role)
  if (method === 'POST' && path.endsWith('/finances/transactions/import'))   return handleImportTransactions(event.body ?? null, hoaId, role)

  const txnMatch = path.match(/\/finances\/transactions\/([^/]+)$/)
  if (txnMatch && method === 'PATCH')  return handleUpdateTransaction(event.body ?? null, hoaId, txnMatch[1], role)
  if (txnMatch && method === 'DELETE') return handleDeleteTransaction(hoaId, txnMatch[1], role)

  // ── Accounts ──────────────────────────────────────────────────────────────────
  if (method === 'GET'  && path.endsWith('/finances/accounts')) return handleListAccounts(hoaId)
  if (method === 'POST' && path.endsWith('/finances/accounts')) return handleCreateAccount(event.body ?? null, hoaId, role)

  const acctMatch = path.match(/\/finances\/accounts\/([^/]+)$/)
  if (acctMatch && method === 'PATCH')  return handleUpdateAccount(event.body ?? null, hoaId, acctMatch[1], role)
  if (acctMatch && method === 'DELETE') return handleDeleteAccount(hoaId, acctMatch[1], role)

  // ── Assessments ───────────────────────────────────────────────────────────────
  if (method === 'GET'  && path.endsWith('/finances/assessments'))      return handleListAssessments(event, hoaId)
  if (method === 'POST' && path.endsWith('/finances/assessments'))      return handleCreateAssessment(event.body ?? null, hoaId, role)
  if (method === 'POST' && path.endsWith('/finances/assessments/bulk')) return handleBulkAssessments(event.body ?? null, hoaId, role)

  const assessmentMatch = path.match(/\/finances\/assessments\/([^/]+)$/)
  if (assessmentMatch && method === 'PATCH')  return handleUpdateAssessment(event.body ?? null, hoaId, assessmentMatch[1], role)
  if (assessmentMatch && method === 'DELETE') return handleDeleteAssessment(hoaId, assessmentMatch[1], role)

  return r.badRequest(`Unsupported route: ${method} ${path}`)
}
