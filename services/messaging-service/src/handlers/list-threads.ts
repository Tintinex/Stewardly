import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/boards/{boardId}/threads */
export async function handleListThreads(hoaId: string, boardId: string, role: string): Promise<r.ApiResponse> {
  const board = await repo.getBoard(hoaId, boardId)
  if (!board) return r.notFound('Board')

  if (board.visibility === 'board_only' && role === 'homeowner') {
    return r.forbidden('This board is restricted to board members')
  }

  const threads = await repo.listThreads(hoaId, boardId)
  return r.ok(threads)
}
