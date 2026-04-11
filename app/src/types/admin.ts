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
  cognitoUsername: string | null
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
