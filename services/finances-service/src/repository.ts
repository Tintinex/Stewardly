import { query, queryOne, execute, param } from '../../shared/db/client'
import type {
  BudgetLineItem, BudgetWithLineItems, Account, Transaction,
  Assessment, FinancialSummary, AnalyticsData, TransactionFilters,
  CreateBudgetInput, CreateTransactionInput, CreateAccountInput,
  CreateAssessmentInput,
} from './types'

const CHART_COLORS = ['#0C1F3F', '#0D9E8A', '#F5A623', '#3DBDAE', '#4D729A', '#64CBBF', '#9DAFC9', '#C6D0E4']

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getFinancialSummary(hoaId: string): Promise<FinancialSummary> {
  const currentYear = new Date().getFullYear()

  const budget = await queryOne<{ id: string; totalAmount: number; fiscalYear: number }>(
    `SELECT id, total_amount AS "totalAmount", fiscal_year AS "fiscalYear" FROM budgets
     WHERE hoa_id = :hoaId AND fiscal_year = :year
     ORDER BY created_at DESC LIMIT 1`,
    [param.string('hoaId', hoaId), param.int('year', currentYear)],
  )

  const lineItems = budget
    ? await query<BudgetLineItem>(
        `SELECT id, budget_id AS "budgetId", hoa_id AS "hoaId", category, description,
                budgeted_amount AS "budgetedAmount", actual_amount AS "actualAmount",
                (budgeted_amount - actual_amount) AS variance
         FROM budget_line_items
         WHERE budget_id = :budgetId AND hoa_id = :hoaId
         ORDER BY category ASC`,
        [param.string('budgetId', budget.id), param.string('hoaId', hoaId)],
      )
    : []

  const [reserveAccount, ytdExpenses, ytdIncome, expenseTrend, expenseBreakdown, accounts, recentTransactions] =
    await Promise.all([
      queryOne<{ balance: number }>(
        `SELECT balance FROM accounts WHERE hoa_id = :hoaId AND account_type = 'savings' ORDER BY updated_at DESC LIMIT 1`,
        [param.string('hoaId', hoaId)],
      ),
      queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions
         WHERE hoa_id = :hoaId AND type = 'debit' AND EXTRACT(YEAR FROM date) = :year`,
        [param.string('hoaId', hoaId), param.int('year', currentYear)],
      ),
      queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions
         WHERE hoa_id = :hoaId AND type = 'credit' AND EXTRACT(YEAR FROM date) = :year`,
        [param.string('hoaId', hoaId), param.int('year', currentYear)],
      ),
      query<{ month: string; amount: number; income: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YY') AS month,
                COALESCE(SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END), 0) AS amount,
                COALESCE(SUM(CASE WHEN type = 'credit' THEN ABS(amount) ELSE 0 END), 0) AS income
         FROM transactions
         WHERE hoa_id = :hoaId AND date >= CURRENT_DATE - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', date)
         ORDER BY DATE_TRUNC('month', date) ASC`,
        [param.string('hoaId', hoaId)],
      ),
      query<{ category: string; amount: number }>(
        `SELECT category, COALESCE(SUM(ABS(amount)), 0) AS amount
         FROM transactions
         WHERE hoa_id = :hoaId AND type = 'debit' AND EXTRACT(YEAR FROM date) = :year
         GROUP BY category ORDER BY amount DESC`,
        [param.string('hoaId', hoaId), param.int('year', currentYear)],
      ),
      query<Account>(
        `SELECT id, institution_name AS "institutionName", account_name AS "accountName",
                account_type AS "accountType", balance, currency, last_synced_at AS "lastSyncedAt"
         FROM accounts WHERE hoa_id = :hoaId ORDER BY account_type ASC`,
        [param.string('hoaId', hoaId)],
      ),
      query<Transaction>(
        `SELECT t.id, t.account_id AS "accountId", a.account_name AS "accountName",
                t.amount, t.description, t.vendor, t.category, t.date, t.type,
                t.notes, t.is_manual AS "isManual", t.created_at AS "createdAt"
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         WHERE t.hoa_id = :hoaId ORDER BY t.date DESC, t.created_at DESC LIMIT 20`,
        [param.string('hoaId', hoaId)],
      ),
    ])

  return {
    totalBudget: budget?.totalAmount ?? 0,
    ytdExpenses: ytdExpenses?.total ?? 0,
    ytdIncome: ytdIncome?.total ?? 0,
    reserveFundBalance: reserveAccount?.balance ?? 0,
    lineItems,
    expenseTrend,
    expenseBreakdown: expenseBreakdown.map((item, idx) => ({
      ...item,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    })),
    accounts,
    recentTransactions,
  }
}

// ── Budget ────────────────────────────────────────────────────────────────────

export async function getBudget(hoaId: string, fiscalYear?: number): Promise<BudgetWithLineItems | null> {
  const year = fiscalYear ?? new Date().getFullYear()
  const budget = await queryOne<{ id: string; hoaId: string; fiscalYear: number; totalAmount: number; approvedAt: string | null; createdAt: string }>(
    `SELECT id, hoa_id AS "hoaId", fiscal_year AS "fiscalYear",
            total_amount AS "totalAmount", approved_at AS "approvedAt", created_at AS "createdAt"
     FROM budgets WHERE hoa_id = :hoaId AND fiscal_year = :year
     ORDER BY created_at DESC LIMIT 1`,
    [param.string('hoaId', hoaId), param.int('year', year)],
  )
  if (!budget) return null

  const lineItems = await query<BudgetLineItem>(
    `SELECT id, budget_id AS "budgetId", hoa_id AS "hoaId", category, description,
            budgeted_amount AS "budgetedAmount", actual_amount AS "actualAmount",
            (budgeted_amount - actual_amount) AS variance
     FROM budget_line_items WHERE budget_id = :budgetId AND hoa_id = :hoaId ORDER BY category ASC`,
    [param.string('budgetId', budget.id), param.string('hoaId', hoaId)],
  )
  return { ...budget, lineItems }
}

export async function upsertBudgetWithLineItems(hoaId: string, input: CreateBudgetInput): Promise<BudgetWithLineItems> {
  const { fiscalYear, lineItems } = input
  const totalAmount = lineItems.reduce((s, i) => s + i.budgetedAmount, 0)

  // Upsert budget record
  await execute(
    `INSERT INTO budgets (id, hoa_id, fiscal_year, total_amount)
     VALUES (gen_random_uuid(), :hoaId, :fiscalYear, :totalAmount)
     ON CONFLICT (hoa_id, fiscal_year) DO UPDATE SET total_amount = :totalAmount, updated_at = NOW()`,
    [param.string('hoaId', hoaId), param.int('fiscalYear', fiscalYear), param.double('totalAmount', totalAmount)],
  )

  const budget = await queryOne<{ id: string }>(
    `SELECT id FROM budgets WHERE hoa_id = :hoaId AND fiscal_year = :fiscalYear ORDER BY created_at DESC LIMIT 1`,
    [param.string('hoaId', hoaId), param.int('fiscalYear', fiscalYear)],
  )
  if (!budget) throw new Error('Budget not found after upsert')

  // Delete existing line items and re-insert
  await execute(
    `DELETE FROM budget_line_items WHERE budget_id = :budgetId AND hoa_id = :hoaId`,
    [param.string('budgetId', budget.id), param.string('hoaId', hoaId)],
  )

  for (const item of lineItems) {
    await execute(
      `INSERT INTO budget_line_items (id, budget_id, hoa_id, category, description, budgeted_amount, actual_amount)
       VALUES (gen_random_uuid(), :budgetId, :hoaId, :category, :description, :budgetedAmount, 0)`,
      [
        param.string('budgetId', budget.id),
        param.string('hoaId', hoaId),
        param.string('category', item.category),
        param.string('description', item.description ?? ''),
        param.double('budgetedAmount', item.budgetedAmount),
      ],
    )
  }

  // Sync actual amounts from transactions
  await syncBudgetActuals(hoaId, budget.id, fiscalYear)

  return (await getBudget(hoaId, fiscalYear))!
}

export async function approveBudget(hoaId: string, budgetId: string): Promise<void> {
  await execute(
    `UPDATE budgets SET approved_at = NOW(), updated_at = NOW() WHERE id = :budgetId AND hoa_id = :hoaId`,
    [param.string('budgetId', budgetId), param.string('hoaId', hoaId)],
  )
}

/** Sync actual_amount on budget line items from transactions */
async function syncBudgetActuals(hoaId: string, budgetId: string, fiscalYear: number): Promise<void> {
  await execute(
    `UPDATE budget_line_items bli
     SET actual_amount = COALESCE((
       SELECT SUM(ABS(t.amount))
       FROM transactions t
       WHERE t.hoa_id = :hoaId
         AND t.type = 'debit'
         AND EXTRACT(YEAR FROM t.date) = :fiscalYear
         AND t.category = bli.category
     ), 0),
     updated_at = NOW()
     WHERE bli.budget_id = :budgetId AND bli.hoa_id = :hoaId`,
    [param.string('hoaId', hoaId), param.string('budgetId', budgetId), param.int('fiscalYear', fiscalYear)],
  )
}

export async function listBudgetYears(hoaId: string): Promise<number[]> {
  const rows = await query<{ fiscalYear: number }>(
    `SELECT fiscal_year AS "fiscalYear" FROM budgets WHERE hoa_id = :hoaId ORDER BY fiscal_year DESC`,
    [param.string('hoaId', hoaId)],
  )
  return rows.map(r => r.fiscalYear)
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listTransactions(hoaId: string, filters: TransactionFilters = {}): Promise<{ transactions: Transaction[]; total: number }> {
  const conditions: string[] = ['t.hoa_id = :hoaId']
  const params: ReturnType<typeof param.string>[] = [param.string('hoaId', hoaId)]

  if (filters.startDate) { conditions.push('t.date >= :startDate'); params.push(param.string('startDate', filters.startDate)) }
  if (filters.endDate) { conditions.push('t.date <= :endDate'); params.push(param.string('endDate', filters.endDate)) }
  if (filters.category) { conditions.push('t.category = :category'); params.push(param.string('category', filters.category)) }
  if (filters.type) { conditions.push("t.type = :type"); params.push(param.string('type', filters.type)) }
  if (filters.accountId) { conditions.push('t.account_id = :accountId'); params.push(param.string('accountId', filters.accountId)) }
  if (filters.search) {
    conditions.push("(t.description ILIKE :search OR t.vendor ILIKE :search OR t.category ILIKE :search)")
    params.push(param.string('search', `%${filters.search}%`))
  }

  const where = conditions.join(' AND ')
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0

  const [transactions, countRow] = await Promise.all([
    query<Transaction>(
      `SELECT t.id, t.account_id AS "accountId", a.account_name AS "accountName",
              t.amount, t.description, t.vendor, t.category, t.date, t.type,
              t.notes, t.is_manual AS "isManual", t.created_at AS "createdAt"
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE ${where}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT :limit OFFSET :offset`,
      [...params, param.int('limit', limit), param.int('offset', offset)],
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM transactions t WHERE ${where}`,
      params,
    ),
  ])

  return { transactions, total: countRow?.count ?? 0 }
}

