import { query, queryOne, execute, param } from '../../shared/db/client'
import type {
  HoaSummary, HoaDetail, PlatformStats, BillingOverview, UpdateHoaInput,
  AdminDashboardData, SubscriptionsData, SubscriptionRecord, ActivityData, AuditLogEntry,
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

// ── Admin Dashboard ──────────────────────────────────────────────────────────

export async function getDashboardData(monitoring: {
  apiGateway5xx: number; dbCpuPercent: number; lambdaMetrics: Array<{ errors: number }>
}): Promise<AdminDashboardData> {

  const mrrCase = `CASE s.tier WHEN 'starter' THEN 49 WHEN 'growth' THEN 99 WHEN 'pro' THEN 249 ELSE 0 END`

  const [
    mrrRow,
    counts,
    expiringRow,
    newHoasRow,
    churnedRow,
    userRow,
    recentSignups,
    trialPipeline,
    mrrTrend,
  ] = await Promise.all([
    // Current MRR
    queryOne<{ mrr: number }>(`
      SELECT COALESCE(SUM(${mrrCase})::int, 0) AS mrr
      FROM subscriptions s WHERE s.status = 'active'
    `),
    // Active / trial counts
    queryOne<{ active: number; trial: number; total: number }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status IN ('trialing','trial'))::int AS trial
      FROM subscriptions
    `),
    // Trial expiring within 7 days
    queryOne<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM subscriptions
      WHERE status IN ('trialing','trial')
        AND trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    `),
    // New HOAs this calendar month
    queryOne<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM hoas
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `),
    // Cancelled this month
    queryOne<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM subscriptions
      WHERE status IN ('cancelled','canceled')
        AND updated_at >= DATE_TRUNC('month', NOW())
    `),
    // Total users
    queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM owners'),
    // Recent signups (last 30 days)
    query<{
      id: string; name: string; city: string; state: string
      tier: string; status: string; createdAt: string; userCount: number
    }>(`
      SELECT h.id, h.name, COALESCE(h.city,'') AS city, COALESCE(h.state,'') AS state,
             COALESCE(s.tier,'none') AS tier, COALESCE(s.status,'none') AS status,
             h.created_at AS "createdAt",
             COUNT(DISTINCT o.id)::int AS "userCount"
      FROM hoas h
      LEFT JOIN subscriptions s ON s.hoa_id = h.id
      LEFT JOIN owners o ON o.hoa_id = h.id
      WHERE h.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY h.id, h.name, h.city, h.state, s.tier, s.status
      ORDER BY h.created_at DESC LIMIT 8
    `),
    // Trial pipeline
    query<{ id: string; name: string; tier: string; trialEndsAt: string; daysLeft: number; userCount: number }>(`
      SELECT h.id, h.name, COALESCE(s.tier,'none') AS tier,
             s.trial_ends_at AS "trialEndsAt",
             GREATEST(0, EXTRACT(DAY FROM s.trial_ends_at - NOW())::int) AS "daysLeft",
             COUNT(DISTINCT o.id)::int AS "userCount"
      FROM hoas h
      JOIN subscriptions s ON s.hoa_id = h.id
      LEFT JOIN owners o ON o.hoa_id = h.id
      WHERE s.status IN ('trialing','trial')
      GROUP BY h.id, h.name, s.tier, s.trial_ends_at
      ORDER BY s.trial_ends_at ASC
    `),
    // MRR trend — last 12 months
    query<{ month: string; mrr: number }>(`
      WITH months AS (
        SELECT generate_series(
          DATE_TRUNC('month', NOW()) - INTERVAL '11 months',
          DATE_TRUNC('month', NOW()),
          '1 month'
        ) AS m
      )
      SELECT TO_CHAR(m.m, 'Mon ''YY') AS month,
             COALESCE(SUM(${mrrCase})::int, 0) AS mrr
      FROM months m
      LEFT JOIN subscriptions s
        ON s.created_at < m.m + INTERVAL '1 month'
        AND s.status = 'active'
      GROUP BY m.m ORDER BY m.m
    `),
  ])

  const lambdaErrors = monitoring.lambdaMetrics.reduce((s, f) => s + f.errors, 0)
  const systemStatus =
    monitoring.apiGateway5xx > 10 || monitoring.dbCpuPercent > 85 || lambdaErrors > 20
      ? 'down'
      : monitoring.apiGateway5xx > 2 || monitoring.dbCpuPercent > 60 || lambdaErrors > 5
        ? 'degraded'
        : 'healthy'

  return {
    mrr: mrrRow?.mrr ?? 0,
    arr: (mrrRow?.mrr ?? 0) * 12,
    totalHoas: counts?.total ?? 0,
    activeSubscriptions: counts?.active ?? 0,
    trialCount: counts?.trial ?? 0,
    trialExpiringSoon: expiringRow?.count ?? 0,
    newHoasThisMonth: newHoasRow?.count ?? 0,
    churnedThisMonth: churnedRow?.count ?? 0,
    totalUsers: userRow?.count ?? 0,
    mrrTrend,
    recentSignups,
    trialPipeline,
    systemHealth: {
      status: systemStatus,
      apiErrors5xx: monitoring.apiGateway5xx,
      dbCpu: monitoring.dbCpuPercent,
      lambdaErrors,
    },
  }
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export async function getSubscriptionsData(): Promise<SubscriptionsData> {
  const mrrCase = `CASE s.tier WHEN 'starter' THEN 49 WHEN 'growth' THEN 99 WHEN 'pro' THEN 249 ELSE 0 END`

  const [mrrRow, byTier, mrrHistory, subscriptions] = await Promise.all([
    queryOne<{ mrr: number }>(`
      SELECT COALESCE(SUM(${mrrCase})::int, 0) AS mrr
      FROM subscriptions s WHERE s.status = 'active'
    `),
    query<{ tier: string; count: number; mrr: number }>(`
      SELECT COALESCE(s.tier,'none') AS tier, COUNT(*)::int AS count,
             COALESCE(SUM(${mrrCase})::int, 0) AS mrr
      FROM subscriptions s
      GROUP BY s.tier ORDER BY mrr DESC
    `),
    query<{ month: string; mrr: number }>(`
      WITH months AS (
        SELECT generate_series(
          DATE_TRUNC('month', NOW()) - INTERVAL '11 months',
          DATE_TRUNC('month', NOW()), '1 month'
        ) AS m
      )
      SELECT TO_CHAR(m.m, 'Mon ''YY') AS month,
             COALESCE(SUM(${mrrCase})::int, 0) AS mrr
      FROM months m
      LEFT JOIN subscriptions s
        ON s.created_at < m.m + INTERVAL '1 month'
        AND s.status = 'active'
      GROUP BY m.m ORDER BY m.m
    `),
    query<SubscriptionRecord>(`
      SELECT h.id AS "hoaId", h.name AS "hoaName",
             COALESCE(h.city,'') AS city, COALESCE(h.state,'') AS state,
             COALESCE(s.tier,'none') AS tier,
             COALESCE(s.status,'none') AS status,
             COALESCE(${mrrCase}, 0)::int AS mrr,
             s.trial_ends_at AS "trialEndsAt",
             s.current_period_end AS "currentPeriodEnd",
             COUNT(DISTINCT o.id)::int AS "userCount",
             COUNT(DISTINCT u.id)::int AS "unitCount",
             h.created_at AS "createdAt"
      FROM hoas h
      LEFT JOIN subscriptions s ON s.hoa_id = h.id
      LEFT JOIN owners o ON o.hoa_id = h.id
      LEFT JOIN units u ON u.hoa_id = h.id
      GROUP BY h.id, h.name, h.city, h.state, s.tier, s.status,
               s.trial_ends_at, s.current_period_end
      ORDER BY mrr DESC, h.name ASC
    `),
  ])

  const mrr = mrrRow?.mrr ?? 0
  return { mrr, arr: mrr * 12, byTier, mrrHistory, subscriptions }
}

