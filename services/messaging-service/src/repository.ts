import { query, queryOne, execute, param } from '../../shared/db/client'
import type { Board, Thread, Post } from './types'

export async function listBoards(hoaId: string, includePrivate: boolean): Promise<Board[]> {
  let sql = `
    SELECT b.id, b.name, b.description, b.visibility,
           COUNT(t.id)::int AS thread_count
    FROM boards b
    LEFT JOIN threads t ON t.board_id = b.id AND t.deleted_at IS NULL
    WHERE b.hoa_id = :hoaId`
  const params = [param.string('hoaId', hoaId)]

  if (!includePrivate) sql += ` AND b.visibility = 'community_wide'`
  sql += ` GROUP BY b.id ORDER BY b.created_at ASC`

  return query<Board>(sql, params)
}

export async function getBoard(hoaId: string, boardId: string): Promise<{ id: string; visibility: string } | null> {
  return queryOne<{ id: string; visibility: string }>(
    'SELECT id, visibility FROM boards WHERE id = :boardId AND hoa_id = :hoaId',
    [param.string('boardId', boardId), param.string('hoaId', hoaId)],
  )
}

export async function listThreads(hoaId: string, boardId: string): Promise<Thread[]> {
  return query<Thread>(
    `SELECT t.id, t.board_id, t.title, t.author_id,
            CONCAT(o.first_name, ' ', o.last_name) AS author_name,
            t.pinned,
            COUNT(p.id)::int AS post_count,
            MAX(p.created_at) AS last_post_at,
            t.created_at
     FROM threads t
     JOIN owners o ON o.id = t.author_id
     LEFT JOIN posts p ON p.thread_id = t.id AND p.deleted_at IS NULL
     WHERE t.board_id = :boardId AND t.hoa_id = :hoaId AND t.deleted_at IS NULL
     GROUP BY t.id, o.first_name, o.last_name
     ORDER BY t.pinned DESC, COALESCE(MAX(p.created_at), t.created_at) DESC`,
    [param.string('boardId', boardId), param.string('hoaId', hoaId)],
  )
}

export async function getThreadBoard(hoaId: string, threadId: string): Promise<{ id: string; boardVisibility: string } | null> {
  return queryOne<{ id: string; boardVisibility: string }>(
    `SELECT t.id, b.visibility AS board_visibility
     FROM threads t
     JOIN boards b ON b.id = t.board_id
     WHERE t.id = :threadId AND t.hoa_id = :hoaId AND t.deleted_at IS NULL`,
    [param.string('threadId', threadId), param.string('hoaId', hoaId)],
  )
}

export async function listPosts(hoaId: string, threadId: string): Promise<Post[]> {
  return query<Post>(
    `SELECT p.id, p.thread_id, p.author_id,
            CONCAT(o.first_name, ' ', o.last_name) AS author_name,
            p.body, p.created_at, p.updated_at
     FROM posts p
     JOIN owners o ON o.id = p.author_id
     WHERE p.thread_id = :threadId AND p.hoa_id = :hoaId AND p.deleted_at IS NULL
     ORDER BY p.created_at ASC`,
    [param.string('threadId', threadId), param.string('hoaId', hoaId)],
  )
}

export async function createPost(hoaId: string, threadId: string, authorId: string, body: string): Promise<Post | null> {
  await execute(
    `INSERT INTO posts (id, thread_id, hoa_id, author_id, body)
     VALUES (gen_random_uuid(), :threadId, :hoaId, :authorId, :body)`,
    [
      param.string('threadId', threadId),
      param.string('hoaId', hoaId),
      param.string('authorId', authorId),
      param.string('body', body),
    ],
  )
  await execute(
    'UPDATE threads SET updated_at = NOW() WHERE id = :threadId',
    [param.string('threadId', threadId)],
  )
  return queryOne<Post>(
    `SELECT p.id, p.thread_id, p.author_id,
            CONCAT(o.first_name, ' ', o.last_name) AS author_name,
            p.body, p.created_at, p.updated_at
     FROM posts p
     JOIN owners o ON o.id = p.author_id
     WHERE p.thread_id = :threadId AND p.author_id = :authorId
     ORDER BY p.created_at DESC LIMIT 1`,
    [param.string('threadId', threadId), param.string('authorId', authorId)],
  )
}
