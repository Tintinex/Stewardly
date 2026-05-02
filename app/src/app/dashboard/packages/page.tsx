'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Package, Plus, CheckCircle, RotateCcw, Trash2, Search, X, Camera, Loader2, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import type { PackageRecord, PackageCarrier, PackageStatus } from '@/types'

// ── Image compression helper ──────────────────────────────────────────────────

function compressImage(file: File): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1400
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX }
          else { width = Math.round(width * MAX / height); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
      }
      img.onerror = reject
      img.src = e.target!.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARRIERS: PackageCarrier[] = ['USPS', 'FedEx', 'UPS', 'Amazon', 'DHL', 'OnTrac', 'Other']

const CARRIER_COLORS: Record<PackageCarrier, string> = {
  USPS:    'bg-blue-100 text-blue-700',
  FedEx:   'bg-purple-100 text-purple-700',
  UPS:     'bg-amber-100 text-amber-800',
  Amazon:  'bg-orange-100 text-orange-700',
  DHL:     'bg-yellow-100 text-yellow-800',
  OnTrac:  'bg-teal-100 text-teal-700',
  Other:   'bg-gray-100 text-gray-600',
}

const STATUS_CONFIG: Record<PackageStatus, { label: string; className: string }> = {
  pending:   { label: 'Waiting',   className: 'bg-amber-100 text-amber-800' },
  picked_up: { label: 'Picked Up', className: 'bg-emerald-100 text-emerald-800' },
  returned:  { label: 'Returned',  className: 'bg-red-100 text-red-700' },
}

// ── Log Package Modal (board only) ────────────────────────────────────────────

interface LogPackageModalProps {
  onClose: () => void
  onSaved: () => void
}

