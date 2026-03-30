'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Send, MessageSquare, Lock } from 'lucide-react'
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

export default function MessagesPage() {
  const { hoaId, role } = useAuth()
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

  // Load boards
  useEffect(() => {
    if (!hoaId) return
    api.getBoards(hoaId).then(data => {
      // Filter board_only boards for homeowners
      const visible = role === 'homeowner'
        ? data.filter(b => b.visibility === 'community_wide')
        : data
      setBoards(visible)
      if (visible.length > 0) setSelectedBoard(visible[0])
    }).finally(() => setIsLoading(false))
  }, [hoaId, role])

  // Load threads when board changes
  useEffect(() => {
    if (!hoaId || !selectedBoard) return
    setThreadsLoading(true)
    setSelectedThread(null)
    setPosts([])
    api.getThreads(hoaId, selectedBoard.id).then(data => {
      setThreads(data)
      if (data.length > 0) setSelectedThread(data[0])
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

  const handleSendReply = async () => {
    if (!hoaId || !selectedThread || !replyText.trim()) return
    setReplyLoading(true)
    try {
      const post = await api.createPost(hoaId, selectedThread.id, { body: replyText.trim() })
      setPosts(prev => [...prev, post])
      setReplyText('')
    } finally {
      setReplyLoading(false)
    }
  }

  const handleNewThread = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hoaId || !selectedBoard || !newThreadTitle.trim() || !newThreadBody.trim()) return
    setNewThreadLoading(true)
    try {
      // Create via post — in mock we just add to the thread list visually
      const newThread: Thread = {
        id: `thread-${Date.now()}`,
        boardId: selectedBoard.id,
        hoaId,
        title: newThreadTitle,
        authorId: 'user-001',
        authorName: 'Sarah Chen',
        pinned: false,
        postCount: 1,
        lastPostAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      setThreads(prev => [newThread, ...prev])
      setSelectedThread(newThread)
      setIsNewThreadModalOpen(false)
      setNewThreadTitle('')
      setNewThreadBody('')
    } finally {
      setNewThreadLoading(false)
    }
  }

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Message Boards</h1>
        <p className="text-sm text-gray-500">Community discussions and announcements</p>
      </div>

      <div className="flex flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Left panel: Boards */}
        <div className="w-48 shrink-0 overflow-y-auto border-r border-gray-100 py-3">
          <p className="px-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Boards</p>
          <ul>
            {boards.map(board => (
              <li key={board.id}>
                <button
                  onClick={() => setSelectedBoard(board)}
                  className={clsx(
                    'flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left',
                    selectedBoard?.id === board.id
                      ? 'bg-teal-50 text-teal font-medium'
                      : 'text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {board.visibility === 'board_only' && (
                    <Lock className="h-3 w-3 shrink-0 text-gray-400" />
                  )}
                  <span className="truncate">{board.name}</span>
                  {board.threadCount > 0 && (
                    <span className="ml-auto text-xs text-gray-400">{board.threadCount}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Middle panel: Threads */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-gray-100">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {selectedBoard?.name}
            </p>
            <button
              onClick={() => setIsNewThreadModalOpen(true)}
              title="New thread"
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-teal transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {threadsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : threads.length === 0 ? (
            <EmptyState title="No threads yet" description="Start a conversation." className="py-8" />
          ) : (
            <ul className="divide-y divide-gray-50">
              {threads.map(thread => (
                <li key={thread.id}>
                  <button
                    onClick={() => setSelectedThread(thread)}
                    className={clsx(
                      'w-full px-4 py-3 text-left transition-colors',
                      selectedThread?.id === thread.id
                        ? 'bg-teal-50'
                        : 'hover:bg-gray-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {thread.pinned && (
                        <span className="mt-0.5 text-gold" title="Pinned">📌</span>
                      )}
                      <div className="min-w-0">
                        <p className={clsx(
                          'text-sm truncate',
                          selectedThread?.id === thread.id ? 'font-semibold text-teal' : 'font-medium text-gray-900',
                        )}>
                          {thread.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {thread.authorName} · {thread.postCount} posts
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right panel: Posts */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedThread ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<MessageSquare className="h-8 w-8" />}
                title="Select a thread"
                description="Choose a thread from the left to read the conversation."
              />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="border-b border-gray-100 px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedThread.title}</h2>
                    <p className="text-xs text-gray-400">
                      {selectedThread.postCount} posts · Started by {selectedThread.authorName}
                    </p>
                  </div>
                  {selectedThread.pinned && (
                    <Badge variant="warning">Pinned</Badge>
                  )}
                </div>
              </div>

              {/* Posts */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {postsLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Spinner size="sm" />
                  </div>
                ) : posts.length === 0 ? (
                  <EmptyState title="No posts yet" description="Be the first to reply!" />
                ) : (
                  posts.map(post => (
                    <div key={post.id} className="flex gap-3">
                      <Avatar name={post.authorName} size="sm" className="shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-gray-900">{post.authorName}</span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(post.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <div className="mt-1 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.body}</p>
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
                    className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal focus:bg-white transition-colors"
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

      {/* New Thread Modal */}
      <Modal
        isOpen={isNewThreadModalOpen}
        onClose={() => { setIsNewThreadModalOpen(false); setNewThreadTitle(''); setNewThreadBody('') }}
        title={`New Thread in ${selectedBoard?.name ?? ''}`}
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
            <label className="text-sm font-medium text-gray-700">First Post</label>
            <textarea
              value={newThreadBody}
              onChange={e => setNewThreadBody(e.target.value)}
              placeholder="Share your message with the community..."
              rows={4}
              required
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsNewThreadModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={newThreadLoading}>
              Post Thread
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
