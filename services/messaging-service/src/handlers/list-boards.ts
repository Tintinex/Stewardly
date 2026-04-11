import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/boards */
export async function handleListBoards(hoaId: string, role: string): Promise<r.ApiResponse> {
  const includePrivate = role !== 'homeowner'
  const boards = await repo.listBoards(hoaId, includePrivate)
  return r.ok(boards)
}