export async function createTransaction(hoaId: string, input: CreateTransactionInput): Promise<Transaction> {
  const id = await queryOne<{ id: string }>(
    `INSERT INTO transactions (id, hoa_id, account_id, amount, description, vendor, category, date, type, notes, is_manual)
     VALUES (gen_random_uuid(), :hoaId, :accountId, :amount, :description, :vendor, :category, :date, :type, :notes, true)
     RETURNING id`,
    [
      param.string('hoaId', hoaId),
      param.string('accountId', input.accountId),
      param.double('amount', input.amount),
      param.string('description', input.description),
      param.stringOrNull('vendor', input.vendor ?? null),
      param.string('category', input.category),
      param.string('date', input.date),
      param.string('type', input.type),
      param.stringOrNull('notes', input.notes ?? null),
    ],
  )
  if (!id) throw new Error('Failed to create transaction')

  // Update account balance
  const balanceDelta = input.type === 'debit' ? -Math.abs(input.amount) : Math.abs(input.amount)
  await execute(
    `UPDATE accounts SET balance = balance + :delta, updated_at = NOW() WHERE id = :accountId AND hoa_id = :hoaId`,
    [param.double('delta', balanceDelta), param.string('accountId', input.accountId), param.string('hoaId', hoaId)],
  )

  // Sync budget actuals for the fiscal year of this transaction
  const fiscalYear = new Date(input.date).getFullYear()
  const budget = await queryOne<{ id: string }>(
    `SELECT id FROM budgets WHERE hoa_id = :hoaId AND fiscal_year = :year ORDER BY created_at DESC LIMIT 1`,
    [param.string('hoaId', hoaId), param.int('year', fiscalYear)],
  )
  if (budget) await syncBudgetActuals(hoaId, budget.id, fiscalYear)

  const txn = await queryOne<Transaction>(
    `SELECT t.id, t.account_id AS "accountId", a.account_name AS "accountName",
            t.amount, t.description, t.vendor, t.category, t.date, t.type,
            t.notes, t.is_manual AS "isManual", t.created_at AS "createdAt"
     FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id WHERE t.id = :id`,
    [param.string('id', id.id)],
  )
  return txn!
}

