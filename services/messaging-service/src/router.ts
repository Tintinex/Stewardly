import type { LambdaEvent } from '../../shared/types'
import * as r from '../../shared/response'
import { handleListBoards } from './handlers/list-boards'
import { handleListThreads } from './handlers/list-threads'
import { handleListPosts } from './handlers/list-posts'
import { handleCreatePost } from './handlers/create-post'

export async function route(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId, role } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const boardId = event.pathParameters?.boardId
  const threadId = event.pathParameters?.threadId

  if (method === 'GET' && !boardId && !threadId)  return handleListBoards(hoaId, role)
  if (method === 'GET' && boardId && !threadId)    return handleListThreads(hoaId, boardId, role)
  if (method === 'GET' && threadId)                return handleListPosts(hoaId, threadId, role)
  if (method === 'POST' && threadId)               return handleCreatePost(event.body ?? null, hoaId, threadId, userId, role)

  return r.badRequest(`Unsupported route: ${method} ${event.requestContext.http.path}`)
}