export async function updateSubscriptionTier(hoaId: string, tier: string): Promise<void> {
  await query(
    `UPDATE subscriptions SET tier = :tier, updated_at = NOW() WHERE hoa_id = :hoaId`,
    [param.string('tier', tier), param.string('hoaId', hoaId)],
  )
}

export async function extendTrialDays(hoaId: string, days: number): Promise<void> {
  await query(
    `UPDATE subscriptions
     SET trial_ends_at = COALESCE(trial_ends_at, NOW()) + (:days::int * INTERVAL '1 day'),
         updated_at = NOW()
     WHERE hoa_id = :hoaId`,
    [param.int('days', days), param.string('hoaId', hoaId)],
  )
}

// ── Activity log ─────────────────────────────────────────────────────────────

export async function getActivityData(limit: number, offset: number): Promise<ActivityData> {
  const [entries, countRow] = await Promise.all([
    query<AuditLogEntry>(`
      SELECT
        al.id,
        al.admin_user_id AS "adminUserId",
        al.action,
        al.target_type AS "targetType",
        al.target_id AS "targetId",
        CASE
          WHEN al.target_type = 'hoa'  THEN h.name
          WHEN al.target_type = 'user' THEN o.email
          ELSE NULL
        END AS "targetName",
        al.payload_json AS "payloadJson",
        al.created_at AS "createdAt"
      FROM superadmin_audit_log al
      LEFT JOIN hoas h  ON h.id  = al.target_id AND al.target_type = 'hoa'
      LEFT JOIN owners o ON o.id = al.target_id AND al.target_type = 'user'
      ORDER BY al.created_at DESC
      LIMIT :limit OFFSET :offset
    `, [param.string('limit', String(limit)), param.string('offset', String(offset))]),
    queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM superadmin_audit_log'),
  ])
  return { entries, total: countRow?.count ?? 0 }
}

