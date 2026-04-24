import * as r from '../../../shared/response'
import { getDashboardData } from '../repository'
import { getMonitoringData } from '../cloudwatch'

export async function handleAdminDashboard(): Promise<r.ApiResponse> {
  // Fetch monitoring data to enrich system health summary
  const monitoring = await getMonitoringData(process.env.STAGE ?? 'dev').catch(() => ({
    lambdaMetrics: [],
    apiGateway4xx: 0,
    apiGateway5xx: 0,
    dbConnections: 0,
    dbCpuPercent: 0,
    collectedAt: new Date().toISOString(),
  }))

  const data = await getDashboardData(monitoring)
  return r.ok(data)
}