export async function updateTransaction(
  hoaId: string,
  transactionId: string,
  updates: Partial<Pick<CreateTransactionInput, 'description' | 'vendor' | 'category' | 'notes'>>,
): Promise<Transaction | null> {
  const sets: string[] = ['updated_at = NOW()']
  const params: ReturnType<typeof param.string>[] = [
    param.string('id', transactionId),
    param.string('hoaId', hoaId),
  ]

  if (updates.description !== undefined) { sets.push('description = :description'); params.push(param.string('description', updates.description)) }
  if (updates.vendor !== undefined) { sets.push('vendor = :vendor'); params.push(param.stringOrNull('vendor', updates.vendor ?? null)) }
  if (updates.category !== undefined) { sets.push('category = :category'); params.push(param.string('category', updates.category)) }
  if (updates.notes !== undefined) { sets.push('notes = :notes'); params.push(param.stringOrNull('notes', updates.notes ?? null)) }

  if (sets.length === 1) return getTransactionById(hoaId, transactionId)

  await execute(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = :id AND hoa_id = :hoaId`,
    params,
  )
  return getTransactionById(hoaId, transactionId)
}

export async function deleteTransaction(hoaId: string, transactionId: string): Promise<boolean> {
  // Reverse balance impact before deleting
  const txn = await queryOne<{ accountId: string; amount: number; type: string }>(
    `SELECT account_id AS "accountId", amount, type FROM transactions WHERE id = :id AND hoa_id = :hoaId`,
    [param.string('id', transactionId), param.string('hoaId', hoaId)],
  )
  if (!txn) return false

  const reverseDelta = txn.type === 'debit' ? Math.abs(txn.amount) : -Math.abs(txn.amount)
  await execute(
    `UPDATE accounts SET balance = balance + :delta, updated_at = NOW() WHERE id = :accountId`,
    [param.double('delta', reverseDelta), param.string('accountId', txn.accountId)],
  )
  await execute(
    `DELETE FROM transactions WHERE id = :id AND hoa_id = :hoaId`,
    [param.string('id', transactionId), param.string('hoaId', hoaId)],
  )
  return true
}

export async function getTransactionById(hoaId: string, id: string): Promise<Transaction | null> {
  return queryOne<Transaction>(
    `SELECT t.id, t.account_id AS "accountId", a.account_name AS "accountName",
            t.amount, t.description, t.vendor, t.category, t.date, t.type,
            t.notes, t.is_manual AS "isManual", t.created_at AS "createdAt"
     FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.id = :id AND t.hoa_id = :hoaId`,
    [param.string('id', id), param.string('hoaId', hoaId)],
  )
}

export async function getTransactionCategories(hoaId: string): Promise<string[]> {
  const rows = await query<{ category: string }>(
    `SELECT DISTINCT category FROM transactions WHERE hoa_id = :hoaId ORDER BY category ASC`,
    [param.string('hoaId', hoaId)],
  )
  return rows.map(r => r.category)
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function listAccounts(hoaId: string): Promise<Account[]> {
  return query<Account>(
    `SELECT id, institution_name AS "institutionName", account_name AS "accountName",
            account_type AS "accountType", balance, currency, last_synced_at AS "lastSyncedAt"
     FROM accounts WHERE hoa_id = :hoaId ORDER BY account_type ASC, account_name ASC`,
    [param.string('hoaId', hoaId)],
  )
}

export async function createAccount(hoaId: string, input: CreateAccountInput): Promise<Account> {
  const id = await queryOne<{ id: string }>(
    `INSERT INTO accounts (id, hoa_id, institution_name, account_name, account_type, balance, currency)
     VALUES (gen_random_uuid(), :hoaId, :institutionName, :accountName, :accountType, :balance, :currency)
     RETURNING id`,
    [
      param.string('hoaId', hoaId),
      param.string('institutionName', input.institutionName),
      param.string('accountName', input.accountName),
      param.string('accountType', input.accountType),
      param.double('balance', input.balance),
      param.string('currency', input.currency ?? 'USD'),
    ],
  )
  if (!id) throw new Error('Failed to create account')
  return (await getAccountById(hoaId, id.id))!
}

export async function updateAccount(hoaId: string, accountId: string, updates: Partial<CreateAccountInput>): Promise<Account | null> {
  const sets: string[] = ['updated_at = NOW()', 'last_synced_at = NOW()']
  const params: ReturnType<typeof param.string>[] = [
    param.string('id', accountId),
    param.string('hoaId', hoaId),
  ]

  if (updates.accountName !== undefined) { sets.push('account_name = :accountName'); params.push(param.string('accountName', updates.accountName)) }
  if (updates.institutionName !== undefined) { sets.push('institution_name = :institutionName'); params.push(param.string('institutionName', updates.institutionName)) }
  if (updates.accountType !== undefined) { sets.push('account_type = :accountType'); params.push(param.string('accountType', updates.accountType)) }
  if (updates.balance !== undefined) { sets.push('balance = :balance'); params.push(param.double('balance', updates.balance)) }

  await execute(
    `UPDATE accounts SET ${sets.join(', ')} WHERE id = :id AND hoa_id = :hoaId`,
    params,
  )
  return getAccountById(hoaId, accountId)
}

export async function deleteAccount(hoaId: string, accountId: string): Promise<boolean> {
  const result = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM transactions WHERE account_id = :accountId AND hoa_id = :hoaId`,
    [param.string('accountId', accountId), param.string('hoaId', hoaId)],
  )
  if ((result?.count ?? 0) > 0) return false // Has transactions — refuse delete

  await execute(
    `DELETE FROM accounts WHERE id = :id AND hoa_id = :hoaId`,
    [param.string('id', accountId), param.string('hoaId', hoaId)],
  )
  return true
}

