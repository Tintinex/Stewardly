'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText, Download, Upload, Scale, Calendar, BookOpen,
  FileSpreadsheet, FolderOpen, X, AlertCircle, Trash2, Link2,
  Mail, Shield, ClipboardList, Bell, DollarSign, CreditCard,
  FileCheck, Gavel, BookMarked, CloudUpload, Check, Plus,
  ExternalLink, Sparkles, ChevronDown, ChevronUp, MessageSquare,
  Loader2, Send,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { config } from '@/lib/config'
import { getAuthToken } from '@/lib/amplify'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { clsx } from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentRecord {
  id: string
  title: string
  description: string | null
  category: string
  autoCategory: string | null
  s3Key: string | null
  fileUrl: string | null
  fileName: string
  fileType: string | null
  fileSizeBytes: number | null
  source: string
  uploadedBy: string
  uploadedByName: string | null
  createdAt: string
  processingStatus: string
  aiSummary: string | null
  aiKeyPoints: string[] | null
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Session expired. Please sign out and sign in again.')
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((e as { message: string }).message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Category config ──────────────────────────────────────────────────────────

type CatDef = { value: string; label: string; Icon: React.ElementType; color: string }

const CATEGORY_DEFS: CatDef[] = [
  { value: 'bylaws',          label: 'By-Laws',         Icon: Scale,           color: 'bg-indigo-100 text-indigo-600'   },
  { value: 'budget',          label: 'Budget',           Icon: DollarSign,      color: 'bg-emerald-100 text-emerald-600' },
  { value: 'financial',       label: 'Financial',        Icon: FileSpreadsheet, color: 'bg-green-100 text-green-600'     },
  { value: 'receipts',        label: 'Receipts',         Icon: CreditCard,      color: 'bg-lime-100 text-lime-600'       },
  { value: 'legal',           label: 'Legal',            Icon: Gavel,           color: 'bg-purple-100 text-purple-600'   },
  { value: 'contracts',       label: 'Contracts',        Icon: FileCheck,       color: 'bg-violet-100 text-violet-600'   },
  { value: 'sow',             label: 'Scope of Work',    Icon: ClipboardList,   color: 'bg-orange-100 text-orange-600'   },
  { value: 'meeting_minutes', label: 'Meeting Minutes',  Icon: Calendar,        color: 'bg-blue-100 text-blue-600'       },
  { value: 'rules',           label: 'Rules & Regs',     Icon: BookOpen,        color: 'bg-amber-100 text-amber-600'     },
  { value: 'notices',         label: 'Notices',          Icon: Bell,            color: 'bg-yellow-100 text-yellow-600'   },
  { value: 'insurance',       label: 'Insurance',        Icon: Shield,          color: 'bg-cyan-100 text-cyan-600'       },
  { value: 'forms',           label: 'Forms',            Icon: BookMarked,      color: 'bg-teal-100 text-teal-600'       },
  { value: 'general',         label: 'General',          Icon: FileText,        color: 'bg-gray-100 text-gray-500'       },
]

const CATEGORY_MAP = Object.fromEntries(CATEGORY_DEFS.map(c => [c.value, c]))

function getCategoryDef(value: string): CatDef {
  return CATEGORY_MAP[value] ?? { value, label: value, Icon: FileText, color: 'bg-gray-100 text-gray-500' }
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

const ALLOWED_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt'

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain',
])

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sourceLabel(source: string): string {
  if (source === 'google_drive') return 'Drive'
  if (source === 'email') return 'Email'
  return ''
}

// ─── Upload helpers ────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

async function uploadFileViaPresignedUrl(
  file: File,
  title: string,
  category: string,
  description: string,
): Promise<DocumentRecord> {
  // Step 1: get presigned PUT URL + allocation IDs from our API
  const { uploadUrl, s3Key, docId } = await apiFetch<{
    uploadUrl: string; s3Key: string; docId: string; suggestedCategory: string
  }>('/api/documents/presigned-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, title }),
  })

  // Step 2: PUT directly to S3 — no proxy, no Lambda memory used
  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!s3Res.ok) throw new Error(`S3 upload failed (${s3Res.status})`)

  // Step 3: create DB record (triggers async AI processing)
  return apiFetch<DocumentRecord>('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docId,
      s3Key,
      title,
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      ...(category ? { category } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    }),
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { role, hoaId, isLoading: authLoading } = useAuth()

  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('all')

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [uploadTab, setUploadTab] = useState<'file' | 'drive' | 'email'>('file')

  // File upload form
  const [dragOver, setDragOver] = useState(false)
  const [formFile, setFormFile] = useState<File | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [fileStatus, setFileStatus] = useState<UploadStatus>('idle')
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drive form
  const [driveUrl, setDriveUrl] = useState('')
  const [driveTitle, setDriveTitle] = useState('')
  const [driveCategory, setDriveCategory] = useState('')
  const [driveDesc, setDriveDesc] = useState('')
  const [driveStatus, setDriveStatus] = useState<UploadStatus>('idle')
  const [driveError, setDriveError] = useState<string | null>(null)

  // Inline actions
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null)

  // Q&A panel
  const [qaQuestion, setQaQuestion] = useState('')
  const [qaAnswer, setQaAnswer] = useState<string | null>(null)
  const [qaSources, setQaSources] = useState<string[]>([])
  const [qaLoading, setQaLoading] = useState(false)
  const [qaError, setQaError] = useState<string | null>(null)
  const [showQa, setShowQa] = useState(false)

  const isBoardMember = role === 'board_admin' || role === 'board_member'
  const hasAiDocs = documents.some(d => d.aiSummary || (d.aiKeyPoints && d.aiKeyPoints.length > 0))

  // ─── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return
    apiFetch<DocumentRecord[]>('/api/documents')
      .then(setDocuments)
      .catch(err => setPageError(err instanceof Error ? err.message : 'Failed to load documents'))
      .finally(() => setIsLoading(false))
  }, [authLoading])

  const filteredDocuments = activeCategory === 'all'
    ? documents
    : documents.filter(d => d.category === activeCategory)

  // ─── Drag / file select ────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!ALLOWED_MIME.has(file.type)) {
      setFileError('Unsupported file type. Please use PDF, Word, Excel, PowerPoint, or an image.')
      return
    }
    setFileError(null)
    setFormFile(file)
    if (!formTitle) setFormTitle(file.name.replace(/\.[^.]+$/, ''))
  }, [formTitle])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    setFormFile(file)
    if (!formTitle) setFormTitle(file.name.replace(/\.[^.]+$/, ''))
  }

  // ─── Upload file ───────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formFile || !formTitle.trim()) return
    setFileError(null)
    setFileStatus('uploading')
    try {
      const doc = await uploadFileViaPresignedUrl(formFile, formTitle.trim(), formCategory, formDesc)
      setDocuments(prev => [doc, ...prev])
      setFileStatus('done')
      setTimeout(() => closeModal(), 1200)
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Upload failed')
      setFileStatus('error')
    }
  }

  // ─── Drive import ──────────────────────────────────────────────────────────

  const handleDriveImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!driveUrl.trim() || !driveTitle.trim()) return
    setDriveError(null)
    setDriveStatus('uploading')
    try {
      const doc = await apiFetch<DocumentRecord>('/api/documents/from-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveUrl: driveUrl.trim(),
          title: driveTitle.trim(),
          ...(driveCategory ? { category: driveCategory } : {}),
          ...(driveDesc.trim() ? { description: driveDesc.trim() } : {}),
        }),
      })
      setDocuments(prev => [doc, ...prev])
      setDriveStatus('done')
      setTimeout(() => closeModal(), 1200)
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Import failed')
      setDriveStatus('error')
    }
  }

  // ─── Download ──────────────────────────────────────────────────────────────

  const handleDownload = async (doc: DocumentRecord) => {
    setDownloadingId(doc.id)
    try {
      const { downloadUrl } = await apiFetch<{ downloadUrl: string }>(
        `/api/documents/${doc.id}/download`,
      )
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = doc.fileName
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to get download URL')
    } finally {
      setDownloadingId(null)
    }
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (docId: string) => {
    setDeleteLoading(true)
    try {
      await apiFetch(`/api/documents/${docId}`, { method: 'DELETE' })
      setDocuments(prev => prev.filter(d => d.id !== docId))
      setDeletingId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete document')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ─── Q&A ──────────────────────────────────────────────────────────────────

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = qaQuestion.trim()
    if (!q) return
    setQaLoading(true)
    setQaAnswer(null)
    setQaSources([])
    setQaError(null)
    try {
      const res = await apiFetch<{ answer: string; sourceTitles: string[]; hasDocuments: boolean }>(
        '/api/documents/ask',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        },
      )
      setQaAnswer(res.answer)
      setQaSources(res.sourceTitles)
    } catch (err) {
      setQaError(err instanceof Error ? err.message : 'Failed to get answer')
    } finally {
      setQaLoading(false)
    }
  }

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  const closeModal = () => {
    setIsModalOpen(false)
    setFormFile(null); setFormTitle(''); setFormCategory(''); setFormDesc('')
    setFileStatus('idle'); setFileError(null)
    setDriveUrl(''); setDriveTitle(''); setDriveCategory(''); setDriveDesc('')
    setDriveStatus('idle'); setDriveError(null)
    setUploadTab('file')
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (authLoading || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="font-semibold text-red-700">Unable to load documents</p>
        <p className="mt-1 text-sm text-red-500">{pageError}</p>
      </div>
    )
  }

  const hoaEmailAddress = hoaId
    ? `docs+${hoaId.replace(/-/g, '').slice(0, 12)}@stewardly.app`
    : 'docs@stewardly.app'

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">
            HOA document library · {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Ask AI button — always visible when docs have AI content */}
          {documents.length > 0 && (
            <Button
              variant="outline"
              leftIcon={<MessageSquare className="h-4 w-4" />}
              onClick={() => setShowQa(v => !v)}
            >
              Ask AI
            </Button>
          )}
          {isBoardMember && (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setIsModalOpen(true)}
            >
              Add Document
            </Button>
          )}
        </div>
      </div>

      {/* ── AI Q&A panel ─────────────────────────────────────────────────────── */}
      {showQa && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Ask about your HOA documents</p>
              <p className="text-sm text-gray-500">
                Ask questions about rules, bylaws, policies, or anything in your document library.
              </p>
            </div>
          </div>

          <form onSubmit={handleAskQuestion} className="flex gap-2">
            <input
              type="text"
              value={qaQuestion}
              onChange={e => setQaQuestion(e.target.value)}
              placeholder="e.g. What are the pet rules? Can I rent my unit?"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            />
            <Button
              type="submit"
              isLoading={qaLoading}
              disabled={!qaQuestion.trim() || qaLoading}
              leftIcon={<Send className="h-4 w-4" />}
            >
              Ask
            </Button>
          </form>

          {qaLoading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-teal-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Searching your documents…</span>
            </div>
          )}

          {qaError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{qaError}
            </div>
          )}

          {qaAnswer && (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-white bg-white px-5 py-4 shadow-sm">
                <p className="text-sm font-semibold text-teal-700 mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" /> AI Answer
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{qaAnswer}</p>
              </div>
              {qaSources.length > 0 && (
                <p className="text-xs text-gray-400">
                  Sources: {qaSources.slice(0, 5).join(', ')}{qaSources.length > 5 ? ` +${qaSources.length - 5} more` : ''}
                </p>
              )}
              <p className="text-xs text-amber-600">
                AI answers are based on your uploaded documents and may not cover all situations. Always verify with your board for official guidance.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Category filter tabs ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={clsx(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            activeCategory === 'all'
              ? 'bg-navy text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
          )}
        >
          All
          <span className={clsx('ml-1.5 text-xs', activeCategory === 'all' ? 'text-white/70' : 'text-gray-400')}>
            {documents.length}
          </span>
        </button>
        {CATEGORY_DEFS.map(cat => {
          const count = documents.filter(d => d.category === cat.value).length
          if (count === 0 && activeCategory !== cat.value) return null
          return (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={clsx(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                activeCategory === cat.value
                  ? 'bg-navy text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {cat.label}
              <span className={clsx('ml-1.5 text-xs', activeCategory === cat.value ? 'text-white/70' : 'text-gray-400')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Document grid ────────────────────────────────────────────────────── */}
      {filteredDocuments.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" />}
          title={activeCategory === 'all' ? 'No documents yet' : `No ${getCategoryDef(activeCategory).label} documents`}
          description={
            isBoardMember
              ? 'Upload files, import from Google Drive, or email documents directly.'
              : 'Documents shared by the board will appear here.'
          }
          ctaLabel={isBoardMember ? 'Add Document' : undefined}
          onCta={isBoardMember ? () => setIsModalOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map(doc => {
            const cat = getCategoryDef(doc.category)
            const canDelete = isBoardMember
            const isProcessing = doc.processingStatus === 'processing' || doc.processingStatus === 'pending'
            const hasAi = !!(doc.aiSummary || (doc.aiKeyPoints && doc.aiKeyPoints.length > 0))
            const summaryExpanded = expandedSummaryId === doc.id

            return (
              <div
                key={doc.id}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Top */}
                <div className="flex items-start gap-3 p-4">
                  <div className={clsx(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    cat.color,
                  )}>
                    <cat.Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2">{doc.title}</h3>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <Badge variant="default">{cat.label}</Badge>
                      {isProcessing && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 border border-amber-100">
                          <Loader2 className="h-3 w-3 animate-spin" />AI processing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {doc.description && (
                  <div className="px-4 pb-1">
                    <p className="text-sm text-gray-500 line-clamp-2">{doc.description}</p>
                  </div>
                )}

                {/* AI Summary (expandable) */}
                {hasAi && (
                  <div className="mx-4 mb-2 rounded-lg border border-teal-100 bg-teal-50/50">
                    <button
                      onClick={() => setExpandedSummaryId(summaryExpanded ? null : doc.id)}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-50 transition-colors rounded-lg"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>AI Summary</span>
                      {summaryExpanded
                        ? <ChevronUp className="ml-auto h-3.5 w-3.5" />
                        : <ChevronDown className="ml-auto h-3.5 w-3.5" />}
                    </button>

                    {summaryExpanded && (
                      <div className="px-3 pb-3 pt-0 space-y-2">
                        {doc.aiSummary && (
                          <p className="text-xs text-gray-600 leading-relaxed">{doc.aiSummary}</p>
                        )}
                        {doc.aiKeyPoints && doc.aiKeyPoints.length > 0 && (
                          <ul className="space-y-1">
                            {doc.aiKeyPoints.map((pt, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                                {pt}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-auto border-t border-gray-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 text-xs text-gray-400 space-y-0.5">
                      <p className="truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{formatBytes(doc.fileSizeBytes)}</span>
                        <span>·</span>
                        <span>{format(parseISO(doc.createdAt), 'MMM d, yyyy')}</span>
                        {doc.source && doc.source !== 'upload' && (
                          <>
                            <span>·</span>
                            <span>{sourceLabel(doc.source)}</span>
                          </>
                        )}
                      </div>
                      {doc.uploadedByName && (
                        <p className="truncate">by {doc.uploadedByName}</p>
                      )}
                    </div>

                    <div className="ml-3 flex shrink-0 items-center gap-0.5">
                      {/* Download */}
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-teal-50 hover:text-teal-600 disabled:opacity-50"
                        title="Download"
                      >
                        {downloadingId === doc.id
                          ? <Spinner size="sm" />
                          : <Download className="h-4 w-4" />}
                      </button>

                      {/* Delete */}
                      {canDelete && (
                        deletingId === doc.id ? (
                          <div className="flex items-center gap-1 ml-1">
                            <button
                              onClick={() => handleDelete(doc.id)}
                              disabled={deleteLoading}
                              className="rounded px-2 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                            >
                              {deleteLoading ? '…' : 'Delete'}
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="rounded p-1 text-gray-400 hover:text-gray-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(doc.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add Document Modal ───────────────────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Add Document"
        size="md"
      >
        {/* Tab bar */}
        <div className="mb-5 flex rounded-lg bg-gray-100 p-1 gap-1">
          {(
            [
              { key: 'file',  label: 'Upload File',   Icon: CloudUpload },
              { key: 'drive', label: 'Google Drive',  Icon: Link2       },
              { key: 'email', label: 'Email to HOA',  Icon: Mail        },
            ] as const
          ).map(tab => (
            <button
              key={tab.key}
              onClick={() => setUploadTab(tab.key)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
                uploadTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <tab.Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── File upload ──────────────────────────────────────────────────── */}
        {uploadTab === 'file' && (
          <form onSubmit={handleFileUpload} className="space-y-4">
            {fileError && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <X className="mt-0.5 h-4 w-4 shrink-0" />{fileError}
              </div>
            )}
            {fileStatus === 'done' && (
              <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <Check className="h-4 w-4 shrink-0" />Uploaded! AI is analyzing the document in the background.
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                dragOver         ? 'border-teal-400 bg-teal-50'
                : formFile       ? 'border-teal-300 bg-teal-50'
                :                  'border-gray-200 bg-gray-50 hover:border-teal-300 hover:bg-teal-50/30',
              )}
            >
              {formFile ? (
                <div className="flex flex-col items-center gap-1">
                  <FileText className="h-8 w-8 text-teal-500" />
                  <span className="font-medium text-teal-700 text-sm">{formFile.name}</span>
                  <span className="text-xs text-teal-500">{formatBytes(formFile.size)}</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFormFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="mt-1 text-xs text-teal-400 hover:text-teal-600 underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <CloudUpload className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                  <p className="text-sm font-medium text-gray-600">
                    Drag & drop, or{' '}
                    <span className="text-teal-600">browse files</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    PDF, Word, Excel, PowerPoint, or image · max 50 MB
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept={ALLOWED_ACCEPT}
                onChange={handleFileSelect}
              />
            </div>

            <Input
              label="Title"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="e.g., 2024 Annual Budget"
              required
            />

            <CategorySelect value={formCategory} onChange={setFormCategory} />
            <DescriptionField value={formDesc} onChange={setFormDesc} />

            <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2.5 text-xs text-teal-700">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              AI will automatically generate a summary and key points after upload.
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button
                type="submit"
                isLoading={fileStatus === 'uploading'}
                disabled={!formFile || !formTitle.trim() || fileStatus === 'uploading'}
                leftIcon={<Upload className="h-4 w-4" />}
              >
                {fileStatus === 'uploading' ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </form>
        )}

        {/* ── Google Drive ─────────────────────────────────────────────────── */}
        {uploadTab === 'drive' && (
          <form onSubmit={handleDriveImport} className="space-y-4">
            {driveError && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <X className="mt-0.5 h-4 w-4 shrink-0" />{driveError}
              </div>
            )}
            {driveStatus === 'done' && (
              <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <Check className="h-4 w-4 shrink-0" />Imported! AI is analyzing the document in the background.
              </div>
            )}

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <p className="font-medium mb-1">Requirements</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-600">
                <li>Share the file as <strong>"Anyone with the link can view"</strong></li>
                <li>Supports Drive, Docs, Sheets, and Slides share URLs</li>
                <li>Max file size: 50 MB</li>
              </ul>
            </div>

            <Input
              label="Google Drive URL"
              value={driveUrl}
              onChange={e => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/…"
              required
            />

            <Input
              label="Title"
              value={driveTitle}
              onChange={e => setDriveTitle(e.target.value)}
              placeholder="e.g., Parking Policy 2024"
              required
            />

            <CategorySelect value={driveCategory} onChange={setDriveCategory} />
            <DescriptionField value={driveDesc} onChange={setDriveDesc} />

            <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2.5 text-xs text-teal-700">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              AI will automatically generate a summary and key points after import.
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button
                type="submit"
                isLoading={driveStatus === 'uploading'}
                disabled={!driveUrl.trim() || !driveTitle.trim() || driveStatus === 'uploading'}
                leftIcon={<ExternalLink className="h-4 w-4" />}
              >
                {driveStatus === 'uploading' ? 'Importing…' : 'Import from Drive'}
              </Button>
            </div>
          </form>
        )}

        {/* ── Email instructions ───────────────────────────────────────────── */}
        {uploadTab === 'email' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-semibold text-gray-800">Your HOA document email address</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">
                Forward any email with attachments to this address to save documents automatically.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-mono text-teal-700 break-all">
                  {hoaEmailAddress}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(hoaEmailAddress)}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <p className="font-semibold text-gray-800">How it works</p>
              <ol className="list-decimal list-inside space-y-1.5 text-gray-600 text-sm">
                <li>Forward any email with PDF or document attachments to the address above</li>
                <li>Attachments are automatically downloaded and stored in your library</li>
                <li>Documents are auto-categorized based on the filename and subject line</li>
                <li>New documents appear in this library within a few minutes</li>
              </ol>
            </div>

            <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
              <p className="font-medium text-amber-800">Email import coming soon</p>
              <p className="mt-0.5 text-xs text-amber-600">
                This feature is being configured for your HOA and will be available shortly.
              </p>
            </div>

            <Button variant="outline" onClick={closeModal} className="w-full">
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        Category{' '}
        <span className="font-normal text-gray-400">(auto-detected if left blank)</span>
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
      >
        <option value="">Auto-detect from filename &amp; title</option>
        {CATEGORY_DEFS.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </div>
  )
}

function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        Description{' '}
        <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Brief description of this document…"
        rows={2}
        className="block w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
      />
    </div>
  )
}
