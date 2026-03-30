import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'
import { query, queryOne, execute, param } from '../shared/db/client'
import * as r from '../shared/response'

interface AuthorizerContext {
  hoaId: string
  userId: string
  role: string
}

type MessagingEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

interface Board {
  id: string
  name: string
  description: string | null
  visibility: string
  threadCount: number
}

interface Thread {
  id: string
  boardId: string
  title: string
  authorId: string
  authorName: string
  pinned: boolean
  postCount: number
  lastPostAt: string
  createdAt: string
}

interface Post {
  id: string
  threadId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}

export const handler = async (event: MessagingEvent) => {
  const hoaId = event.requestContext.authorizer.lambda.hoaId
  const userId = event.requestContext.authorizer.lambda.userId
  const role = event.requestContext.authorizer.lambda.role

  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const path = event.requestContext.http.path
  const boardId = event.pathParameters?.boardId
  const threadId = event.pathParameters?.threadId

  try {
    // GET /api/boards
    if (method === 'GET' && path.endsWith('/boards')) {
      let sql = `SELECT b.id, b.name, b.description, b.visibility,
                        COUNT(t.id)::int as thread_count
                 FROM boards b
                 LEFT JOIN threads t ON t.board_id = b.id AND t.deleted_at IS NULL
                 WHERE b.hoa_id = :hoaId`
      const params = [param.string('hoaId', hoaId)]

      // Homeowners cannot see board_only boards
      if (role === 'homeowner') {
        sql += ` AND b.visibility = 'community_wide'`
      }

      sql += ` GROUP BY b.id ORDER BY b.created_at ASC`
      const boards = await query<Board>(sql, params)
      return r.ok(boards)
    }

    // GET /api/boards/{boardId}/threads
    if (method === 'GET' && boardId && path.includes('/threads') && !threadId) {
      // Check board visibility
      const board = await queryOne<{ id: string; visibility: string }>(
        'SELECT id, visibility FROM boards WHERE id = :boardId AND hoa_id = :hoaId',
        [param.string('boardId', boardId), param.string('hoaId', hoaId)],
      )
      if (!board) return r.notFound('Board')

      if (board.visibility === 'board_only' && role === 'homeowner') {
        return r.forbidden('This board is restricted to board members')
      }

      const threads = await query<Thread>(
        `SELECT t.id, t.board_id, t.title, t.author_id,
                CONCAT(o.first_name, ' ', o.last_name) as author_name,
                t.pinned,
                COUNT(p.id)::int as post_count,
                MAX(p.created_at) as last_post_at,
                t.created_at
         FROM threads t
         JOIN owners o ON o.id = t.author_id
         LEFT JOIN posts p ON p.thread_id = t.id AND p.deleted_at IS NULL
         WHERE t.board_id = :boardId AND t.hoa_id = :hoaId AND t.deleted_at IS NULL
         GROUP BY t.id, o.first_name, o.last_name
         ORDER BY t.pinned DESC, COALESCE(MAX(p.created_at), t.created_at) DESC`,
        [param.string('boardId', boardId), param.string('hoaId', hoaId)],
      )
      return r.ok(threads)
    }

    // GET /api/threads/{threadId}/posts
    if (method === 'GET' && threadId && path.includes('/posts')) {
      // Check thread/board visibility
      const thread = await queryOne<{ id: string; boardVisibility: string }>(
        `SELECT t.id, b.visibility as board_visibility
         FROM threads t
         JOIN boards b ON b.id = t.board_id
         WHERE t.id = :threadId AND t.hoa_id = :hoaId AND t.deleted_at IS NULL`,
        [param.string('threadId', threadId), param.string('hoaId', hoaId)],
      )
      if (!thread) return r.notFound('Thread')

      if (thread.boardVisibility === 'board_only' && role === 'homeowner') {
        return r.forbidden('This board is restricted to board members')
      }

      const posts = await query<Post>(
        `SELECT p.id, p.thread_id, p.author_id,
                CONCAT(o.first_name, ' ', o.last_name) as author_name,
                p.body, p.created_at, p.updated_at
         FROM posts p
         JOIN owners o ON o.id = p.author_id
         WHERE p.thread_id = :threadId AND p.hoa_id = :hoaId AND p.deleted_at IS NULL
         ORDER BY p.created_at ASC`,
        [param.string('threadId', threadId), param.string('hoaId', hoaId)],
      )
      return r.ok(posts)
    }

    // POST /api/threads/{threadId}/posts
    if (method === 'POST' && threadId && path.includes('/posts')) {
      if (!event.body) return r.badRequest('Request body is required')
      const body = JSON.parse(event.body) as { body?: string }
      if (!body.body?.trim()) return r.badRequest('body is required')

      // Check thread/board visibility
      const thread = await queryOne<{ id: string; boardVisibility: string }>(
        `SELECT t.id, b.visibility as board_visibility
         FROM threads t
         JOIN boards b ON b.id = t.board_id
         WHERE t.id = :threadId AND t.hoa_id = :hoaId AND t.deleted_at IS NULL`,
        [param.string('threadId', threadId), param.string('hoaId', hoaId)],
      )
      if (!thread) return r.notFound('Thread')

      if (thread.boardVisibility === 'board_only' && role === 'homeowner') {
        return r.forbidden('This board is restricted to board members')
      }

      await execute(
        `INSERT INTO posts (id, thread_id, hoa_id, author_id, body)
         VALUES (gen_random_uuid(), :threadId, :hoaId, :authorId, :body)`,
        [
          param.string('threadId', threadId),
          param.string('hoaId', hoaId),
          param.string('authorId', userId),
          param.string('body', body.body.trim()),
        ],
      )

      // Update thread's updated_at
      await execute(
        'UPDATE threads SET updated_at = NOW() WHERE id = :threadId',
        [param.string('threadId', threadId)],
      )

      const created = await queryOne<Post>(
        `SELECT p.id, p.thread_id, p.author_id,
                CONCAT(o.first_name, ' ', o.last_name) as author_name,
                p.body, p.created_at, p.updated_at
         FROM posts p
         JOIN owners o ON o.id = p.author_id
         WHERE p.thread_id = :threadId AND p.author_id = :authorId
         ORDER BY p.created_at DESC LIMIT 1`,
        [param.string('threadId', threadId), param.string('authorId', userId)],
      )
      return r.created(created)
    }

    return r.badRequest('Unsupported method')
  } catch (err) {
    console.error('Messaging handler error:', err)
    return r.serverError()
  }
}
