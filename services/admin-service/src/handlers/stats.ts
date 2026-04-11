import * as r from '../../../shared/response'
import { getPlatformStats } from '../repository'

export async function handlePlatformStats(): Promise<r.ApiResponse> {
  const stats = await getPlatformStats()
  return r.ok(stats)
}