export async function getAccountById(hoaId: string, id: string): Promise<Account | null> {
  return queryOne<Account>(
    `SELECT id, institution_name AS "institutionName", account_name AS "accountName",
            account_type AS "accountType", balance, currency, last_synced_at AS "lastSyncedAt"
     FROM accounts WHERE id = :id AND hoa_id = :hoaId`,
    [param.string('id', id), param.string('hoaId', hoaId)],
  )
}

// ── Assessments ───────────────────────────────────────────────────────────────

export async function listAssessments(hoaId: string, status?: string): Promise<Assessment[]> {
  const conditions = ['a.hoa_id = :hoaId']
  const params: ReturnType<typeof param.string>[] = [param.string('hoaId', hoaId)]

  if (status && status !== 'all') {
    conditions.push('a.status = :status')
    params.push(param.string('status', status))
  }

  return query<Assessment>(
    `SELECT a.id, a.hoa_id AS "hoaId", a.unit_id AS "unitId", u.unit_number AS "unitNumber",
            CONCAT(o.first_name, ' ', o.last_name) AS "ownerName",
            a.amount, a.description, a.due_date AS "dueDate", a.paid_date AS "paidDate",
            a.status, a.notes, a.created_at AS "createdAt"
     FROM assessments a
     JOIN units u ON u.id = a.unit_id
     LEFT JOIN owners o ON o.unit_id = a.unit_id AND o.deleted_at IS NULL
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.due_date DESC, u.unit_number ASC`,
    params,
  )
}

