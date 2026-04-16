import { query, queryOne, param } from '../../shared/db/client'
import type {
  HoaSummary, HoaDetail, PlatformStats, BillingOverview, UpdateHoaInput,
} from './types'

// ── HOA queries (cross-tenant — superadmin only) ─────────────────────────────

export async function listHoas(): Promise<HoaSummary[]> {
  return query<HoaSummary>(`
    SELECT
      h.id,
      h.name,
      COALESCE(h.city, '') AS city,
      COALESCE(h.state, '') AS state,
      s.tier AS subscription_tier,
      s.status AS subscription_status,
      s.trial_ends_at,
      h.created_at,
      COUNT(DISTINCT o.id)::int AS user_count,
      COUNT(DISTINCT u.id)::int AS unit_count,
      (
        SELECT COUNT(*)::int FROM tasks t
        WHERE t.hoa_id = h.id AND t.status != 'done'
      ) AS open_tasks
    FROM hoas h
    LEFT JOIN subscriptions s ON s.hoa_id = h.id
    LEFT JOIN owners o ON o.hoa_id = h.id
    LEFT JOIN units u ON u.hoa_id = h.id
    GROUP BY h.id, h.name, h.city, h.state, h.created_at, s.tier, s.status, s.trial_ends_at
    ORDER BY h.created_at DESC
  `)
}

export async function getHoa(hoaId: string): Promise<HoaDetail | null> {
  return queryOne<HoaDetail>(`
    SELECT
      h.id,
      h.name,
      h.address,
      COALESCE(h.city, '') AS city,
      COALESCE(h.state, '') AS state,
      s.tier AS subscription_tier,
      s.status AS subscription_status,
      s.trial_ends_at,
      s.current_period_end,
      h.created_at,
      COUNT(DISTINCT o.id)::int AS user_count,
      COUNT(DISTINCT u.id)::int AS unit_count,
      (
        SELECT COUNT(*)::int FROM tasks t
        WHERE t.hoa_id = h.id AND t.status != 'done'
      ) AS open_tasks
    FROM hoas h
    LEFT JOIN subscriptions s ON s.hoa_id = h.id
    LEFT JOIN owners o ON o.hoa_id = h.id
    LEFT JOIN units u ON u.hoa_id = h.id
    WHERE h.id = :hoaId
    GROUP BY h.id, h.name, h.address, h.city, h.state, h.created_at,
             s.tier, s.status, s.trial_ends_at, s.current_period_end
  `, [param.string('hoaId', hoaId)])
}

export async function updateHoa(hoaId: string, input: UpdateHoaInput): Promise<HoaDetail | null> {
  if (input.name) {
    await query(
      'UPDATE hoas SET name = :name, updated_at = NOW() WHERE id = :hoaId',
      [param.string('name', input.name), param.string('hoaId', hoaId)],
    )
  }
  if (input.subscriptionTier) {
    await query(
      'UPDATE subscriptions SET tier = :tier WHERE hoa_id = :hoaId',
      [param.string('tier', input.subscriptionTier), param.string('hoaId', hoaId)],
    )
  }
  return getHoa(hoaId)
}

// ── User queries (cross-tenant) ──────────────────────────────────────────────

export async function listUsers(hoaId?: string): Promise<Array<{
  id: string; email: string; firstName: string; lastName: string
  role: string; hoaId: string; hoaName: string | null; createdAt: string
}>> {
  if (hoaId) {
    return query(`
      SELECT o.id, o.email, o.first_name, o.last_name, o.role,
             o.hoa_id, h.name AS hoa_name, o.created_at
      FROM owners o
      LEFT JOIN hoas h ON h.id = o.hoa_id
      WHERE o.hoa_id = :hoaId
      ORDER BY o.created_at DESC
    `, [param.string('hoaId', hoaId)])
  }
  return query(`
    SELECT o.id, o.email, o.first_name, o.last_name, o.role,
           o.hoa_id, h.name AS hoa_name, o.created_at
    FROM owners o
    LEFT JOIN hoas h ON h.id = o.hoa_id
    ORDER BY o.created_at DESC
    LIMIT 500
  `)
}

