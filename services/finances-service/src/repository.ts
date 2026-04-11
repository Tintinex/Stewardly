import { query, queryOne, execute, param } from '../../shared/db/client'
import type { BudgetLineItem, Account, Transaction, FinancialSummary } from './types'

const CHART_COLORS = ['#0C1F3F', '#0D9E8A', '#F5A623', '#3DBDAE', '#4D729A', '#64CBBF', '#9DAFC9', '#C6D0E4']

export async function getFinancialSummary(hoaId: string): Promise<FinancialSummary> {
  const currentYear = new Date().getFullYear()

  const budget = await queryOne<{ id: string; totalAmount: number; fiscalYear: number }>(
    `SELECT id, total_amount, fiscal_year FROM budgets
     WHERE hoa_id = :hoaId AND fiscal_year = :year
     ORDER BY created_at DESC LIMIT 1`,
    [param.string('hoaId', hoaId), param.int('year', currentYear)],
  )

  const lineItems = budget
    ? await query<BudgetLineItem>(
        `SELECT id, budget_id, hoa_id, category, description,
                budgeted_amount, actual_amount,
                (budgeted_amount - actual_amount) AS variance
         FROM budget_line_items
         WHERE budget_id = :budgetId AND hoa_id = :hoaId
         ORDER BY category ASC`,
        [param.string('budgetId', budget.id), param.string('hoaId', hoaId)],
      )
    : []

  const [reserveAccount, ytdExpenses, expenseTrend, expenseBreakdown, accounts, recentTransactions] =
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
      query<{ month: string; amount: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YY') AS month,
                COALESCE(SUM(ABS(amount)), 0) AS amount
         FROM transactions
         WHERE hoa_id = :hoaId AND type = 'debit' AND date >= CURRENT_DATE - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', date)
         ORDER BY DATE_TRUNC('month', date) ASC`,
        [param.string('hoaId', hoaId)],
      ),
      query<{ category: string; amount: number }>(
        `SELECT category, COALESCE(SUM(ABS(amount)), 0) AS amount
         FROM transactions
         WHERE hoa_id = :hoaId AND type = 'debit' AND EXTRACT(YEAR FROM date) = :year
         GROUP BY category
         ORDER BY amount DESC`,
        [param.string('hoaId', hoaId), param.int('year', currentYear)],
      ),
      query<Account>(
        `SELECT id, institution_name, account_name, account_type, balance, currency, last_synced_at
         FROM accounts WHERE hoa_id = :hoaId ORDER BY account_type ASC`,
        [param.string('hoaId', hoaId)],
      ),
      query<Transaction>(
        `SELECT id, account_id, amount, description, category, date, type
         FROM transactions WHERE hoa_id = :hoaId ORDER BY date DESC LIMIT 20`,
        [param.string('hoaId', hoaId)],
      ),
    ])

  return {
    totalBudget: budget?.totalAmount ?? 0,
    ytdExpenses: ytdExpenses?.total ?? 0,
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

export async function upsertBudget(hoaId: string, fiscalYear: number, totalAmount: number): Promise<void> {
  await execute(
    `INSERT INTO budgets (id, hoa_id, fiscal_year, total_amount)
     VALUES (gen_random_uuid(), :hoaId, :fiscalYear, :totalAmount)
     ON CONFLICT (hoa_id, fiscal_year) DO UPDATE SET total_amount = :totalAmount`,
    [
      param.string('hoaId', hoaId),
      param.int('fiscalYear', fiscalYear),
      param.double('totalAmount', totalAmount),
    ],
  )
}
