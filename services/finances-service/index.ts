import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'
import { query, queryOne, execute, param } from '../shared/db/client'
import * as r from '../shared/response'

interface AuthorizerContext {
  hoaId: string
  userId: string
  role: string
}

type FinancesEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

export const handler = async (event: FinancesEvent) => {
  const hoaId = event.requestContext.authorizer.lambda.hoaId
  const role = event.requestContext.authorizer.lambda.role

  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method

  try {
    // GET /api/finances
    if (method === 'GET') {
      // Get current fiscal year budget
      const currentYear = new Date().getFullYear()

      const budget = await queryOne<{ id: string; totalAmount: number; fiscalYear: number }>(
        `SELECT id, total_amount, fiscal_year FROM budgets
         WHERE hoa_id = :hoaId AND fiscal_year = :year
         ORDER BY created_at DESC LIMIT 1`,
        [param.string('hoaId', hoaId), param.int('year', currentYear)],
      )

      // Line items
      const lineItems = budget
        ? await query<{
            id: string; budgetId: string; hoaId: string
            category: string; description: string
            budgetedAmount: number; actualAmount: number; variance: number
          }>(
            `SELECT id, budget_id, hoa_id, category, description,
                    budgeted_amount, actual_amount,
                    (budgeted_amount - actual_amount) as variance
             FROM budget_line_items
             WHERE budget_id = :budgetId AND hoa_id = :hoaId
             ORDER BY category ASC`,
            [param.string('budgetId', budget.id), param.string('hoaId', hoaId)],
          )
        : []

      // Reserve fund balance
      const reserveAccount = await queryOne<{ balance: number }>(
        `SELECT balance FROM accounts
         WHERE hoa_id = :hoaId AND account_type = 'savings'
         ORDER BY updated_at DESC LIMIT 1`,
        [param.string('hoaId', hoaId)],
      )

      // YTD expenses (sum of debit transactions this year)
      const ytdExpenses = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(ABS(amount)), 0) as total
         FROM transactions
         WHERE hoa_id = :hoaId
           AND type = 'debit'
           AND EXTRACT(YEAR FROM date) = :year`,
        [param.string('hoaId', hoaId), param.int('year', currentYear)],
      )

      // 6-month expense trend
      const expenseTrend = await query<{ month: string; amount: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YY') as month,
                COALESCE(SUM(ABS(amount)), 0) as amount
         FROM transactions
         WHERE hoa_id = :hoaId
           AND type = 'debit'
           AND date >= CURRENT_DATE - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', date)
         ORDER BY DATE_TRUNC('month', date) ASC`,
        [param.string('hoaId', hoaId)],
      )

      // Expense breakdown by category
      const expenseBreakdown = await query<{ category: string; amount: number }>(
        `SELECT category, COALESCE(SUM(ABS(amount)), 0) as amount
         FROM transactions
         WHERE hoa_id = :hoaId
           AND type = 'debit'
           AND EXTRACT(YEAR FROM date) = :year
         GROUP BY category
         ORDER BY amount DESC`,
        [param.string('hoaId', hoaId), param.int('year', currentYear)],
      )

      // Connected accounts
      const accounts = await query<{
        id: string; institutionName: string; accountName: string
        accountType: string; balance: number; currency: string; lastSyncedAt: string
      }>(
        `SELECT id, institution_name, account_name, account_type,
                balance, currency, last_synced_at
         FROM accounts
         WHERE hoa_id = :hoaId
         ORDER BY account_type ASC`,
        [param.string('hoaId', hoaId)],
      )

      // Recent transactions (last 20)
      const recentTransactions = await query<{
        id: string; accountId: string; amount: number
        description: string; category: string; date: string; type: string
      }>(
        `SELECT id, account_id, amount, description, category, date, type
         FROM transactions
         WHERE hoa_id = :hoaId
         ORDER BY date DESC LIMIT 20`,
        [param.string('hoaId', hoaId)],
      )

      // Add color scheme to breakdown
      const colors = ['#0C1F3F', '#0D9E8A', '#F5A623', '#3DBDAE', '#4D729A', '#64CBBF', '#9DAFC9', '#C6D0E4']
      const expenseBreakdownWithColors = expenseBreakdown.map((item, idx) => ({
        ...item,
        color: colors[idx % colors.length],
      }))

      return r.ok({
        totalBudget: budget?.totalAmount ?? 0,
        ytdExpenses: ytdExpenses?.total ?? 0,
        reserveFundBalance: reserveAccount?.balance ?? 0,
        lineItems,
        expenseTrend,
        expenseBreakdown: expenseBreakdownWithColors,
        accounts,
        recentTransactions,
      })
    }

    // POST /api/finances/budgets — board admin only
    if (method === 'POST') {
      if (role !== 'board_admin' && role !== 'board_member') {
        return r.forbidden('Only board members can manage budgets')
      }

      if (!event.body) return r.badRequest('Request body is required')
      const body = JSON.parse(event.body) as {
        fiscalYear?: number
        totalAmount?: number
        lineItems?: Array<{
          category: string
          description: string
          budgetedAmount: number
        }>
      }

      if (!body.fiscalYear) return r.badRequest('fiscalYear is required')
      if (!body.totalAmount) return r.badRequest('totalAmount is required')

      await execute(
        `INSERT INTO budgets (id, hoa_id, fiscal_year, total_amount)
         VALUES (gen_random_uuid(), :hoaId, :fiscalYear, :totalAmount)
         ON CONFLICT (hoa_id, fiscal_year) DO UPDATE SET total_amount = :totalAmount`,
        [
          param.string('hoaId', hoaId),
          param.int('fiscalYear', body.fiscalYear),
          param.double('totalAmount', body.totalAmount),
        ],
      )

      return r.created({ message: 'Budget created/updated successfully' })
    }

    return r.badRequest('Unsupported method')
  } catch (err) {
    console.error('Finances handler error:', err)
    return r.serverError()
  }
}
