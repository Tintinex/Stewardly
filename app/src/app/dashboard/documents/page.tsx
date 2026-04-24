'use client'

import React, { useEffect, useState } from 'react'
import {
  FileText, Download, Upload, FileBadge, Scale, Calendar,
  BookOpen, FileSpreadsheet, FolderOpen, X, AlertCircle,
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
  fileUrl: string
  fileName: string
  fileSizeBytes: number | null
  uploadedByName: string | null
  createdAt: string
}

// ─── apiFetch helper ──────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

const CATEGORIES = [
  { value: 'all',             label: 'All Documents' },
  { value: 'financial',       label: 'Financial' },
  { value: 'legal',           label: 'Legal' },
  { value: 'meeting_minutes', label: 'Meeting Minutes' },
  { value: 'rules',           label: 'Rules & Regulations' },
  { value: 'forms',           label: 'Forms' },
]

const UPLOAD_CATEGORIES = CATEGORIES.filter(c => c.value !== 'all')

const categoryIcon: Record<string, React.ReactNode> = {
  financial:       <FileSpreadsheet className="h-5 w-5" />,
  legal:           <Scale className="h-5 w-5" />,
  meeting_minutes: <Calendar className="h-5 w-5" />,
  rules:           <BookOpen className="h-5 w-5" />,
  forms:           <FileBadge className="h-5 w-5" />,
}

const categoryColor: Record<string, string> = {
  financial:       'bg-green-100 text-green-600',
  legal:           'bg-purple-100 text-purple-600',
  meeting_minutes: 'bg-blue-100 text-blue-600',
  rules:           'bg-amber-100 text-amber-600',
  forms:           'bg-teal-100 text-teal-600',
}

function getCategoryIcon(category: string): React.ReactNode {
  return categoryIcon[category] ?? <FileText className="h-5 w-5" />
}

function getCategoryColor(category: string): string {
  return categoryColor[category] ?? 'bg-gray-100 text-gray-500'
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getCategoryLabel(value: string): string {
  return CATEGORIES.find(c => c.value === value)?.label ?? value
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { role, isLoading: authLoading } = useAuth()

  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('all')

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('financial')
  const [formDescription, setFormDescription] = useState('')
  const [formFile, setFormFile] = useState<File | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const canUpload = role === 'board_admin'

  useEffect(() => {
    if (authLoading) return
    apiFetch<DocumentRecord[]>('/api/documents')
      .then(setDocuments)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load documents'))
      .finally(() => setIsLoading(false))
  }, [authLoading])

  const filteredDocuments = activeCategory === 'all'
    ? documents
    : documents.filter(d => d.category === activeCategory)

  const resetForm = () => {
    setFormTitle('')
    setFormCategory('financial')
    setFormDescription('')
    setFormFile(null)
    setFormError(null)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim() || !formFile) return
    setFormError(null)
    setFormLoading(true)

    try {
      const formData = new FormData()
      formData.append('title', formTitle)
      formData.append('category', formCategory)
      formData.append('description', formDescription)
      formData.append('file', formFile)

      const created = await apiFetch<DocumentRecord>('/api/documents', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type — browser will set multipart boundary automatically
        headers: {},
      })
      setDocuments(prev => [created, ...prev])
      setIsUploadModalOpen(false)
      resetForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload document')
    } finally {
      setFormLoading(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="font-semibold text-red-700">Unable to load documents</p>
        <p className="mt-1 text-sm text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">
            HOA document library · {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        {canUpload && (
          <Button
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => setIsUploadModalOpen(true)}
          >
            Upload Document
          </Button>
        )}
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
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
            {cat.value !== 'all' && (
              <span className={clsx(
                'ml-1.5 text-xs',
                activeCategory === cat.value ? 'text-white/70' : 'text-gray-400',
              )}>
                {documents.filter(d => d.category === cat.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Document grid */}
      {filteredDocuments.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" />}
          title={activeCategory === 'all' ? 'No documents yet' : `No ${getCategoryLabel(activeCategory)} documents`}
          description={
            canUpload
              ? 'Upload your first document to get started.'
              : 'Documents shared by the board will appear here.'
          }
          ctaLabel={canUpload ? 'Upload Document' : undefined}
          onCta={canUpload ? () => setIsUploadModalOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map(doc => (
            <div
              key={doc.id}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Card top */}
              <div className="flex items-start gap-3 p-4">
                <div className={clsx(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                  getCategoryColor(doc.category),
                )}>
                  {getCategoryIcon(doc.category)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2">{doc.title}</h3>
                  <Badge variant="default" className="mt-1">
                    {getCategoryLabel(doc.category)}
                  </Badge>
                </div>
              </div>

              {/* Description */}
              {doc.description && (
                <div className="px-4">
                  <p className="text-sm text-gray-500 line-clamp-2">{doc.description}</p>
                </div>
              )}

              {/* Footer meta */}
              <div className="mt-auto border-t border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 text-xs text-gray-400 space-y-0.5">
                    <p className="truncate">{doc.fileName}</p>
                    <div className="flex items-center gap-2">
                      <span>{formatBytes(doc.fileSizeBytes)}</span>
                      <span>·</span>
                      <span>{format(parseISO(doc.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    {doc.uploadedByName && (
                      <p className="truncate">by {doc.uploadedByName}</p>
                    )}
                  </div>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={doc.fileName}
                    className="ml-3 flex shrink-0 items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-teal-50 hover:text-teal-600"
                    title="Download"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => { setIsUploadModalOpen(false); resetForm() }}
        title="Upload Document"
        size="md"
      >
        <form onSubmit={handleUpload} className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              {formError}
            </div>
          )}

          <Input
            label="Title"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            placeholder="e.g., 2024 Annual Budget"
            required
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Category</label>
            <select
              value={formCategory}
              onChange={e => setFormCategory(e.target.value)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
              required
            >
              {UPLOAD_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="Briefly describe the document..."
              rows={2}
              className="block w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">File</label>
            <div className={clsx(
              'rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
              formFile ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            )}>
              {formFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-teal-500" />
                  <span className="text-sm font-medium text-teal-700">{formFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setFormFile(null)}
                    className="ml-1 text-teal-400 hover:text-teal-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <FolderOpen className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">
                    <label className="cursor-pointer font-medium text-teal-600 hover:underline">
                      Browse files
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                        onChange={e => setFormFile(e.target.files?.[0] ?? null)}
                        required
                      />
                    </label>
                    {' '}or drag and drop
                  </p>
                  <p className="mt-1 text-xs text-gray-400">PDF, Word, Excel, or image files</p>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => { setIsUploadModalOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={formLoading}
              disabled={!formTitle.trim() || !formFile}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              Upload
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
