export interface Board {
  id: string
  name: string
  description: string | null
  visibility: 'community_wide' | 'board_only'
  threadCount: number
}

export interface Thread {
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

export interface Post {
  id: string
  threadId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}
