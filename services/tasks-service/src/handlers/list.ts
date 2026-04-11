import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/tasks */
export async function handleList(hoaId: string): Promise<r.ApiResponse> {
  const tasks = await repo.listTasks(hoaId)
  return r.ok(tasks)
}
