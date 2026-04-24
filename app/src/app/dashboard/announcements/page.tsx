'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Send, MessageSquare, Pin } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Board, Thread, Post } from '@/types'
import { clsx } from 'clsx'

export default function AnnouncementsPage() {
  const { hoaId, role, isLoading: authLoading } = useAuth()

  const [boards, setBoards] = useState<Board[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [posts, setPosts] = useState<Post[]>([])

  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null)
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [postsLoading, setPostsLoading] = useState(false)

  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)

  const [isNewThreadModalOpen, setIsNewThreadModalOpen] = useState(false)
  const [newThreadTitle, setNewThreadTitle] = useState('')
  const [newThreadBody, setNewThreadBody] = useState('')
  const [newThreadLoading, setNewThreadLoading] = useState(false)

  const postsEndRef = useRef<HTMLDivElement>(null)

  const canCreateThread = role === 'board_admin' || role === 'board_member'

  // Load boards — homeowners only see community_wide
  useEffect(() => {
    if (authLoading) return
    if (!hoaId) { setIsLoading(false); return }

    api.getBoards(hoaId).then(data => {
      const visible = role === 'homeowner'
        ? data.filter(b => b.visibility === 'community_wide')
        : data.filter(b => b.visibility === 'community_wide')
      setBoards(visible)
      if (visible.length > 0) setSelectedBoard(visible[0])
    }).finally(() => setIsLoading(false))
  }, [authLoading, hoaId, role])

  // Load threads when board changes
  useEffect(() => {
    if (!hoaId || !selectedBoard) return
    setThreadsLoading(true)
    setSelectedThread(null)
    setPosts([])
    api.getThreads(hoaId, selectedBoard.id).then(data => {
      // Sort: pinned first, then by lastPostAt desc
      const sorted = [...data].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return new Date(b.lastPostAt).getTime() - new Date(a.lastPostAt).getTime()
      })
      setThreads(sorted)
      if (sorted.length > 0) setSelectedThread(sorted[0])
    }).finally(() => setThreadsLoading(false))
  }, [hoaId, selectedBoard])

  // Load posts when thread changes
  useEffect(() => {
    if (!hoaId || !selectedThread) return
    setPostsLoading(true)
    api.getPosts(hoaId, selectedThread.id).then(setPosts).finally(() => setPostsLoading(false))
  }, [hoaId, selectedThread])

  // Scroll to bottom on new posts
  useEffect(() => {
    postsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [posts])

  const handleSendReply = useCallback(async () => {
    if (!hoaId || !selectedThread || !replyText.trim()) return
    setReplyLoading(true)
    try {
      const post = await api.createPost(hoaId, selectedThread.id, { body: replyText.trim() })
      setPosts(prev => [...prev, post])
      setReplyText('')
      // update thread postCount locally
      setThreads(prev => prev.map(t =>
        t.id === selectedThread.id
          ? { ...t, postCount: t.postCount + 1, lastPostAt: post.createdAt }
          : t,
      ))
    } finally {
      setReplyLoading(false)
    }
  }, [hoaId, selectedThread, replyText])

  const handleNewThread = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hoaId || !selectedBoard || !newThreadTitle.trim() || !newThreadBody.trim()) return
    setNewThreadLoading(true)
    try {
      const newThread: Thread = {
        id: `thread-${Date.now()}`,
        boardId: selectedBoard.id,
        hoaId,
        title: newThreadTitle.trim(),
        authorId: 'current-user',
        authorName: 'You',
        pinned: false,
        postCount: 1,
        lastPostAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      setThreads(prev => [newThread, ...prev])
      setSelectedThread(newThread)
      setPosts([])
      setIsNewThreadModalOpen(false)
      setNewThreadTitle('')
      setNewThreadBody('')
    } finally {
      setNewThreadLoading(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500">Community bulletin boards</p>
        </div>
        {canCreateThread && selectedBoard && (
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setIsNewThreadModalOpen(true)}
          >
            New Discussion
          </Button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

        {/* Left: Board tabs */}
        {boards.length > 1 && (
          <div className="w-52 shrink-0 overflow-y-auto border-r border-gray-100 py-3">
            <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Boards</p>
            <ul>
              {boards.map(board => (
                <li key={board.id}>
                  <button
                    onClick={() => setSelectedBoard(board)}
                    className={clsx(
                      'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors',
                      selectedBoard?.id === board.id
                        ? 'bg-teal-50 font-semibold text-teal-700'
                        : 'text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <span className="min-w-0 truncate">{board.name}</span>
                    {board.threadCount > 0 && (
                      <span className="ml-auto shrink-0 text-xs text-gray-400">{board.threadCount}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Middle: Thread list */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-gray-100">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-gray-900">
              {selectedBoard?.name ?? 'Discussions'}
            </p>
            {canCreateThread && (
              <button
                onClick={() => setIsNewThreadModalOpen(true)}
                title="New discussion"
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-teal-600"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          {threadsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : threads.length === 0 ? (
            <EmptyState title="No discussions yet" description="Be the first to start a conversation." />
          ) : (
            <ul className="divide-y divide-gray-50">
              {threads.map(thread => (
                <li key={thread.id}>
                  <button
                    onClick={() => setSelectedThread(thread)}
                    className={clsx(
                      'w-full px-4 py-3 text-left transition-colors',
                      selectedThread?.id === thread.id ? 'bg-teal-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      {thread.pinned && (
                        <Pin className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-label="Pinned" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={clsx(
                          'truncate text-sm',
                          selectedThread?.id === thread.id
                            ? 'font-semibold text-teal-700'
                            : 'font-medium text-gray-900',
                        )}>
                          {thread.title}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {thread.authorName} · {thread.postCount} {thread.postCount === 1 ? 'post' : 'posts'}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {format(parseISO(thread.lastPostAt), 'MMM d')}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: Posts viewer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedThread ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<MessageSquare className="h-8 w-8" />}
                title="Select a discussion"
                description="Choose a thread from the list to read the conversation."
              />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="border-b border-gray-100 px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900">{selectedThread.title}</h2>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {selectedThread.postCount} {selectedThread.postCount === 1 ? 'post' : 'posts'} ·
                      Started by {selectedThread.authorName} ·
                      Last activity {format(parseISO(selectedThread.lastPostAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {selectedThread.pinned && (
                      <Badge variant="warning" className="flex items-center gap-1">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Posts */}
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {postsLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Spinner size="sm" />
                  </div>
                ) : posts.length === 0 ? (
                  <EmptyState title="No posts yet" description="Be the first to reply to this discussion." />
                ) : (
                  posts.map((post, idx) => (
                    <div key={post.id} className="flex gap-3">
                      <Avatar name={post.authorName} size="sm" className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-gray-900">{post.authorName}</span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(post.createdAt), 'MMM d, h:mm a')}
                          </span>
                          {idx === 0 && (
                            <Badge variant="info" className="text-xs">OP</Badge>
                          )}
                        </div>
                        <div className="mt-1.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                          <p className="whitespace-pre-wrap text-sm text-gray-700">{post.body}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={postsEndRef} />
              </div>

              {/* Reply composer */}
              <div className="border-t border-gray-100 px-5 py-3">
                <div className="flex items-end gap-3">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        void handleSendReply()
                      }
                    }}
                    placeholder="Write a reply... (Cmd+Enter to send)"
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition-colors focus:border-teal focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                  <Button
                    onClick={() => void handleSendReply()}
                    isLoading={replyLoading}
                    disabled={!replyText.trim()}
                    size="sm"
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Discussion Modal */}
      <Modal
        isOpen={isNewThreadModalOpen}
        onClose={() => {
          setIsNewThreadModalOpen(false)
          setNewThreadTitle('')
          setNewThreadBody('')
        }}
        title={`New Discussion${selectedBoard ? ` in ${selectedBoard.name}` : ''}`}
        size="md"
      >
        <form onSubmit={handleNewThread} className="space-y-4">
          <Input
            label="Title"
            value={newThreadTitle}
            onChange={e => setNewThreadTitle(e.target.value)}
            placeholder="What would you like to discuss?"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Message</label>
            <textarea
              value={newThreadBody}
              onChange={e => setNewThreadBody(e.target.value)}
              placeholder="Share your announcement or message with the community..."
              rows={5}
              required
              className="block w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsNewThreadModalOpen(false)
                setNewThreadTitle('')
                setNewThreadBody('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={newThreadLoading}
              disabled={!newThreadTitle.trim() || !newThreadBody.trim()}
            >
              Post Discussion
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