function LogPackageModal({ onClose, onSaved }: LogPackageModalProps) {
  const [units, setUnits]               = useState<Array<{ id: string; unitNumber: string; ownerName: string | null }>>([])
  const [unitSearch, setUnitSearch]     = useState('')
  const [selectedUnit, setSelectedUnit] = useState<{ id: string; unitNumber: string } | null>(null)
  const [showUnitDropdown, setShowUnitDropdown] = useState(false)
  const [carrier, setCarrier]           = useState<PackageCarrier>('Other')
  const [tracking, setTracking]         = useState('')
  const [description, setDescription]  = useState('')
  const [recipient, setRecipient]       = useState('')
  const [notes, setNotes]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // Label scanning state
  const fileInputRef                      = useRef<HTMLInputElement>(null)
  const [scanPreview, setScanPreview]     = useState<string | null>(null)
  const [scanning, setScanning]           = useState(false)
  const [scanSuccess, setScanSuccess]     = useState(false)

  useEffect(() => {
    api.listUnits().then(setUnits).catch(() => {})
  }, [])

  const filteredUnits = units.filter(u =>
    u.unitNumber.toLowerCase().includes(unitSearch.toLowerCase()) ||
    (u.ownerName ?? '').toLowerCase().includes(unitSearch.toLowerCase()),
  )

  // ── Label scan ──────────────────────────────────────────────────────────────

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Show thumbnail immediately
    setScanPreview(URL.createObjectURL(file))
    setScanSuccess(false)
    setScanning(true)
    setError(null)
    try {
      const { base64, mediaType } = await compressImage(file)
      const result = await api.parsePackageLabel(base64, mediaType)
      // Auto-fill whatever was extracted
      if (CARRIERS.includes(result.carrier as PackageCarrier)) {
        setCarrier(result.carrier as PackageCarrier)
      }
      if (result.trackingNumber) setTracking(result.trackingNumber)
      if (result.recipientName)  setRecipient(result.recipientName)
      setScanSuccess(true)
    } catch {
      setError('Could not read the label — please fill in the fields manually.')
    } finally {
      setScanning(false)
      // Reset input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedUnit) { setError('Please select a unit'); return }
    setSaving(true)
    setError(null)
    try {
      await api.createPackage({
        unitId:         selectedUnit.id,
        carrier,
        trackingNumber: tracking.trim() || undefined,
        description:    description.trim() || undefined,
        recipientName:  recipient.trim() || undefined,
        notes:          notes.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log package')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Log New Package</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {/* ── Scan label ── */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScanFile}
            />
            {!scanPreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/50 text-teal-700 text-sm font-medium hover:bg-teal-50 hover:border-teal-400 transition-colors"
              >
                <Camera className="h-4 w-4" />
                Scan Package Label
              </button>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Preview strip */}
                <div className="relative bg-gray-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={scanPreview}
                    alt="Scanned label"
                    className="w-full max-h-36 object-contain"
                  />
                  {scanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-2">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                      <span className="text-white text-xs font-medium">Reading label…</span>
                    </div>
                  )}
                  {scanSuccess && !scanning && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow">
                        <Sparkles className="h-3.5 w-3.5" />
                        Fields auto-filled
                      </div>
                    </div>
                  )}
                </div>
                {/* Rescan button */}
                <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Label scanned · Review fields below</span>
                  <button
                    type="button"
                    onClick={() => { setScanPreview(null); setScanSuccess(false); fileInputRef.current?.click() }}
                    className="text-xs text-teal-600 font-medium hover:text-teal-700 flex items-center gap-1"
                  >
                    <Camera className="h-3 w-3" />
                    Rescan
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Unit picker */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
            {selectedUnit ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-teal-500 bg-teal-50">
                <span className="text-sm font-medium text-teal-800">Unit {selectedUnit.unitNumber}</span>
                <button
                  onClick={() => { setSelectedUnit(null); setUnitSearch('') }}
                  className="ml-auto text-teal-600 hover:text-teal-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by unit number or resident name…"
                  value={unitSearch}
                  onChange={e => { setUnitSearch(e.target.value); setShowUnitDropdown(true) }}
                  onFocus={() => setShowUnitDropdown(true)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {showUnitDropdown && filteredUnits.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                    {filteredUnits.slice(0, 20).map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUnit(u); setShowUnitDropdown(false); setUnitSearch('') }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium">Unit {u.unitNumber}</span>
                        {u.ownerName && <span className="text-gray-400 text-xs">{u.ownerName}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Carrier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
            <div className="grid grid-cols-4 gap-2">
              {CARRIERS.map(c => (
                <button
                  key={c}
                  onClick={() => setCarrier(c)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    carrier === c
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Name</label>
            <input
              type="text"
              placeholder="Name on the package (optional)"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              placeholder="e.g. Large box, Envelope, Fragile…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Tracking number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
            <input
              type="text"
              placeholder="Optional"
              value={tracking}
              onChange={e => setTracking(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              placeholder="Any additional notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 p-6 pt-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || scanning || !selectedUnit}
            className="flex-1 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Logging…' : 'Log Package'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Board View ────────────────────────────────────────────────────────────────

function BoardPackagesView() {
  const [packages, setPackages]         = useState<PackageRecord[]>([])
  const [loading, setLoading]           = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [search, setSearch]             = useState('')
  const [showLogModal, setShowLogModal] = useState(false)
  const [updating, setUpdating]         = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.getPackages({ status: statusFilter || undefined })
      .then(setPackages)
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const markPickedUp = async (pkg: PackageRecord) => {
    setUpdating(pkg.id)
    try {
      await api.updatePackage(pkg.id, { status: 'picked_up' })
      load()
    } finally {
      setUpdating(null)
    }
  }

  const markReturned = async (pkg: PackageRecord) => {
    setUpdating(pkg.id)
    try {
      await api.updatePackage(pkg.id, { status: 'returned' })
      load()
    } finally {
      setUpdating(null)
    }
  }

  const handleDelete = async (pkg: PackageRecord) => {
    if (!confirm(`Delete package record for Unit ${pkg.unitNumber}?`)) return
    await api.deletePackage(pkg.id)
    load()
  }

  const filtered = packages.filter(p => {
    const q = search.toLowerCase()
    return (
      p.unitNumber.toLowerCase().includes(q) ||
      (p.recipientName ?? '').toLowerCase().includes(q) ||
      (p.carrier ?? '').toLowerCase().includes(q) ||
      (p.trackingNumber ?? '').toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q)
    )
  })

  const pendingCount = packages.filter(p => p.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-teal-600" />
            Package Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendingCount} package{pendingCount !== 1 ? 's' : ''} waiting for pickup
          </p>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Log Package
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by unit, name, carrier, tracking…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex gap-2">
          {(['', 'pending', 'picked_up', 'returned'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-teal-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === '' ? 'All' : STATUS_CONFIG[s as PackageStatus]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No packages found</p>
          <p className="text-gray-400 text-sm mt-1">
            {statusFilter === 'pending' ? 'All packages have been picked up!' : 'Try changing the filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Unit</th>
                  <th className="px-4 py-3 text-left">Carrier</th>
                  <th className="px-4 py-3 text-left">Details</th>
                  <th className="px-4 py-3 text-left">Received</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(pkg => {
                  const status = STATUS_CONFIG[pkg.status]
                  const carrierClass = CARRIER_COLORS[pkg.carrier as PackageCarrier] ?? CARRIER_COLORS.Other
                  return (
                    <tr key={pkg.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">Unit {pkg.unitNumber}</div>
                        {pkg.recipientName && (
                          <div className="text-xs text-gray-400 mt-0.5">{pkg.recipientName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${carrierClass}`}>
                          {pkg.carrier}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {pkg.description && (
                          <div className="text-gray-700 truncate">{pkg.description}</div>
                        )}
                        {pkg.trackingNumber && (
                          <div className="text-xs text-gray-400 font-mono truncate">{pkg.trackingNumber}</div>
                        )}
                        {!pkg.description && !pkg.trackingNumber && (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        <div>{format(parseISO(pkg.receivedAt), 'MMM d, yyyy')}</div>
                        <div className="text-gray-400">{format(parseISO(pkg.receivedAt), 'h:mm a')}</div>
                        {pkg.loggedByName && (
                          <div className="text-gray-300 mt-0.5">by {pkg.loggedByName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                        {pkg.pickedUpAt && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {format(parseISO(pkg.pickedUpAt), 'MMM d')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pkg.status === 'pending' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => markPickedUp(pkg)}
                              disabled={updating === pkg.id}
                              title="Mark as picked up"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Picked Up
                            </button>
                            <button
                              onClick={() => markReturned(pkg)}
                              disabled={updating === pkg.id}
                              title="Mark as returned to sender"
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(pkg)}
                              title="Delete record"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {pkg.status !== 'pending' && (
                          <button
                            onClick={() => handleDelete(pkg)}
                            title="Delete record"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showLogModal && (
        <LogPackageModal onClose={() => setShowLogModal(false)} onSaved={load} />
      )}
    </div>
  )
}

// ── Resident View ─────────────────────────────────────────────────────────────

function ResidentPackagesView() {
  const [packages, setPackages] = useState<PackageRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [showAll, setShowAll]   = useState(false)

  useEffect(() => {
    api.getPackages()
      .then(setPackages)
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [])

  const pending   = packages.filter(p => p.status === 'pending')
  const history   = packages.filter(p => p.status !== 'pending')
  const displayed = showAll ? history : history.slice(0, 5)

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading…</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="h-6 w-6 text-teal-600" />
          My Packages
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Packages received at the front desk for your unit
        </p>
      </div>

      {/* Waiting for pickup */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Waiting for Pickup
          {pending.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-bold">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 px-6 py-10 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No packages waiting</p>
            <p className="text-gray-400 text-sm mt-1">You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Recent History
          </h2>
          <div className="space-y-2">
            {displayed.map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg} compact />
            ))}
            {history.length > 5 && (
              <button
                onClick={() => setShowAll(v => !v)}
                className="w-full py-2 text-sm text-teal-600 hover:text-teal-700 font-medium transition-colors"
              >
                {showAll ? 'Show less' : `Show ${history.length - 5} more`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PackageCard({ pkg, compact = false }: { pkg: PackageRecord; compact?: boolean }) {
  const status = STATUS_CONFIG[pkg.status]
  const carrierClass = CARRIER_COLORS[pkg.carrier as PackageCarrier] ?? CARRIER_COLORS.Other

  if (compact) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${carrierClass}`}>
          {pkg.carrier}
        </span>
        <div className="flex-1 min-w-0">
          {pkg.description && <p className="text-sm text-gray-700 truncate">{pkg.description}</p>}
          <p className="text-xs text-gray-400">{format(parseISO(pkg.receivedAt), 'MMM d, yyyy')}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${status.className}`}>
          {status.label}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="bg-amber-50 px-5 py-3 flex items-center justify-between border-b border-amber-100">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">Package Waiting</span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
          {status.label}
        </span>
      </div>
      <div className="px-5 py-4 space-y-2">
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${carrierClass}`}>
            {pkg.carrier}
          </span>
          {pkg.recipientName && (
            <span className="text-sm text-gray-700">For: <strong>{pkg.recipientName}</strong></span>
          )}
        </div>
        {pkg.description && (
          <p className="text-sm text-gray-600">{pkg.description}</p>
        )}
        {pkg.trackingNumber && (
          <p className="text-xs font-mono text-gray-400">{pkg.trackingNumber}</p>
        )}
        {pkg.notes && (
          <p className="text-xs text-gray-500 italic">{pkg.notes}</p>
        )}
        <div className="flex items-center gap-2 pt-1 text-xs text-gray-400">
          <span>Received {format(parseISO(pkg.receivedAt), 'EEEE, MMMM d')} at {format(parseISO(pkg.receivedAt), 'h:mm a')}</span>
          {pkg.loggedByName && <span>· Logged by {pkg.loggedByName}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const { user } = useAuth()
  const isBoard = user?.role === 'board_admin' || user?.role === 'board_member'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {isBoard ? <BoardPackagesView /> : <ResidentPackagesView />}
    </div>
  )
}
