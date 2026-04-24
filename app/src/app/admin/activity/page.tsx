'use client'

import { useEffect, useState, useCallback } from 'react'
import { getActivityLog } from '@/lib/admin-api'
import type { AuditLogEntry } from '@/types/admin'
import { Activity, RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react'

// ── Action metadata ───────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string }> = {
  DISABLE_USER:             { label: 'Disable User',       color: 'bg-red-900/50 text-red-400 border-red-800' },
  ENABLE_USER:              { label: 'Enable User',        color: 'bg-emerald-900/50 text-emerald-400 border-emerald-800' },
  RESET_PASSWORD:           { label: 'Reset Password',     color: 'bg-amber-900/50 text-amber-400 border-amber-800' },
  UPDATE_USER_ROLE:         { label: 'Role Changed',       color: 'bg-violet-900/50 text-violet-400 border-violet-800' },
  UPDATE_HOA:               { label: 'HOA Updated',        color: 'bg-blue-900/50 text-blue-400 border-blue-800' },
  UPDATE_SUBSCRIPTION_TIER: { label: 'Tier Changed',       color: 'bg-teal-900/50 text-teal-400 border-teal-800' },
  EXTEND_TRIAL:             { label: 'Trial Extended',     color: 'bg-sky-900/50 text-sky-400 border-sky-800' },
}

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action.replace(/_/g, ' '), color: 'bg-slate-700 text-slate-300 border-slate-600' }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }
}

function payloadSummary(entry: AuditLogEntry): string {
  try {
    const obj = JSON.parse(entry.payloadJson) as Record<string, unknown>
    const parts: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      parts.push(`${k}: ${String(v)}`)
    }
    return parts.join(' · ') || '—'
  } catch {
    return '—'
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function ActivityPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('all')

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const data = await getActivityLog({ limit: PAGE_SIZE, offset: p * PAGE_SIZE })
      setEntries(data.entries)
      setTotal(data.total)
      setError(null)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page) }, [load, page])

  const actionTypes = Array.from(new Set(entries.map(e => e.action))).sort()

  const filtered = entries.filter(e => {
    const text = `${e.action} ${e.targetType} ${e.targetName ?? ''} ${e.adminUserId} ${e.payloadJson}`.toLowerCase()
    const matchSearch = !search || text.includes(search.toLowerCase())
    const matchAction = actionFilter === 'all' || e.action === actionFilter
    return matchSearch && matchAction
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Log</h1>
          <p className="text-slate-400 text-sm mt-0.5">{total.toLocaleString()} total actions recorded</p>
        </div>
        <button
          onClick={() => void load(page)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">Error: {error}</div>}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="search"
            placeholder="Search actions, targets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 text-white placeholder-slate-500 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All actions</option>
          {actionTypes.map(a => (
            <option key={a} value={a}>{actionMeta(a).label}</option>
          ))}
        </select>
      </div>

      {/* Activity feed */}
      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-3 text-slate-400 py-12 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading activity…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Activity className="h-8 w-8 text-slate-600" />
          <p className="text-slate-500">No activity recorded yet</p>
          <p className="text-slate-600 text-xs">Actions taken by superadmin users will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => {
            const meta = actionMeta(entry.action)
            const { date, time } = formatTime(entry.createdAt)
            return (
              <div
                key={entry.id}
                className="flex gap-4 p-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
              >
                {/* Time column */}
                <div className="shrink-0 w-28 text-right">
                  <p className="text-xs font-medium text-slate-300">{time}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{date}</p>
                </div>

                {/* Divider */}
                <div className="shrink-0 w-px bg-slate-700 self-stretch" />

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.color}`}>
                      {meta.label}
                    </span>
                    {entry.targetName && (
                      <span className="text-sm text-white font-medium truncate">{entry.targetName}</span>
                    )}
                    <span className="text-xs text-slate-500 capitalize px-1.5 py-0.5 rounded bg-slate-700/50">
                      {entry.targetType}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>
                      Admin: <span className="text-slate-400">{entry.adminUserId.length > 20
                        ? `${entry.adminUserId.slice(0, 20)}…`
                        : entry.adminUserId
                      }</span>
                    </span>
                    {entry.targetId && (
                      <span>
                        Target ID: <span className="font-mono text-slate-400">{entry.targetId.slice(0, 8)}…</span>
                      </span>
                    )}
                    {entry.payloadJson && entry.payloadJson !== '{}' && (
                      <span className="text-slate-500">{payloadSummary(entry)}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Page {page + 1} of {totalPages} · {total} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors border border-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-slate-400">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors border border-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