// ── Invite codes ─────────────────────────────────────────────────────────────

export async function getInviteCode(hoaId: string): Promise<{
  code: string; usedCount: number; expiresAt: string | null; createdAt: string
} | null> {
  return queryOne(
    `SELECT code, used_count, expires_at, created_at
     FROM invite_codes
     WHERE hoa_id = :hoaId AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [param.string('hoaId', hoaId)],
  )
}

export async function rotateInviteCode(hoaId: string, adminUserId: string): Promise<{
  code: string; usedCount: number; expiresAt: string | null; createdAt: string
} | null> {
  // Deactivate existing active codes for this HOA
  await execute(
    `UPDATE invite_codes SET is_active = FALSE WHERE hoa_id = :hoaId AND is_active = TRUE`,
    [param.string('hoaId', hoaId)],
  )

  // Insert new invite code: 8 uppercase alphanumeric chars from gen_random_uuid()
  await execute(
    `INSERT INTO invite_codes (id, hoa_id, code, created_by, is_active)
     VALUES (
       gen_random_uuid(),
       :hoaId,
       SUBSTR(UPPER(REPLACE(gen_random_uuid()::text, '-', '')), 1, 8),
       (SELECT id FROM owners WHERE cognito_sub = :adminUserId LIMIT 1),
       TRUE
     )`,
    [param.string('hoaId', hoaId), param.string('adminUserId', adminUserId)],
  )

  return getInviteCode(hoaId)
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

// ── HOA board admin creation ─────────────────────────────────────────────────

export async function createBoardAdminOwner(input: {
  hoaId: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
}): Promise<{ id: string; email: string; firstName: string; lastName: string; role: string; status: string } | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO owners (id, hoa_id, email, first_name, last_name, role, status, phone)
     VALUES (gen_random_uuid(), :hoaId, :email, :firstName, :lastName, 'board_admin', 'active', :phone)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [
      param.string('hoaId', input.hoaId),
      param.string('email', input.email),
      param.string('firstName', input.firstName),
      param.string('lastName', input.lastName),
      param.stringOrNull('phone', input.phone),
    ],
  )
  if (!row?.id) return null
  return queryOne<{ id: string; email: string; firstName: string; lastName: string; role: string; status: string }>(
    `SELECT id, email, first_name AS "firstName", last_name AS "lastName", role, status
     FROM owners WHERE id = :id`,
    [param.string('id', row.id)],
  )
}
