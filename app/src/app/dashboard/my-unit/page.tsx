'use client'

import React, { useEffect, useState } from 'react'
import {
  Home, Wrench, DollarSign, BedDouble, Bath, Maximize2,
  Plus, CheckCircle, Clock, AlertCircle, X, ChevronDown,
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

interface UnitDetail {
  unitNumber: string
  address: string
  sqft: number | null
  bedrooms: number | null
  bathrooms: number | null
}

interface Assessment {
  id: string
  amount: number
  dueDate: string
  paidDate: string | null
  status: 'pending' | 'paid' | 'overdue'
  description?: string
}

interface MaintenanceRequest {
  id: string
  title: string
  category: string
  priority: string
  status: string
  description?: string
  createdAt: string
}

interface MyUnitData {
  unit: UnitDetail | null
  assessments: Assessment[]
  ownerName: string
  hoaName: string
}

// ─── apiFetch helper ──────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const assessmentStatusConfig: Record<Assessment['status'], { label: string; variant: 'success' | 'warning' | 'danger'; icon: React.ReactNode }> = {
  paid:    { label: 'Paid',    variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  pending: { label: 'Pending', variant: 'warning',  icon: <Clock className="h-3 w-3" /> },
  overdue: { label: 'Overdue', variant: 'danger',   icon: <AlertCircle className="h-3 w-3" /> },
}

const maintenanceStatusConfig: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'default' }> = {
  open:        { label: 'Open',        variant: 'info' },
  in_progress: { label: 'In Progress', variant: 'warning' },
  resolved:    { label: 'Resolved',    variant: 'success' },
  closed:      { label: 'Closed',      variant: 'default' },
}

const MAINTENANCE_CATEGORIES = [
  { value: 'plumbing',     label: 'Plumbing' },
  { value: 'electrical',   label: 'Electrical' },
  { value: 'hvac',         label: 'HVAC' },
  { value: 'structural',   label: 'Structural' },
  { value: 'landscaping',  label: 'Landscaping' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'common_area',  label: 'Common Area' },
  { value: 'other',        label: 'Other' },
]

