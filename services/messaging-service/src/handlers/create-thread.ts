import * as r from '../../../shared/response'
import * as repo from '../repository'

/** POST /api/boards/{boardId}/threads */
export async function handleCreateThread(
  body: string | null,
  hoaId: string,
  boardId: string,
  userId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body is required')

  const parsed = JSON.parse(body) as { title?: string; body?: string }
  if (!parsed.title?.trim()) return r.badRequest('title is required')
  if (!parsed.body?.trim()) return r.badRequest('body is required')

  // Check board exists and its visibility
  const board = await repo.getBoard(hoaId, boardId)
  if (!board) return r.notFound('Board')

  if (board.visibility === 'board_only' && role === 'homeowner') {
    return r.forbidden('This board is restricted to board members')
  }

  const thread = await repo.createThread(hoaId, boardId, userId, parsed.title.trim(), parsed.body.trim())
  return r.created(thread)
}
