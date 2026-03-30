import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'
import { query, queryOne, param } from '../shared/db/client'
import * as r from '../shared/response'

interface AuthorizerContext {
  hoaId: string
  userId: string
  role: string
}

type DashboardEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

export const handler = async (event: DashboardEvent) => {
  const hoaId = event.requestContext.authorizer.lambda.hoaId

  if (!hoaId) return r.unauthorized()

  try {
    // Run all queries in parallel for fast aggregation
    const [
      hoa,
      unitCount,
      duesStats,
      openTasks,
      recentTasks,
      upcomingMeetings,
      recentPosts,
      expenseTrend,
      expenseBreakdown,
      reserveFund,
    ] = await Promise.all([
      // HOA info
      queryOne<{ name: string }>(
        'SELECT name FROM hoas WHERE id = :hoaId',
        [param.string('hoaId', hoaId)],
      ),

      // Unit count
      queryOne<{ count: number }>(
        'SELECT COUNT(*)::int as count FROM units WHERE hoa_id = :hoaId',
        [param.string('hoaId', hoaId)],
      ),

      // Dues collection stats
      queryOne<{ collected: number; total: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as collected,
           COALESCE(SUM(amount), 0) as total
         FROM assessments
         WHERE hoa_id = :hoaId
           AND EXTRACT(MONTH FROM due_date) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(YEAR FROM due_date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
        [param.string('hoaId', hoaId)],
      ),

      // Open tasks count
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM tasks
         WHERE hoa_id = :hoaId AND status != 'done'`,
        [param.string('hoaId', hoaId)],
      ),

      // Recent tasks (5)
      query<{
        id: string; title: string; status: string; priority: string
        assigneeName: string | null; dueDate: string | null; createdAt: string; updatedAt: string
      }>(
        `SELECT t.id, t.title, t.status, t.priority,
                CONCAT(o.first_name, ' ', o.last_name) as assignee_name,
                t.due_date, t.created_at, t.updated_at
         FROM tasks t
         LEFT JOIN owners o ON o.id = t.assignee_id
         WHERE t.hoa_id = :hoaId
         ORDER BY t.created_at DESC LIMIT 5`,
        [param.string('hoaId', hoaId)],
      ),

      // Upcoming meetings (3)
      query<{ id: string; title: string; scheduledAt: string; location: string | null; status: string }>(
        `SELECT id, title, scheduled_at, location, status
         FROM meetings
         WHERE hoa_id = :hoaId AND status = 'scheduled' AND scheduled_at >= NOW()
         ORDER BY scheduled_at ASC LIMIT 3`,
        [param.string('hoaId', hoaId)],
      ),

      // Recent posts (3)
      query<{
        id: string; boardName: string; threadTitle: string
        authorName: string; body: string; createdAt: string
      }>(
        `SELECT p.id,
                b.name as board_name,
                t.title as thread_title,
                CONCAT(o.first_name, ' ', o.last_name) as author_name,
                p.body, p.created_at
         FROM posts p
         JOIN threads t ON t.id = p.thread_id
         JOIN boards b ON b.id = t.board_id
         JOIN owners o ON o.id = p.author_id
         WHERE p.hoa_id = :hoaId AND p.deleted_at IS NULL AND b.visibility = 'community_wide'
         ORDER BY p.created_at DESC LIMIT 3`,
        [param.string('hoaId', hoaId)],
      ),

      // 6-month expense trend
      query<{ month: string; amount: number; budget: number }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', date), 'Mon YY') as month,
           COALESCE(SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END), 0) as amount,
           0 as budget
         FROM transactions
         WHERE hoa_id = :hoaId AND date >= CURRENT_DATE - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', date)
         ORDER BY DATE_TRUNC('month', date) ASC`,
        [param.string('hoaId', hoaId)],
      ),

      // Expense breakdown
      query<{ category: string; amount: number }>(
        `SELECT category,
                COALESCE(SUM(ABS(amount)), 0) as amount
         FROM transactions
         WHERE hoa_id = :hoaId
           AND type = 'debit'
           AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
         GROUP BY category
         ORDER BY amount DESC
         LIMIT 8`,
        [param.string('hoaId', hoaId)],
      ),

      // Reserve fund balance
      queryOne<{ balance: number }>(
        `SELECT balance FROM accounts
         WHERE hoa_id = :hoaId AND account_type = 'savings'
         ORDER BY updated_at DESC LIMIT 1`,
        [param.string('hoaId', hoaId)],
      ),
    ])

    const totalDuesAmount = duesStats?.total ?? 0
    const duesCollectedAmount = duesStats?.collected ?? 0
    const duesCollectedPercent = totalDuesAmount > 0
      ? Math.round((duesCollectedAmount / totalDuesAmount) * 100)
      : 0

    const colors = ['#0C1F3F', '#0D9E8A', '#F5A623', '#3DBDAE', '#4D729A', '#64CBBF', '#9DAFC9', '#C6D0E4']
    const expenseBreakdownWithColors = expenseBreakdown.map((item, idx) => ({
      ...item,
      color: colors[idx % colors.length],
    }))

    return r.ok({
      hoaName: hoa?.name ?? 'Your HOA',
      totalUnits: unitCount?.count ?? 0,
      duesCollectedPercent,
      duesCollectedAmount,
      totalDuesAmount,
      openTasksCount: openTasks?.count ?? 0,
      reserveFundBalance: reserveFund?.balance ?? 0,
      recentTasks,
      upcomingMeetings,
      recentPosts,
      expenseTrend,
      expenseBreakdown: expenseBreakdownWithColors,
    })
  } catch (err) {
    console.error('Dashboard handler error:', err)
    return r.serverError()
  }
}
