'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Home, Wrench, DollarSign, BedDouble, Bath, Maximize2,
  Plus, CheckCircle, Clock, AlertCircle, X, ChevronDown,
  User, Mail, Phone, Shield, MapPin, TrendingUp, Newspaper,
  Train, ExternalLink, RefreshCw, Building2,
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
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

interface OwnerProfile {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  role: string
  unitId: string | null
}

interface UnitDetail {
  id: string
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
  owner: OwnerProfile
  unit: UnitDetail | null
  assessments: Assessment[]
  hoaName: string
  hoaAddress: string
  hoaCity: string
  hoaState: string
  hoaZip: string
}

interface NewsItem {
  title: string
  url: string
  source: string
  publishedAt: string
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

// ─── Config ───────────────────────────────────────────────────────────────────

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

const ROLE_LABELS: Record<string, string> = {
  board_admin:  'Board Admin',
  board_member: 'Board Member',
  homeowner:    'Homeowner',
  tenant:       'Tenant',
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-gray-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  )
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  )
}

// ─── Owner Profile Card ───────────────────────────────────────────────────────

function OwnerProfileCard({ data }: { data: MyUnitData }) {
  const { owner, unit, hoaName } = data
  const roleLabel = ROLE_LABELS[owner.role] ?? owner.role

  return (
    <SectionCard>
      <div className="p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy text-white text-xl font-bold select-none">
            {owner.firstName.charAt(0)}{owner.lastName.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">
                {owner.firstName} {owner.lastName}
              </h2>
              <Badge variant={owner.role === 'board_admin' || owner.role === 'board_member' ? 'info' : 'default'}>
                {roleLabel}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-gray-500 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              {hoaName}
              {unit && (
                <>
                  <span className="text-gray-300">·</span>
                  <Home className="h-3.5 w-3.5 shrink-0" />
                  Unit {unit.unitNumber}
                </>
              )}
            </p>

            {/* Contact row */}
            <div className="mt-3 flex flex-wrap gap-4">
              <span className="flex items-center gap-1.5 text-sm text-gray-600">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                {owner.email}
              </span>
              {owner.phone && (
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  {owner.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Unit specs (if present) */}
        {unit && (
          <>
            <div className="mt-4 h-px bg-gray-100" />
            <div className="mt-4 flex flex-wrap gap-5">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">{unit.address || data.hoaAddress}</span>
              </div>
              {unit.sqft != null && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Maximize2 className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-800">{unit.sqft.toLocaleString()}</span>
                  <span className="text-gray-400">sqft</span>
                </div>
              )}
              {unit.bedrooms != null && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <BedDouble className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-800">{unit.bedrooms}</span>
                  <span className="text-gray-400">beds</span>
                </div>
              )}
              {unit.bathrooms != null && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Bath className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-800">{unit.bathrooms}</span>
                  <span className="text-gray-400">baths</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}

// ─── Home Value Card ──────────────────────────────────────────────────────────

function HomeValueCard({ data }: { data: MyUnitData }) {
  const address = data.unit?.address || data.hoaAddress
  const zip = data.hoaZip
  const city = data.hoaCity
  const state = data.hoaState

  // Zillow search URL — prefilled with address then zip as fallback
  const zillowQuery = address
    ? encodeURIComponent(address)
    : encodeURIComponent(`${city} ${state} ${zip}`.trim())
  const zillowUrl = address
    ? `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/`
    : `https://www.zillow.com/homes/${zip}_rb/`

  const realtorUrl = `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(city)}_${state}`

  return (
    <SectionCard>
      <SectionHeader
        icon={<TrendingUp className="h-4.5 w-4.5 text-teal" />}
        title="Home Value"
      />
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-5">
          Check the estimated market value and recent sales data for{' '}
          <span className="font-medium text-gray-700">{address || `${city}, ${state}`}</span>.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <a
            href={zillowUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <TrendingUp className="h-4 w-4" />
            View on Zillow
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>
          <a
            href={realtorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
          >
            <Home className="h-4 w-4" />
            Realtor.com
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Nearby Transit Card ──────────────────────────────────────────────────────

function NearbyTransitCard({ data }: { data: MyUnitData }) {
  const address = data.unit?.address || `${data.hoaAddress} ${data.hoaCity} ${data.hoaState}`.trim()
  const mapQuery = encodeURIComponent(address || `${data.hoaCity} ${data.hoaState}`)

  // Google Maps embed (no API key needed for the old embed URL)
  const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&output=embed&z=14`

  // Link to open Google Maps transit directions
  const transitUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}&travelmode=transit`
  const walkUrl = `https://www.google.com/maps/search/?api=1&query=public+transit+near+${mapQuery}`

  return (
    <SectionCard>
      <SectionHeader
        icon={<Train className="h-4.5 w-4.5 text-teal" />}
        title="Nearby Public Transportation"
      />
      <div className="overflow-hidden rounded-b-xl">
        {/* Map embed */}
        <div className="relative w-full" style={{ height: '220px' }}>
          <iframe
            src={mapEmbedUrl}
            className="w-full h-full border-0"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Map view"
          />
        </div>
        <div className="flex gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100">
          <a
            href={transitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-navy text-white text-sm font-medium px-4 py-2.5 hover:bg-navy/90 transition-colors"
          >
            <Train className="h-4 w-4" />
            Transit Directions
          </a>
          <a
            href={walkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-medium px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <MapPin className="h-4 w-4" />
            Find Stops
          </a>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Local News Card ──────────────────────────────────────────────────────────

function LocalNewsCard({ city, state }: { city: string; state: string }) {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [newsError, setNewsError] = useState(false)

  const loadNews = useCallback(async () => {
    setNewsLoading(true)
    setNewsError(false)
    try {
      const res = await fetch(`/api/local-news?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`)
      const data = await res.json() as { items: NewsItem[] }
      setNewsItems(data.items ?? [])
    } catch {
      setNewsError(true)
    } finally {
      setNewsLoading(false)
    }
  }, [city, state])

  useEffect(() => {
    if (city) void loadNews()
  }, [city, loadNews])

  const googleNewsUrl = `https://news.google.com/search?q=${encodeURIComponent(`${city} ${state} community`)}&hl=en-US`

  return (
    <SectionCard>
      <SectionHeader
        icon={<Newspaper className="h-4.5 w-4.5 text-teal" />}
        title={`Local News · ${city}${state ? `, ${state}` : ''}`}
        action={
          <button
            onClick={() => void loadNews()}
            disabled={newsLoading}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh news"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', newsLoading && 'animate-spin')} />
          </button>
        }
      />
      <div className="p-5">
        {newsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : newsError || newsItems.length === 0 ? (
          <div className="text-center py-6">
            <Newspaper className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-400 mb-3">
              {newsError ? 'Unable to load news right now.' : 'No local news found for your area.'}
            </p>
            <a
              href={googleNewsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal hover:underline"
            >
              Search Google News
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {newsItems.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block py-3 first:pt-0 last:pb-0 hover:bg-transparent"
                >
                  <p className="text-sm font-medium text-gray-800 group-hover:text-teal transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                    <span className="font-medium text-gray-500">{item.source}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}</span>
                  </p>
                </a>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <a
                href={googleNewsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-teal transition-colors"
              >
                More local news on Google News
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}

// ─── Assessments Table ────────────────────────────────────────────────────────

function AssessmentsSection({ assessments }: { assessments: Assessment[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-teal" />
        <h2 className="text-base font-semibold text-gray-900">Dues &amp; Assessments</h2>
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          icon={<DollarSign className="h-8 w-8" />}
          title="No assessments found"
          description="Your dues and assessment history will appear here."
        />
      ) : (
        <SectionCard className="overflow-hidden">
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
              {assessments.map(a => {
                const statusCfg = assessmentStatusConfig[a.status]
                const isExpanded = expanded === a.id
                return (
                  <React.Fragment key={a.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setExpanded(isExpanded ? null : a.id)}
                    >
                      <td className="px-5 py-3.5 font-medium text-gray-900">{a.description ?? 'Monthly HOA Dues'}</td>
                      <td className="px-5 py-3.5 text-gray-700 font-medium tabular-nums">
                        ${a.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">{format(parseISO(a.dueDate), 'MMM d, yyyy')}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={statusCfg.variant} className="flex w-fit items-center gap-1">
                          {statusCfg.icon}{statusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-2">
                        <ChevronDown className={clsx('h-4 w-4 text-gray-400 transition-transform', isExpanded && 'rotate-180')} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={5} className="px-5 py-3">
                          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                            {a.paidDate && (
                              <div>
                                <span className="font-medium text-gray-700">Paid On: </span>
                                {format(parseISO(a.paidDate), 'MMM d, yyyy')}
                              </div>
                            )}
                            {a.status === 'overdue' && (
                              <div className="flex items-center gap-1.5 text-red-600">
                                <AlertCircle className="h-4 w-4" />
                                This assessment is past due. Please contact the HOA office.
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
        </SectionCard>
      )}
    </section>
  )
}

// ─── Maintenance Requests Section ─────────────────────────────────────────────

function MaintenanceSection({
  requests,
  onAddRequest,
}: {
  requests: MaintenanceRequest[]
  onAddRequest: () => void
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-teal" />
          Maintenance Requests
        </h2>
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={onAddRequest}>
          Submit Request
        </Button>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-8 w-8" />}
          title="No maintenance requests"
          description="Submit a request for any repairs or issues in your unit or common areas."
          ctaLabel="Submit Request"
          onCta={onAddRequest}
        />
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const statusCfg = maintenanceStatusConfig[req.status] ?? { label: req.status, variant: 'default' as const }
            return (
              <SectionCard key={req.id} className="px-5 py-4">
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
              </SectionCard>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyUnitPage() {
  const { isLoading: authLoading } = useAuth()

  const [unitData, setUnitData] = useState<MyUnitData | null>(null)
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Maintenance modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('plumbing')
  const [formDescription, setFormDescription] = useState('')
  const [formPriority, setFormPriority] = useState('normal')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
        setError(err instanceof Error ? err.message : 'Failed to load data')
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
        body: JSON.stringify({ title: formTitle, category: formCategory, description: formDescription, priority: formPriority }),
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

  // ── Loading / error states ─────────────────────────────────────────────────

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
        <p className="font-semibold text-red-700">Unable to load data</p>
        <p className="mt-1 text-sm text-red-500">{error}</p>
        <Button className="mt-4" size="sm" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!unitData) return null

  const hasUnit = !!unitData.unit
  const hasAssessments = unitData.assessments.length > 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {hasUnit ? 'My Unit' : 'My Profile'}
        </h1>
        <p className="text-sm text-gray-500">
          {unitData.hoaName}
          {unitData.hoaCity && ` · ${unitData.hoaCity}${unitData.hoaState ? `, ${unitData.hoaState}` : ''}`}
        </p>
      </div>

      {/* Top row: Profile + Home Value */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OwnerProfileCard data={unitData} />
        </div>
        <div>
          <HomeValueCard data={unitData} />
        </div>
      </div>

      {/* Map + News row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NearbyTransitCard data={unitData} />
        <LocalNewsCard city={unitData.hoaCity} state={unitData.hoaState} />
      </div>

      {/* Assessments — only shown if the user has a unit */}
      {hasUnit && (
        <AssessmentsSection
          assessments={unitData.assessments as unknown as Assessment[]}
        />
      )}

      {/* Board admin notice when no unit assigned */}
      {!hasUnit && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-6 py-5 flex items-start gap-4">
          <Shield className="mt-0.5 h-5 w-5 text-blue-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">No unit assigned to your account</p>
            <p className="mt-0.5 text-sm text-blue-600">
              As a board administrator, you don't need a unit assignment. Dues &amp; assessments will appear here once a unit is linked to your profile.
            </p>
          </div>
        </div>
      )}

      {/* Maintenance Requests */}
      <MaintenanceSection requests={requests} onAddRequest={() => setIsModalOpen(true)} />

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