export async function createAssessment(hoaId: string, input: CreateAssessmentInput): Promise<Assessment> {
  const id = await queryOne<{ id: string }>(
    `INSERT INTO assessments (id, hoa_id, unit_id, amount, description, due_date, notes, status)
     VALUES (gen_random_uuid(), :hoaId, :unitId, :amount, :description, :dueDate, :notes, 'pending')
     RETURNING id`,
    [
      param.string('hoaId', hoaId),
      param.string('unitId', input.unitId),
      param.double('amount', input.amount),
      param.string('description', input.description),
      param.string('dueDate', input.dueDate),
      param.stringOrNull('notes', input.notes ?? null),
    ],
  )
  if (!id) throw new Error('Failed to create assessment')
  return (await getAssessmentById(hoaId, id.id))!
}

export async function bulkCreateAssessments(
  hoaId: string,
  amount: number,
  description: string,
  dueDate: string,
  notes?: string,
): Promise<{ created: number }> {
  // Get all units for this HOA
  const units = await query<{ id: string }>(
    `SELECT id FROM units WHERE hoa_id = :hoaId ORDER BY unit_number ASC`,
    [param.string('hoaId', hoaId)],
  )

  let created = 0
  for (const unit of units) {
    try {
      await execute(
        `INSERT INTO assessments (id, hoa_id, unit_id, amount, description, due_date, notes, status)
         VALUES (gen_random_uuid(), :hoaId, :unitId, :amount, :description, :dueDate, :notes, 'pending')
         ON CONFLICT DO NOTHING`,
        [
          param.string('hoaId', hoaId),
          param.string('unitId', unit.id),
          param.double('amount', amount),
          param.string('description', description),
          param.string('dueDate', dueDate),
          param.stringOrNull('notes', notes ?? null),
        ],
      )
      created++
    } catch {
      // Skip duplicates or constraint errors
    }
  }
  return { created }
}

