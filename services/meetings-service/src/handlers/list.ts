import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/meetings */
export async function handleList(hoaId: string): Promise<r.ApiResponse> {
  const meetings = await repo.listMeetings(hoaId)
  return r.ok(meetings)
}
