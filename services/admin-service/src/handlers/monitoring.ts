import * as r from '../../../shared/response'
import { getMonitoringData } from '../cloudwatch'

export async function handleMonitoring(): Promise<r.ApiResponse> {
  const stage = process.env.STAGE ?? 'dev'
  const data = await getMonitoringData(stage)
  return r.ok(data)
}
