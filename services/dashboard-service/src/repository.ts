import { query, queryOne, param } from '../../shared/db/client'

const CHART_COLORS = ['#0C1F3F', '#0D9E8A', '#F5A623', '#3DBDAE', '#4D729A', '#64CBBF', '#9DAFC9', '#C6D0E4']

export interface DashboardData {
  hoaName: string
  totalUnits: number
  duesCollectedPercent: number
  duesCollectedAmount: number
  totalDuesAmount: number
  openTasksCount: number
  reserveFundBalance: number
  recentTasks: Array<{
    id: string; title: string; status: string; priority: string
    assigneeName: string | null; dueDate: string | null; createdAt: string; updatedAt: string
  }>
  upcomingMeetings: Array<{ id: string; title: string; scheduledAt: string; location: string | null; status: string }>
  recentPosts: Array<{
    id: string; boardName: string; threadTitle: string
    authorName: string; body: string; createdAt: string
  }>
  expenseTrend: Array<{ month: string; amount: number; budget: number }>
  expenseBreakdown: Array<{ category: string; amount: number; color: string }>
}

export async function getDashboard(hoaId: string): Promise<DashboardData> {
  const [
    hoa, unitCount, duesStats, openTasks, recentTasks,
    upcomingMeetings, recentPosts, expenseTrend, expenseBreakdown, reserveFund,
  ] = await Promise.all([
    queryOne<{ name: string }>('SELECT name FROM hoas WHERE id = :hoaId', [param.string('hoaId', hoaId)]),

    queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM units WHERE hoa_id = :hoaId', [param.string('hoaId', hoaId)]),

    queryOne<{ collected: number; total: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS collected,
         COALESCE(SUM(amount), 0) AS total
       FROM assessments
       WHERE hoa_id = :hoaId
         AND EXTRACT(MONTH FROM due_date) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM due_date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [param.string('hoaId', hoaId)],
    ),

    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tasks WHERE hoa_id = :hoaId AND status != 'done'`,
      [param.string('hoaId', hoaId)],
    ),

    query<{
      id: string; title: string; status: string; priority: string
      assigneeName: string | null; dueDate: string | null; createdAt: string; updatedAt: string
    }>(
      `SELECT t.id, t.title, t.status, t.priority,
              CONCAT(o.first_name, ' ', o.last_name) AS assignee_name,
              t.due_date, t.created_at, t.updated_at
       FROM tasks t
       LEFT JOIN owners o ON o.id = t.assignee_id
       WHERE t.hoa_id = :hoaId
       ORDER BY t.created_at DESC LIMIT 5`,
      [param.string('hoaId', hoaId)],
    ),

    query<{ id: string; title: string; scheduledAt: string; location: string | null; status: string }>(
      `SELECT id, title, scheduled_at, location, status
       FROM meetings
       WHERE hoa_id = :hoaId AND status = 'scheduled' AND scheduled_at >= NOW()
       ORDER BY scheduled_at ASC LIMIT 3`,
      [param.string('hoaId', hoaId)],
    ),

    query<{ id: string; boardName: string; threadTitle: string; authorName: string; body: string; createdAt: string }>(
      `SELECT p.id, b.name AS board_name, t.title AS thread_title,
              CONCAT(o.first_name, ' ', o.last_name) AS author_name,
              p.body, p.created_at
       FROM posts p
       JOIN threads t ON t.id = p.thread_id
       JOIN boards b ON b.id = t.board_id
       JOIN owners o ON o.id = p.author_id
       WHERE p.hoa_id = :hoaId AND p.deleted_at IS NULL AND b.visibility = 'community_wide'
       ORDER BY p.created_at DESC LIMIT 3`,
      [param.string('hoaId', hoaId)],
    ),

    query<{ month: string; amount: number; budget: number }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', date), 'Mon YY') AS month,
         COALESCE(SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END), 0) AS amount,
         0 AS budget
       FROM transactions
       WHERE hoa_id = :hoaId AND date >= CURRENT_DATE - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY DATE_TRUNC('month', date) ASC`,
      [param.string('hoaId', hoaId)],
    ),

    query<{ category: string; amount: number }>(
      `SELECT category, COALESCE(SUM(ABS(amount)), 0) AS amount
       FROM transactions
       WHERE hoa_id = :hoaId AND type = 'debit'
         AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
       GROUP BY category
       ORDER BY amount DESC
       LIMIT 8`,
      [param.string('hoaId', hoaId)],
    ),

    queryOne<{ balance: number }>(
      `SELECT balance FROM accounts WHERE hoa_id = :hoaId AND account_type = 'savings' ORDER BY updated_at DESC LIMIT 1`,
      [param.string('hoaId', hoaId)],
    ),
  ])

  const totalDuesAmount = duesStats?.total ?? 0
  const duesCollectedAmount = duesStats?.collected ?? 0

  return {
    hoaName: hoa?.name ?? 'Your HOA',
    totalUnits: unitCount?.count ?? 0,
    duesCollectedPercent: totalDuesAmount > 0 ? Math.round((duesCollectedAmount / totalDuesAmount) * 100) : 0,
    duesCollectedAmount,
    totalDuesAmount,
    openTasksCount: openTasks?.count ?? 0,
    reserveFundBalance: reserveFund?.balance ?? 0,
    recentTasks,
    upcomingMeetings,
    recentPosts,
    expenseTrend,
    expenseBreakdown: expenseBreakdown.map((item, idx) => ({
      ...item,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    })),
  }
}
