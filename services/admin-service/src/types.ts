export interface HoaSummary {
  id: string
  name: string
  city: string
  state: string
  subscriptionTier: string | null
  subscriptionStatus: string | null
  trialEndsAt: string | null
  userCount: number
  unitCount: number
  openTasks: number
  createdAt: string
}

export interface HoaDetail extends HoaSummary {
  address: string | null
}

export interface AdminUserRecord {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  hoaId: string
  hoaName: string | null
  status: 'active' | 'disabled'
  createdAt: string
}

export interface PlatformStats {
  totalHoas: number
  activeHoas: number
  totalUsers: number
  usersByRole: Array<{ role: string; count: number }>
  hoasByTier: Array<{ tier: string; count: number }>
  subscriptionsByStatus: Array<{ status: string; count: number }>
  growthByWeek: Array<{ week: string; count: number }>
  tasksThisMonth: number
  meetingsThisMonth: number
  avgOwnersPerHoa: number
}

export interface LambdaMetric {
  functionName: string
  errors: number
  invocations: number
  p95Duration: number
  throttles: number
}

export interface MonitoringData {
  lambdaMetrics: LambdaMetric[]
  apiGateway4xx: number
  apiGateway5xx: number
  dbConnections: number
  dbCpuPercent: number
  collectedAt: string
}

export interface BillingOverview {
  hoas: Array<{
    id: string
    name: string
    tier: string
    status: string
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    userCount: number
  }>
  summary: {
    trial: number
    active: number
    cancelled: number
    pastDue: number
  }
}

export interface UpdateHoaInput {
  name?: string
  subscriptionTier?: string
}

// Tier pricing (USD/month)
export const TIER_PRICES: Record<string, number> = {
  starter: 49,
  growth: 99,
  pro: 249,
}

export interface AdminDashboardData {
  mrr: number
  arr: number
  totalHoas: number
  activeSubscriptions: number
  trialCount: number
  trialExpiringSoon: number
  newHoasThisMonth: number
  churnedThisMonth: number
  totalUsers: number
  mrrTrend: Array<{ month: string; mrr: number }>
  recentSignups: Array<{
    id: string; name: string; city: string; state: string
    tier: string; status: string; createdAt: string; userCount: number
  }>
  trialPipeline: Array<{
    id: string; name: string; tier: string
    trialEndsAt: string; daysLeft: number; userCount: number
  }>
  systemHealth: {
    status: 'healthy' | 'degraded' | 'down'
    apiErrors5xx: number
    dbCpu: number
    lambdaErrors: number
  }
}

export interface SubscriptionRecord {
  hoaId: string
  hoaName: string
  city: string
  state: string
  tier: string
  status: string
  mrr: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  userCount: number
  unitCount: number
  createdAt: string
}

export interface SubscriptionsData {
  mrr: number
  arr: number
  byTier: Array<{ tier: string; count: number; mrr: number }>
  mrrHistory: Array<{ month: string; mrr: number }>
  subscriptions: SubscriptionRecord[]
}

export interface AuditLogEntry {
  id: string
  adminUserId: string
  action: string
  targetType: string
  targetId: string
  targetName: string | null
  payloadJson: string
  createdAt: string
}

// ── Platform Costs ───────────────────────────────────────────────────────────

export interface CostLineItem {
  name:      string
  category:  string
  amountUsd: number
  source:    'aws_cost_explorer' | 'estimated' | 'fixed'
  note?:     string
}

export interface PlatformCosts {
  currentMonth: {
    awsTotal:      number
    externalTotal: number
    total:         number
  }
  byService: CostLineItem[]
  monthlyTrend: Array<{ month: string; awsCost: number }>
  unitEconomics: {
    costPerHoa:  number
    costPerUser: number
    activeHoas:  number
    totalUsers:  number
  }
  /** false when Cost Explorer is unavailable (insufficient IAM permissions or first deploy) */
  awsCostExplorerAvailable: boolean
  collectedAt: string
}

export interface ActivityData {
  entries: AuditLogEntry[]
  total: number
}