const MAINTENANCE_PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyUnitPage() {
  const { isLoading: authLoading } = useAuth()

  const [unitData, setUnitData] = useState<MyUnitData | null>(null)
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('plumbing')
  const [formDescription, setFormDescription] = useState('')
  const [formPriority, setFormPriority] = useState('normal')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Expanded assessment row
  const [expandedAssessment, setExpandedAssessment] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return

    const loadData = async () => {
      try {
        const [unit, reqs] = await Promise.all([
          apiFetch<MyUnitData>('/api/my-unit'),
          apiFetch<MaintenanceRequest[]>('/api/maintenance-requests'),
        ])
        setUnitData(unit)
        setRequests(reqs)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load unit data')
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [authLoading])

  const resetForm = () => {
    setFormTitle('')
    setFormCategory('plumbing')
    setFormDescription('')
    setFormPriority('normal')
    setFormError(null)
  }

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      const created = await apiFetch<MaintenanceRequest>('/api/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle,
          category: formCategory,
          description: formDescription,
          priority: formPriority,
        }),
      })
      setRequests(prev => [created, ...prev])
      setIsModalOpen(false)
      resetForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit request')
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
        <p className="font-semibold text-red-700">Unable to load unit data</p>
        <p className="mt-1 text-sm text-red-500">{error}</p>
      </div>
    )
  }

  const unit = unitData?.unit ?? null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Unit</h1>
        <p className="text-sm text-gray-500">
          {unitData?.hoaName ?? 'Your community'} · {unitData?.ownerName ?? ''}
        </p>
      </div>

      {/* Unit info card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start gap-5 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-navy">
            <Home className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                Unit {unit?.unitNumber ?? '—'}
              </h2>
              <Badge variant="info">Homeowner</Badge>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">{unit?.address ?? '—'}</p>

            {/* Stats row */}
            <div className="mt-4 flex flex-wrap gap-5">
              {unit?.sqft != null && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                    <Maximize2 className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{unit.sqft.toLocaleString()} sqft</p>
                    <p className="text-xs text-gray-400">Square Feet</p>
                  </div>
                </div>
              )}
              {unit?.bedrooms != null && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                    <BedDouble className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{unit.bedrooms}</p>
                    <p className="text-xs text-gray-400">Bedrooms</p>
                  </div>
                </div>
              )}
              {unit?.bathrooms != null && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                    <Bath className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{unit.bathrooms}</p>
                    <p className="text-xs text-gray-400">Bathrooms</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dues / Assessments */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-teal" />
            Dues &amp; Assessments
          </h2>
        </div>

        {!unitData || unitData.assessments.length === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-8 w-8" />}
            title="No assessments found"
            description="Your dues and assessment history will appear here."
          />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="w-8 px-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {unitData.assessments.map(assessment => {
                  const statusCfg = assessmentStatusConfig[assessment.status]
                  const isExpanded = expandedAssessment === assessment.id
                  return (
                    <React.Fragment key={assessment.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setExpandedAssessment(isExpanded ? null : assessment.id)}
                      >
                        <td className="px-5 py-3.5 font-medium text-gray-900">
                          {assessment.description ?? 'Monthly HOA Dues'}
                        </td>
                        <td className="px-5 py-3.5 text-gray-700 font-medium tabular-nums">
                          ${assessment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500">
                          {format(parseISO(assessment.dueDate), 'MMM d, yyyy')}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={statusCfg.variant} className="flex w-fit items-center gap-1">
                            {statusCfg.icon}
                            {statusCfg.label}
                          </Badge>
                        </td>
                        <td className="px-2">
                          <ChevronDown className={clsx(
                            'h-4 w-4 text-gray-400 transition-transform',
                            isExpanded && 'rotate-180',
                          )} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={5} className="px-5 py-3">
                            <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                              {assessment.paidDate && (
                                <div>
                                  <span className="font-medium text-gray-700">Paid On: </span>
                                  {format(parseISO(assessment.paidDate), 'MMM d, yyyy')}
                                </div>
                              )}
                              {assessment.status === 'overdue' && (
                                <div className="flex items-center gap-1.5 text-red-600">
                                  <AlertCircle className="h-4 w-4" />
                                  <span>This assessment is past due. Please contact the HOA office.</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Maintenance Requests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-teal" />
            Maintenance Requests
          </h2>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setIsModalOpen(true)}
          >
            Submit Request
          </Button>
        </div>

        {requests.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-8 w-8" />}
            title="No maintenance requests"
            description="Submit a request for any repairs or issues in your unit or common areas."
            ctaLabel="Submit Request"
            onCta={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const statusCfg = maintenanceStatusConfig[req.status] ?? { label: req.status, variant: 'default' as const }
              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{req.title}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                          <Badge variant={req.priority === 'urgent' ? 'danger' : req.priority === 'normal' ? 'info' : 'default'}>
                            {req.priority.charAt(0).toUpperCase() + req.priority.slice(1)}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        <span className="capitalize">{req.category.replace(/_/g, ' ')}</span>
                        <span>·</span>
                        <span>{format(parseISO(req.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                      {req.description && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{req.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Submit Maintenance Request Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title="Submit Maintenance Request"
        size="lg"
      >
        <form onSubmit={handleSubmitRequest} className="space-y-4">
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
            placeholder="Brief description of the issue"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Category</label>
              <select
                value={formCategory}
                onChange={e => setFormCategory(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
                required
              >
                {MAINTENANCE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <select
                value={formPriority}
                onChange={e => setFormPriority(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
                required
              >
                {MAINTENANCE_PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="Provide additional details about the issue, location, urgency, etc."
              rows={4}
              className="block w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button type="submit" isLoading={formLoading} disabled={!formTitle.trim()}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