// ── Platform stats ───────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const [
    [totalHoas],
    [activeHoas],
    usersByRole,
    hoasByTier,
    subscriptionsByStatus,
    growthByWeek,
    [tasksThisMonth],
    [meetingsThisMonth],
    [avgRow],
  ] = await Promise.all([
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM hoas'),
    query<{ count: number }>(`
      SELECT COUNT(DISTINCT hoa_id)::int AS count FROM (
        SELECT hoa_id FROM tasks WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT hoa_id FROM meetings WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT hoa_id FROM posts WHERE created_at >= NOW() - INTERVAL '30 days'
      ) activity
    `),
    query<{ role: string; count: number }>('SELECT role, COUNT(*)::int AS count FROM owners GROUP BY role'),
    query<{ tier: string; count: number }>(`
      SELECT COALESCE(tier, 'none') AS tier, COUNT(*)::int AS count
      FROM subscriptions GROUP BY tier
    `),
    query<{ status: string; count: number }>(`
      SELECT COALESCE(status, 'none') AS status, COUNT(*)::int AS count
      FROM subscriptions GROUP BY status
    `),
    query<{ week: string; count: number }>(`
      SELECT DATE_TRUNC('week', created_at)::text AS week, COUNT(*)::int AS count
      FROM hoas
      WHERE created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week ASC
    `),
    query<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM tasks
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `),
    query<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM meetings
      WHERE status = 'completed' AND scheduled_at >= DATE_TRUNC('month', NOW())
    `),
    query<{ avg: number }>(`
      SELECT ROUND(AVG(cnt), 1)::float AS avg
      FROM (SELECT hoa_id, COUNT(*) AS cnt FROM owners GROUP BY hoa_id) sub
    `),
  ])

  return {
    totalHoas: totalHoas?.count ?? 0,
    activeHoas: activeHoas?.count ?? 0,
    totalUsers: usersByRole.reduce((s, r) => s + r.count, 0),
    usersByRole,
    hoasByTier,
    subscriptionsByStatus,
    growthByWeek,
    tasksThisMonth: tasksThisMonth?.count ?? 0,
    meetingsThisMonth: meetingsThisMonth?.count ?? 0,
    avgOwnersPerHoa: avgRow?.avg ?? 0,
  }
}

// ── Billing overview ─────────────────────────────────────────────────────────

export async function getBillingData(): Promise<BillingOverview> {
  const hoas = await query<{
    id: string; name: string; tier: string; status: string
    trialEndsAt: string | null; currentPeriodEnd: string | null; userCount: number
  }>(`
    SELECT h.id, h.name,
           COALESCE(s.tier, 'none') AS tier,
           COALESCE(s.status, 'none') AS status,
           s.trial_ends_at,
           s.current_period_end,
           COUNT(DISTINCT o.id)::int AS user_count
    FROM hoas h
    LEFT JOIN subscriptions s ON s.hoa_id = h.id
    LEFT JOIN owners o ON o.hoa_id = h.id
    GROUP BY h.id, h.name, s.tier, s.status, s.trial_ends_at, s.current_period_end
    ORDER BY h.name
  `)

  const summary = hoas.reduce(
    (acc, h) => {
      const s = h.status.toLowerCase()
      if (s === 'trialing' || s === 'trial') acc.trial++
      else if (s === 'active') acc.active++
      else if (s === 'cancelled' || s === 'canceled') acc.cancelled++
      else if (s === 'past_due') acc.pastDue++
      return acc
    },
    { trial: 0, active: 0, cancelled: 0, pastDue: 0 },
  )

  return { hoas, summary }
}

// ── Audit log ────────────────────────────────────────────────────────────────

export async function writeAuditLog(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  payload: unknown,
): Promise<void> {
  await query(`
    INSERT INTO superadmin_audit_log (admin_user_id, action, target_type, target_id, payload_json, created_at)
    VALUES (:adminUserId, :action, :targetType, :targetId, :payloadJson, NOW())
  `, [
    param.string('adminUserId', adminUserId),
    param.string('action', action),
    param.string('targetType', targetType),
    param.string('targetId', targetId),
    param.string('payloadJson', JSON.stringify(payload)),
  ])
}
