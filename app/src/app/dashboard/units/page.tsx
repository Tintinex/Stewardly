'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Plus, Upload, Search, Edit2, Trash2, X,
  ChevronUp, ChevronDown, AlertCircle, CheckCircle2,
  Download, Info,
} from 'lucide-react'
import { getCurrentUser, listUnits, createUnit, updateUnit, deleteUnit, importUnits } from '@/lib/api'
import type { AuthUser, UnitWithOwner } from '@/types'

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

  // Action state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 justify-end">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Units', value: units.length },
              { label: 'Occupied', value: units.filter(u => u.ownerId).length },
              { label: 'Unoccupied', value: units.filter(u => !u.ownerId).length },
              {
                label: 'Avg Sq Ft',
                value: (() => {
                  const withSqft = units.filter(u => u.sqft != null)
                  if (!withSqft.length) return '—'
                  return Math.round(withSqft.reduce((s, u) => s + (u.sqft ?? 0), 0) / withSqft.length).toLocaleString()
                })(),
              },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{stat.value}</p>
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
    </div>
  )
}