export async function updateAssessment(
  hoaId: string,
  assessmentId: string,
  updates: { status?: string; paidDate?: string | null; notes?: string; amount?: number },
): Promise<Assessment | null> {
  const sets: string[] = ['updated_at = NOW()']
  const params: ReturnType<typeof param.string>[] = [
    param.string('id', assessmentId),
    param.string('hoaId', hoaId),
  ]

  if (updates.status !== undefined) { sets.push('status = :status'); params.push(param.string('status', updates.status)) }
  if (updates.paidDate !== undefined) { sets.push('paid_date = :paidDate'); params.push(param.stringOrNull('paidDate', updates.paidDate)) }
  if (updates.notes !== undefined) { sets.push('notes = :notes'); params.push(param.stringOrNull('notes', updates.notes ?? null)) }
  if (updates.amount !== undefined) { sets.push('amount = :amount'); params.push(param.double('amount', updates.amount)) }

  await execute(
    `UPDATE assessments SET ${sets.join(', ')} WHERE id = :id AND hoa_id = :hoaId`,
    params,
  )
  return getAssessmentById(hoaId, assessmentId)
}

export async function markAssessmentsPastDue(hoaId: string): Promise<void> {
  await execute(
    `UPDATE assessments SET status = 'overdue', updated_at = NOW()
     WHERE hoa_id = :hoaId AND status = 'pending' AND due_date < CURRENT_DATE`,
    [param.string('hoaId', hoaId)],
  )
}

export async function deleteAssessment(hoaId: string, assessmentId: string): Promise<boolean> {
  await execute(
    `DELETE FROM assessments WHERE id = :id AND hoa_id = :hoaId AND status != 'paid'`,
    [param.string('id', assessmentId), param.string('hoaId', hoaId)],
  )
  return true
}

