'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Plus, Upload, Search, Edit2, Trash2, X,
  ChevronUp, ChevronDown, AlertCircle, CheckCircle2,
  Download, Info, UserPlus, UserMinus, Scan, FileText,
  Loader2, RefreshCw, Check, TrendingUp, ExternalLink,
} from 'lucide-react'
import {
  getCurrentUser, listUnits, createUnit, updateUnit, deleteUnit, importUnits,
  getMembers, assignUnit, listDocumentsForScan, scanDocumentForUnits, importUnits as importUnitsApi,
  refreshUnitEstimate,
} from '@/lib/api'
import type { AuthUser, UnitWithOwner, Member } from '@/types'
import type { DocSummary, ExtractedUnitRow } from '@/lib/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, suffix = ''): string {
  if (n == null) return '—'
  return `${n.toLocaleString()}${suffix}`
}

function ownershipColor(total: number): string {
  if (total === 0) return 'text-gray-400'
  if (total < 99) return 'text-yellow-600'
  if (total <= 101) return 'text-green-600'
  return 'text-red-600'
}

// ─── CSV template ─────────────────────────────────────────────────────────────

const CSV_TEMPLATE = `unitNumber,address,sqft,bedrooms,bathrooms,ownershipPercent
101,123 Main St Unit 101,850,2,1,5
102,123 Main St Unit 102,900,2,1,5
103,123 Main St Unit 103,1100,3,2,6.5`

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'units-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Unit Form ────────────────────────────────────────────────────────────────

interface UnitFormData {
  unitNumber: string
  address: string
  sqft: string
  bedrooms: string
  bathrooms: string
  ownershipPercent: string
}

const EMPTY_FORM: UnitFormData = {
  unitNumber: '', address: '', sqft: '', bedrooms: '', bathrooms: '', ownershipPercent: '',
}

function unitToForm(u: UnitWithOwner): UnitFormData {
  return {
    unitNumber: u.unitNumber,
    address: u.address,
    sqft: u.sqft != null ? String(u.sqft) : '',
    bedrooms: u.bedrooms != null ? String(u.bedrooms) : '',
    bathrooms: u.bathrooms != null ? String(u.bathrooms) : '',
    ownershipPercent: u.ownershipPercent != null ? String(u.ownershipPercent) : '',
  }
}

