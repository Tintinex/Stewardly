import * as r from '../../../shared/response'
import * as repo from '../repository'

/** GET /api/threads/{threadId}/posts */
export async function handleListPosts(hoaId: string, threadId: string, role: string): Promise<r.ApiResponse> {
  const thread = await repo.getThreadBoard(hoaId, threadId)
  if (!thread) return r.notFound('Thread')

  if (thread.boardVisibility === 'board_only' && role === 'homeowner') {
    return r.forbidden('This board is restricted to board members')
  }

  const posts = await repo.listPosts(hoaId, threadId)
  return r.ok(posts)
}
