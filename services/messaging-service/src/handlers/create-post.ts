import * as r from '../../../shared/response'
import * as repo from '../repository'

/** POST /api/threads/{threadId}/posts */
export async function handleCreatePost(body: string | null, hoaId: string, threadId: string, userId: string, role: string): Promise<r.ApiResponse> {
  if (!body) return r.badRequest('Request body is required')

  const parsed = JSON.parse(body) as { body?: string }
  if (!parsed.body?.trim()) return r.badRequest('body is required')

  const thread = await repo.getThreadBoard(hoaId, threadId)
  if (!thread) return r.notFound('Thread')

  if (thread.boardVisibility === 'board_only' && role === 'homeowner') {
    return r.forbidden('This board is restricted to board members')
  }

  const post = await repo.createPost(hoaId, threadId, userId, parsed.body.trim())
  return r.created(post)
}