function formToPayload(f: UnitFormData) {
  return {
    unitNumber: f.unitNumber.trim(),
    address: f.address.trim() || undefined,
    sqft: f.sqft ? parseInt(f.sqft) : null,
    bedrooms: f.bedrooms ? parseInt(f.bedrooms) : null,
    bathrooms: f.bathrooms ? parseFloat(f.bathrooms) : null,
    ownershipPercent: f.ownershipPercent ? parseFloat(f.ownershipPercent) : null,
  }
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

interface UnitModalProps {
  unit: UnitWithOwner | null   // null = create mode
  onSave: (form: UnitFormData) => Promise<void>
  onClose: () => void
  loading: boolean
  error: string | null
}

function UnitModal({ unit, onSave, onClose, loading, error }: UnitModalProps) {
  const [form, setForm] = useState<UnitFormData>(unit ? unitToForm(unit) : EMPTY_FORM)
  const isEdit = !!unit

  const set = (k: keyof UnitFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? `Edit Unit ${unit.unitNumber}` : 'Add Unit'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.unitNumber}
                onChange={set('unitNumber')}
                placeholder="101"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ownership %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={form.ownershipPercent}
                onChange={set('ownershipPercent')}
                placeholder="5.000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={set('address')}
              placeholder="123 Main St Unit 101"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sq Ft</label>
              <input
                type="number"
                min="0"
                value={form.sqft}
                onChange={set('sqft')}
                placeholder="850"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beds</label>
              <input
                type="number"
                min="0"
                value={form.bedrooms}
                onChange={set('bedrooms')}
                placeholder="2"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Baths</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.bathrooms}
                onChange={set('bathrooms')}
                placeholder="1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={loading || !form.unitNumber.trim()}
            className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
          >
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Unit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({
  unit,
  onConfirm,
  onClose,
  loading,
}: {
  unit: UnitWithOwner
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Unit {unit.unitNumber}?</h3>
          <p className="text-sm text-gray-600">
            This will permanently remove the unit and unlink any residents assigned to it. Assessments
            for this unit will remain in the system.
          </p>
          {unit.ownerName && (
            <div className="mt-3 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {unit.ownerName} is currently assigned to this unit and will be unlinked.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} disabled={loading} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete Unit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({
  onImport,
  onClose,
  loading,
  result,
  error,
}: {
  onImport: (csv: string) => void
  onClose: () => void
  loading: boolean
  result: { created: number; skipped: number } | null
  error: string | null
}) {
  const [csvText, setCsvText] = useState('')

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvText((ev.target?.result as string) ?? '')
    reader.readAsText(file)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Import Units from CSV</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Info size={16} />
              Download the CSV template to see the required format.
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              <Download size={14} />
              Template
            </button>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-teal/90"
            />
          </div>

          {/* Or paste */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Or paste CSV content</label>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={6}
              placeholder="unitNumber,address,sqft,bedrooms,bathrooms,ownershipPercent&#10;101,123 Main St Unit 101,850,2,1,5"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal resize-none"
            />
          </div>

          {/* Accepted columns note */}
          <div className="text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-600">Accepted column names:</p>
            <p>
              <code className="bg-gray-100 rounded px-1">unitNumber</code> (required),{' '}
              <code className="bg-gray-100 rounded px-1">address</code>,{' '}
              <code className="bg-gray-100 rounded px-1">sqft</code>,{' '}
              <code className="bg-gray-100 rounded px-1">bedrooms</code>,{' '}
              <code className="bg-gray-100 rounded px-1">bathrooms</code>,{' '}
              <code className="bg-gray-100 rounded px-1">ownershipPercent</code>
            </p>
            <p>Existing unit numbers will be updated (upsert).</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 size={16} className="shrink-0" />
              Import complete: <strong>{result.created}</strong> units created/updated,{' '}
              <strong>{result.skipped}</strong> skipped.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} disabled={loading} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={() => onImport(csvText)}
              disabled={loading || !csvText.trim()}
              className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
            >
              {loading ? 'Importing…' : 'Import Units'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Assign Resident Modal ────────────────────────────────────────────────────

function AssignResidentModal({
  unit,
  members,
  onAssign,
  onUnassign,
  onClose,
  loading,
  error,
}: {
  unit: UnitWithOwner
  members: Member[]
  onAssign: (memberId: string) => Promise<void>
  onUnassign: () => Promise<void>
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(unit.ownerId ?? null)

  const filtered = members.filter(m =>
    m.status === 'active' &&
    (`${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
     m.email.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Assign Resident</h3>
            <p className="text-sm text-gray-500 mt-0.5">Unit {unit.unitNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Current occupant */}
          {unit.ownerId && (
            <div className="flex items-center justify-between rounded-lg bg-teal/5 border border-teal/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{unit.ownerName}</p>
                <p className="text-xs text-gray-500">{unit.ownerEmail} · currently assigned</p>
              </div>
              <button
                onClick={onUnassign}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
              >
                <UserMinus size={14} />
                Unassign
              </button>
            </div>
          )}

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search active members…"
              className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No active members found.</p>
            ) : filtered.map(m => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${selected === m.id ? 'bg-teal/5' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.firstName} {m.lastName}</p>
                  <p className="text-xs text-gray-500 truncate">{m.email}
                    {m.unitNumber && <span className="ml-2 text-amber-600">· Unit {m.unitNumber}</span>}
                  </p>
                </div>
                {selected === m.id && <Check size={16} className="shrink-0 text-teal" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} disabled={loading} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => selected && onAssign(selected)}
            disabled={loading || !selected || selected === unit.ownerId}
            className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
          >
            {loading ? 'Assigning…' : 'Assign Resident'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Scan Document Modal ──────────────────────────────────────────────────────

function ScanDocumentModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (units: ExtractedUnitRow[]) => Promise<void>
}) {
  const [docs, setDocs] = useState<DocSummary[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<DocSummary | null>(null)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scanResult, setScanResult] = useState<{ documentTitle: string; units: ExtractedUnitRow[] } | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [docSearch, setDocSearch] = useState('')

  useEffect(() => {
    listDocumentsForScan()
      .then(d => setDocs(d))
      .catch(e => setError(e.message))
      .finally(() => setDocsLoading(false))
  }, [])

  const handleScan = async () => {
    if (!selectedDoc) return
    setScanning(true)
    setError(null)
    setScanResult(null)
    setSelected(new Set())
    try {
      const result = await scanDocumentForUnits(selectedDoc.id)
      setScanResult(result)
      setSelected(new Set(result.units.map((_, i) => i)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const handleImport = async () => {
    if (!scanResult) return
    const toImport = scanResult.units.filter((_, i) => selected.has(i))
    if (toImport.length === 0) return
    setImporting(true)
    try {
      await onImport(toImport)
    } finally {
      setImporting(false)
    }
  }

  const toggleRow = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const filteredDocs = docs.filter(d =>
    d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
    d.fileName.toLowerCase().includes(docSearch.toLowerCase()),
  )

  const CATEGORY_LABEL: Record<string, string> = {
    bylaws: 'Bylaws', rules: 'Rules', contracts: 'Contracts',
    notices: 'Notices', financial: 'Financial', other: 'Other',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Scan size={18} className="text-teal" />
              Scan Document for Units
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Use AI to extract unit and resident data from an uploaded document.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />{error}
            </div>
          )}

          {/* Step 1: Pick document */}
          {!scanResult && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700">1. Choose a document to scan</p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  placeholder="Search documents…"
                  className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
              </div>

              {docsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 size={20} className="animate-spin mr-2" /> Loading documents…
                </div>
              ) : filteredDocs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No documents found. Upload documents first.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {filteredDocs.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${selectedDoc?.id === doc.id ? 'bg-teal/5 border-l-2 border-teal' : ''}`}
                    >
                      <FileText size={16} className={doc.hasText ? 'text-teal' : 'text-gray-300'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                        <p className="text-xs text-gray-500 truncate">{doc.fileName} · {CATEGORY_LABEL[doc.category] ?? doc.category}</p>
                      </div>
                      {!doc.hasText && (
                        <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">No text</span>
                      )}
                      {selectedDoc?.id === doc.id && <Check size={16} className="shrink-0 text-teal" />}
                    </button>
                  ))}
                </div>
              )}

              {selectedDoc && !selectedDoc.hasText && (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
                  <AlertCircle size={16} className="shrink-0" />
                  This document has no extracted text. Only PDFs and plain-text files can be scanned.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Scan results */}
          {scanResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  2. Review extracted data
                  <span className="ml-2 text-gray-400 font-normal">from "{scanResult.documentTitle}"</span>
                </p>
                <button
                  onClick={() => { setScanResult(null); setSelectedDoc(null) }}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Scan another
                </button>
              </div>

              {scanResult.units.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Scan size={32} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">No unit data found in this document.</p>
                  <p className="text-xs mt-1">Try a document like a resident roster, unit list, or ownership schedule.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{selected.size} of {scanResult.units.length} rows selected</span>
                    <button
                      onClick={() => setSelected(
                        selected.size === scanResult.units.length
                          ? new Set()
                          : new Set(scanResult.units.map((_, i) => i)),
                      )}
                      className="text-teal hover:underline"
                    >
                      {selected.size === scanResult.units.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left w-8"></th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Resident</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Email</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {scanResult.units.map((u, i) => (
                          <tr
                            key={i}
                            onClick={() => toggleRow(i)}
                            className={`cursor-pointer hover:bg-gray-50 ${selected.has(i) ? 'bg-teal/5' : ''}`}
                          >
                            <td className="px-3 py-2">
                              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${selected.has(i) ? 'bg-teal border-teal' : 'border-gray-300'}`}>
                                {selected.has(i) && <Check size={10} className="text-white" />}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-semibold text-gray-800">{u.unitNumber}</td>
                            <td className="px-3 py-2 text-gray-700">{u.ownerName ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{u.ownerEmail ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-400">
                              {[u.sqft && `${u.sqft} ft²`, u.bedrooms && `${u.bedrooms}bd`, u.bathrooms && `${u.bathrooms}ba`, u.ownershipPercent && `${u.ownershipPercent}%`].filter(Boolean).join(' · ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400">
                    Units will be created or updated (upsert). Existing units with the same number will have their details overwritten.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl shrink-0">
          <button onClick={onClose} disabled={scanning || importing} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
            Cancel
          </button>
          {!scanResult ? (
            <button
              onClick={handleScan}
              disabled={!selectedDoc || !selectedDoc.hasText || scanning}
              className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50 flex items-center gap-2"
            >
              {scanning ? <><Loader2 size={14} className="animate-spin" /> Scanning…</> : <><Scan size={14} /> Scan Document</>}
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0 || !scanResult.units.length}
              className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50 flex items-center gap-2"
            >
              {importing
                ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                : <><CheckCircle2 size={14} /> Import {selected.size} Unit{selected.size !== 1 ? 's' : ''}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortKey = 'unitNumber' | 'address' | 'sqft' | 'ownershipPercent' | 'ownerName'
type SortDir = 'asc' | 'desc'

function sortUnits(units: UnitWithOwner[], key: SortKey, dir: SortDir): UnitWithOwner[] {
  return [...units].sort((a, b) => {
    const av = a[key] ?? ''
    const bv = b[key] ?? ''
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), undefined, { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UnitsPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [units, setUnits] = useState<UnitWithOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('unitNumber')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Modals
  const [addModal, setAddModal] = useState(false)
  const [editUnit, setEditUnit] = useState<UnitWithOwner | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UnitWithOwner | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<UnitWithOwner | null>(null)
  const [scanOpen, setScanOpen] = useState(false)

  // Members (for assign modal)
  const [members, setMembers] = useState<Member[]>([])

  // Action state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Estimate state
  const [estimating, setEstimating] = useState<string | null>(null)   // unitId being refreshed
  const [estimatingAll, setEstimatingAll] = useState(false)
  const [estimateNote, setEstimateNote] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await listUnits()
      setUnits(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load units')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getCurrentUser()
      .then(u => {
        if (u.role !== 'board_admin' && u.role !== 'board_member') {
          router.replace('/dashboard')
          return
        }
        setUser(u)
        load()
      })
      .catch(() => router.replace('/auth/signin'))
  }, [router, load])

  // ── Sort toggle ────────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp size={14} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="text-teal" />
      : <ChevronDown size={14} className="text-teal" />
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const filtered = units.filter(u =>
    u.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
    u.address?.toLowerCase().includes(search.toLowerCase()) ||
    u.ownerName?.toLowerCase().includes(search.toLowerCase()),
  )

  const sorted = sortUnits(filtered, sortKey, sortDir)

  const totalPercent = units.reduce((s, u) => s + (u.ownershipPercent ?? 0), 0)
  const hasPercents = units.some(u => u.ownershipPercent != null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (form: UnitFormData) => {
    setSaving(true)
    setSaveError(null)
    try {
      const payload = formToPayload(form)
      if (!payload.unitNumber) { setSaveError('Unit number is required'); return }
      const newUnit = await createUnit(payload)
      setUnits(prev => [...prev, newUnit].sort((a, b) =>
        a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
      ))
      setAddModal(false)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to create unit')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (form: UnitFormData) => {
    if (!editUnit) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload = formToPayload(form)
      const updated = await updateUnit(editUnit.id, payload)
      setUnits(prev => prev.map(u => u.id === updated.id ? updated : u))
      setEditUnit(null)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to update unit')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await deleteUnit(deleteTarget.id)
      setUnits(prev => prev.filter(u => u.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete unit')
    } finally {
      setSaving(false)
    }
  }

  const handleImport = async (csv: string) => {
    setSaving(true)
    setImportError(null)
    setImportResult(null)
    try {
      const result = await importUnits({ csv })
      setImportResult(result)
      await load() // Reload full list
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setSaving(false)
    }
  }

  const openAssign = async (unit: UnitWithOwner) => {
    setAssignError(null)
    if (members.length === 0) {
      try {
        const m = await getMembers()
        setMembers(m)
      } catch {
        // Proceed with empty list, user sees "No active members"
      }
    }
    setAssignTarget(unit)
  }

  const handleAssign = async (memberId: string) => {
    if (!assignTarget) return
    setSaving(true)
    setAssignError(null)
    try {
      await assignUnit(memberId, assignTarget.id)
      await load()
      setAssignTarget(null)
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : 'Failed to assign resident')
    } finally {
      setSaving(false)
    }
  }

  const handleUnassign = async () => {
    if (!assignTarget) return
    setSaving(true)
    setAssignError(null)
    try {
      await assignUnit(assignTarget.ownerId!, null)
      await load()
      setAssignTarget(null)
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : 'Failed to unassign resident')
    } finally {
      setSaving(false)
    }
  }

  const handleScanImport = async (rows: ExtractedUnitRow[]) => {
    const result = await importUnitsApi({ units: rows.map(r => ({ ...r, unitNumber: r.unitNumber })) })
    await load()
    setScanOpen(false)
    alert(`Imported ${result.created} units (${result.skipped} skipped).`)
  }

  const handleRefreshEstimate = async (unit: UnitWithOwner) => {
    if (!unit.address) {
      setEstimateNote(`Unit ${unit.unitNumber} has no address — add one first.`)
      return
    }
    setEstimating(unit.id)
    setEstimateNote(null)
    try {
      const result = await refreshUnitEstimate(unit.id)
      if (result.notConfigured) {
        setEstimateNote('Rentcast API key not configured. Sign up free at rentcast.io to fetch estimated sale prices (not rent — this uses the property value AVM).')
      } else if (result.notFound) {
        setEstimateNote(`No estimate found for Unit ${unit.unitNumber}. The address may not be in Rentcast's database.`)
      } else if (result.zestimate) {
        setUnits(prev => prev.map(u => u.id === unit.id ? {
          ...u,
          zestimate:     result.zestimate ?? null,
          zestimateLow:  result.zestimateLow ?? null,
          zestimateHigh: result.zestimateHigh ?? null,
          zestimateAt:   result.zestimateAt ?? null,
        } : u))
      }
    } catch {
      setEstimateNote(`Failed to refresh estimate for Unit ${unit.unitNumber}.`)
    } finally {
      setEstimating(null)
    }
  }

  const handleRefreshAllEstimates = async () => {
    const withAddress = sorted.filter(u => u.address)
    if (!withAddress.length) { setEstimateNote('No units have addresses set.'); return }
    setEstimatingAll(true)
    setEstimateNote(null)
    let refreshed = 0
    for (const unit of withAddress) {
      try {
        const result = await refreshUnitEstimate(unit.id)
        if (result.notConfigured) {
          setEstimateNote('Rentcast API key not configured. Sign up free at rentcast.io to fetch estimated sale prices.')
          break
        }
        if (result.zestimate) {
          setUnits(prev => prev.map(u => u.id === unit.id ? {
            ...u,
            zestimate:     result.zestimate ?? null,
            zestimateLow:  result.zestimateLow ?? null,
            zestimateHigh: result.zestimateHigh ?? null,
            zestimateAt:   result.zestimateAt ?? null,
          } : u))
          refreshed++
        }
      } catch { /* skip failed units */ }
    }
    setEstimatingAll(false)
    if (refreshed > 0) setEstimateNote(`Refreshed estimates for ${refreshed} unit${refreshed !== 1 ? 's' : ''}.`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!user) return null

  const isAdmin = user.role === 'board_admin'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 size={22} className="text-teal" />
              Units
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {units.length} unit{units.length !== 1 ? 's' : ''} in your community
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefreshAllEstimates}
              disabled={estimatingAll || loading}
              className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              title="Fetch estimated market values for all units from Rentcast"
            >
              {estimatingAll
                ? <Loader2 size={16} className="animate-spin" />
                : <TrendingUp size={16} />}
              Refresh Estimates
            </button>
            <button
              onClick={() => setScanOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Scan size={16} />
              Scan Document
            </button>
            <button
              onClick={() => { setImportResult(null); setImportError(null); setImportOpen(true) }}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Upload size={16} />
              Import CSV
            </button>
            <button
              onClick={() => { setSaveError(null); setAddModal(true) }}
              className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90"
            >
              <Plus size={16} />
              Add Unit
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
        {/* Ownership total banner */}
        {hasPercents && (
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
            Math.abs(totalPercent - 100) < 0.01
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}>
            {Math.abs(totalPercent - 100) < 0.01
              ? <CheckCircle2 size={16} className="shrink-0 text-green-600" />
              : <AlertCircle size={16} className="shrink-0 text-yellow-600" />}
            <span>
              Total ownership: <strong>{totalPercent.toFixed(3)}%</strong>
              {Math.abs(totalPercent - 100) >= 0.01 && ' — should sum to 100% for percentage-based assessments.'}
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {estimateNote && (
          <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            <div className="flex items-center gap-2">
              <Info size={16} className="shrink-0" />
              {estimateNote}
            </div>
            <button onClick={() => setEstimateNote(null)} className="text-blue-400 hover:text-blue-600 ml-3">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by unit number, address, or owner…"
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading units…</div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">
                {search ? 'No units match your search.' : 'No units yet.'}
              </p>
              {!search && (
                <p className="text-xs text-gray-400 mt-1">
                  Add units manually or import a CSV file to get started.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    {([
                      ['unitNumber', 'Unit'],
                      ['address',    'Address'],
                      ['sqft',       'Sq Ft'],
                      ['ownershipPercent', 'Ownership %'],
                      ['ownerName',  'Resident'],
                    ] as [SortKey, string][]).map(([k, label]) => (
                      <th
                        key={k}
                        onClick={() => toggleSort(k)}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          <SortIcon k={k} />
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Beds / Baths
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <span
                        className="flex items-center gap-1 cursor-help"
                        title="Estimated market sale price from Rentcast AVM — not a rental estimate"
                      >
                        <TrendingUp size={13} className="text-emerald-500" />
                        Est. Sale Price
                      </span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map(unit => (
                    <tr key={unit.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {unit.unitNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                        {unit.address || <span className="text-gray-300 italic">No address</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmt(unit.sqft, ' ft²')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {unit.ownershipPercent != null ? (
                          <span className="font-mono text-gray-700">
                            {unit.ownershipPercent.toFixed(3)}%
                          </span>
                        ) : (
                          <span className="text-gray-300 italic text-xs">not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {unit.ownerName ? (
                          <div>
                            <p className="font-medium text-gray-800 text-xs">{unit.ownerName}</p>
                            <p className="text-gray-400 text-xs">{unit.ownerEmail}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Unoccupied</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {unit.bedrooms != null || unit.bathrooms != null
                          ? `${unit.bedrooms ?? '?'} bd / ${unit.bathrooms ?? '?'} ba`
                          : <span className="text-gray-300 italic text-xs">—</span>}
                      </td>

                      {/* Estimated sale price */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {unit.zestimate ? (
                          <div>
                            <p className="font-semibold text-emerald-700 text-sm">
                              ${unit.zestimate.toLocaleString()}
                            </p>
                            {unit.zestimateLow && unit.zestimateHigh && unit.zestimateLow !== unit.zestimate && (
                              <p className="text-[10px] text-gray-400">
                                ${Math.round(unit.zestimateLow / 1000)}k – ${Math.round(unit.zestimateHigh / 1000)}k
                              </p>
                            )}
                            {unit.zestimateAt && (
                              <p
                                className="text-[10px] text-gray-300"
                                title={`Sale price estimate · ${unit.zestimateAt}`}
                              >
                                Sale est. · {new Date(unit.zestimateAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRefreshEstimate(unit)}
                            disabled={estimating === unit.id}
                            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                          >
                            {estimating === unit.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <TrendingUp size={12} />}
                            Get sale price
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 justify-end">
                          {/* Refresh estimate / Zillow link */}
                          {unit.zestimate && (
                            <button
                              onClick={() => handleRefreshEstimate(unit)}
                              disabled={estimating === unit.id}
                              title="Refresh estimate"
                              className="rounded p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors disabled:opacity-50"
                            >
                              {estimating === unit.id
                                ? <Loader2 size={15} className="animate-spin" />
                                : <RefreshCw size={15} />}
                            </button>
                          )}
                          {unit.address && (
                            <a
                              href={`https://www.zillow.com/homes/${encodeURIComponent(unit.address)}_rb/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View on Zillow"
                              className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <button
                            onClick={() => openAssign(unit)}
                            className="rounded p-1.5 text-gray-400 hover:bg-teal/10 hover:text-teal transition-colors"
                            title={unit.ownerId ? 'Change or unassign resident' : 'Assign resident'}
                          >
                            {unit.ownerId ? <UserMinus size={15} /> : <UserPlus size={15} />}
                          </button>
                          <button
                            onClick={() => { setSaveError(null); setEditUnit(unit) }}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-teal transition-colors"
                            title="Edit unit"
                          >
                            <Edit2 size={15} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteTarget(unit)}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete unit"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats row */}
        {units.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: 'Total Units', value: String(units.length), accent: false },
              { label: 'Occupied', value: String(units.filter(u => u.ownerId).length), accent: false },
              { label: 'Unoccupied', value: String(units.filter(u => !u.ownerId).length), accent: false },
              {
                label: 'Avg Sq Ft',
                value: (() => {
                  const withSqft = units.filter(u => u.sqft != null)
                  if (!withSqft.length) return '—'
                  return Math.round(withSqft.reduce((s, u) => s + (u.sqft ?? 0), 0) / withSqft.length).toLocaleString()
                })(),
                accent: false,
              },
              {
                label: 'Est. Portfolio Value',
                value: (() => {
                  const withEst = units.filter(u => u.zestimate != null)
                  if (!withEst.length) return '—'
                  const total = withEst.reduce((s, u) => s + (u.zestimate ?? 0), 0)
                  return total >= 1_000_000
                    ? `$${(total / 1_000_000).toFixed(2)}M`
                    : `$${Math.round(total).toLocaleString()}`
                })(),
                accent: true,
              },
            ].map(stat => (
              <div key={stat.label} className={`rounded-xl border px-4 py-3 ${stat.accent ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs font-medium ${stat.accent ? 'text-emerald-600' : 'text-gray-500'}`}>{stat.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${stat.accent ? 'text-emerald-700' : 'text-gray-900'}`}>{stat.value}</p>
                {stat.accent && units.filter(u => u.zestimate).length > 0 && (
                  <p className="text-[10px] text-emerald-500 mt-0.5">
                    {units.filter(u => u.zestimate).length} of {units.length} units · Sale price AVM
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {addModal && (
        <UnitModal
          unit={null}
          onSave={handleCreate}
          onClose={() => setAddModal(false)}
          loading={saving}
          error={saveError}
        />
      )}
      {editUnit && (
        <UnitModal
          unit={editUnit}
          onSave={handleUpdate}
          onClose={() => setEditUnit(null)}
          loading={saving}
          error={saveError}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          unit={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={saving}
        />
      )}
      {importOpen && (
        <ImportModal
          onImport={handleImport}
          onClose={() => { setImportOpen(false); setImportResult(null); setImportError(null) }}
          loading={saving}
          result={importResult}
          error={importError}
        />
      )}
      {assignTarget && (
        <AssignResidentModal
          unit={assignTarget}
          members={members}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onClose={() => { setAssignTarget(null); setAssignError(null) }}
          loading={saving}
          error={assignError}
        />
      )}
      {scanOpen && (
        <ScanDocumentModal
          onClose={() => setScanOpen(false)}
          onImport={handleScanImport}
        />
      )}
    </div>
  )
}
