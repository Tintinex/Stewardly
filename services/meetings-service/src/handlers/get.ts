import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/meetings/{meetingId} */
export async function handleGet(hoaId: string, meetingId: string): Promise<r.ApiResponse> {
  const meeting = await repo.getMeeting(hoaId, meetingId)
  if (!meeting) return r.notFound('Meeting')
  return r.ok(meeting)
}