export async function getAssessmentById(hoaId: string, id: string): Promise<Assessment | null> {
  return queryOne<Assessment>(
    `SELECT a.id, a.hoa_id AS "hoaId", a.unit_id AS "unitId", u.unit_number AS "unitNumber",
            CONCAT(o.first_name, ' ', o.last_name) AS "ownerName",
            a.amount, a.description, a.due_date AS "dueDate", a.paid_date AS "paidDate",
            a.status, a.notes, a.created_at AS "createdAt"
     FROM assessments a
     JOIN units u ON u.id = a.unit_id
     LEFT JOIN owners o ON o.unit_id = a.unit_id AND o.deleted_at IS NULL
     WHERE a.id = :id AND a.hoa_id = :hoaId`,
    [param.string('id', id), param.string('hoaId', hoaId)],
  )
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalytics(hoaId: string): Promise<AnalyticsData> {
  const currentYear = new Date().getFullYear()

  const [monthlyTrend, categoryRows, cashFlowRow, assessmentRow, vendorRows, budget] = await Promise.all([
    // 12-month trend
    query<{ month: string; expenses: number; income: number }>(
      `SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YY') AS month,
              COALESCE(SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END), 0) AS expenses,
              COALESCE(SUM(CASE WHEN type = 'credit' THEN ABS(amount) ELSE 0 END), 0) AS income
       FROM transactions
       WHERE hoa_id = :hoaId AND date >= CURRENT_DATE - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY DATE_TRUNC('month', date) ASC`,
      [param.string('hoaId', hoaId)],
    ),
    // Category breakdown for current year
    query<{ category: string; amount: number }>(
      `SELECT category, COALESCE(SUM(ABS(amount)), 0) AS amount
       FROM transactions
       WHERE hoa_id = :hoaId AND type = 'debit' AND EXTRACT(YEAR FROM date) = :year
       GROUP BY category ORDER BY amount DESC LIMIT 10`,
      [param.string('hoaId', hoaId), param.int('year', currentYear)],
    ),
    // Cash flow summary
    queryOne<{ totalIncome: number; totalExpenses: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'credit' THEN ABS(amount) ELSE 0 END), 0) AS "totalIncome",
         COALESCE(SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END), 0) AS "totalExpenses"
       FROM transactions
       WHERE hoa_id = :hoaId AND EXTRACT(YEAR FROM date) = :year`,
      [param.string('hoaId', hoaId), param.int('year', currentYear)],
    ),
    // Assessment summary
    queryOne<{ totalExpected: number; totalCollected: number; overdueCount: number }>(
      `SELECT
         COALESCE(SUM(amount), 0) AS "totalExpected",
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS "totalCollected",
         COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS "overdueCount"
       FROM assessments
       WHERE hoa_id = :hoaId AND EXTRACT(YEAR FROM due_date) = :year`,
      [param.string('hoaId', hoaId), param.int('year', currentYear)],
    ),
    // Top vendors
    query<{ vendor: string; amount: number; count: number }>(
      `SELECT COALESCE(vendor, description) AS vendor,
              COALESCE(SUM(ABS(amount)), 0) AS amount,
              COUNT(*) AS count
       FROM transactions
       WHERE hoa_id = :hoaId AND type = 'debit' AND EXTRACT(YEAR FROM date) = :year
         AND (vendor IS NOT NULL OR description IS NOT NULL)
       GROUP BY COALESCE(vendor, description)
       ORDER BY amount DESC LIMIT 8`,
      [param.string('hoaId', hoaId), param.int('year', currentYear)],
    ),
    // Budget for insights
    queryOne<{ id: string; totalAmount: number }>(
      `SELECT id, total_amount AS "totalAmount" FROM budgets
       WHERE hoa_id = :hoaId AND fiscal_year = :year ORDER BY created_at DESC LIMIT 1`,
      [param.string('hoaId', hoaId), param.int('year', currentYear)],
    ),
  ])

  // Get line items for category budgeted amounts
  const lineItems = budget
    ? await query<{ category: string; budgetedAmount: number }>(
        `SELECT category, budgeted_amount AS "budgetedAmount"
         FROM budget_line_items WHERE budget_id = :budgetId AND hoa_id = :hoaId`,
        [param.string('budgetId', budget.id), param.string('hoaId', hoaId)],
      )
    : []

  const budgetMap = new Map(lineItems.map(l => [l.category, l.budgetedAmount]))
  const totalCategorySpend = categoryRows.reduce((s, r) => s + r.amount, 0)

  const categoryBreakdown = categoryRows.map((row, idx) => ({
    category: row.category,
    amount: row.amount,
    budgeted: budgetMap.get(row.category) ?? 0,
    percent: totalCategorySpend > 0 ? Math.round((row.amount / totalCategorySpend) * 100) : 0,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }))

  const totalIncome = cashFlowRow?.totalIncome ?? 0
  const totalExpenses = cashFlowRow?.totalExpenses ?? 0
  const totalExpected = assessmentRow?.totalExpected ?? 0
  const totalCollected = assessmentRow?.totalCollected ?? 0
  const overdueCount = assessmentRow?.overdueCount ?? 0
  const monthCount = monthlyTrend.length || 1

  // Budget utilization
  const budgetTotal = budget?.totalAmount ?? 0
  const budgetUtilization = budgetTotal > 0 ? Math.round((totalExpenses / budgetTotal) * 100) : 0

  // Add budget line to monthly trend
  const monthlyBudget = budgetTotal > 0 ? budgetTotal / 12 : 0
  const trendWithBudget = monthlyTrend.map(m => ({ ...m, budget: monthlyBudget }))

  // Rule-based insights
  const insights: AnalyticsData['insights'] = []

  if (budgetUtilization > 90 && budgetTotal > 0) {
    insights.push({ type: 'warning', title: 'Budget Nearly Exhausted', message: `You've used ${budgetUtilization}% of your annual budget with ${12 - new Date().getMonth()} months remaining.` })
  } else if (budgetUtilization < 50 && new Date().getMonth() >= 6 && budgetTotal > 0) {
    insights.push({ type: 'success', title: 'Under Budget', message: `Great news — only ${budgetUtilization}% of budget used at the halfway point of the year.` })
  }

  if (overdueCount > 0) {
    insights.push({ type: 'warning', title: 'Overdue Assessments', message: `${overdueCount} assessment${overdueCount > 1 ? 's are' : ' is'} past due. Follow up with residents to collect outstanding dues.` })
  }

  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0
  if (collectionRate >= 95 && totalExpected > 0) {
    insights.push({ type: 'success', title: 'Excellent Collection Rate', message: `${collectionRate}% of dues collected this year. Excellent financial health.` })
  } else if (collectionRate < 80 && totalExpected > 0) {
    insights.push({ type: 'warning', title: 'Low Collection Rate', message: `Only ${collectionRate}% of dues collected. Consider sending reminders to residents with outstanding balances.` })
  }

  const overBudgetCategories = categoryBreakdown.filter(c => c.budgeted > 0 && c.amount > c.budgeted)
  if (overBudgetCategories.length > 0) {
    const cat = overBudgetCategories[0]
    const overage = Math.round(((cat.amount - cat.budgeted) / cat.budgeted) * 100)
    insights.push({ type: 'warning', title: `${cat.category} Over Budget`, message: `${cat.category} spending is ${overage}% over budget ($${(cat.amount - cat.budgeted).toLocaleString()} excess).` })
  }

  if (totalIncome > totalExpenses && totalIncome > 0) {
    insights.push({ type: 'info', title: 'Positive Cash Flow', message: `Net positive cash flow of $${(totalIncome - totalExpenses).toLocaleString()} this year.` })
  }

  if (insights.length === 0) {
    insights.push({ type: 'info', title: 'Finances on Track', message: 'No significant budget concerns detected. Keep up the good work!' })
  }

  return {
    monthlyTrend: trendWithBudget,
    categoryBreakdown,
    cashFlow: {
      totalIncome,
      totalExpenses,
      netCashFlow: totalIncome - totalExpenses,
      avgMonthlyExpenses: totalExpenses / monthCount,
    },
    assessmentSummary: {
      totalExpected,
      totalCollected,
      outstanding: totalExpected - totalCollected,
      overdueCount,
      collectionRate,
    },
    insights,
    topVendors: vendorRows,
    budgetUtilization,
  }
}

// ── Legacy ────────────────────────────────────────────────────────────────────
/** @deprecated Use upsertBudgetWithLineItems */
export async function upsertBudget(hoaId: string, fiscalYear: number, totalAmount: number): Promise<void> {
  await execute(
    `INSERT INTO budgets (id, hoa_id, fiscal_year, total_amount)
     VALUES (gen_random_uuid(), :hoaId, :fiscalYear, :totalAmount)
     ON CONFLICT (hoa_id, fiscal_year) DO UPDATE SET total_amount = :totalAmount`,
    [param.string('hoaId', hoaId), param.int('fiscalYear', fiscalYear), param.double('totalAmount', totalAmount)],
  )
}
