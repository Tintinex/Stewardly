'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getSubscriptions, updateSubscriptionTier, extendTrial } from '@/lib/admin-api'
import type { SubscriptionsData, SubscriptionRecord } from '@/types/admin'
import { TrendingUp, RefreshCw, ChevronDown } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_PRICES: Record<string, number> = { starter: 49, growth: 99, pro: 249 }
const TIER_COLORS: Record<string, string> = {
  starter: 'bg-slate-700 text-slate-300',
  growth:  'bg-teal-900/50 text-teal-400',
  pro:     'bg-violet-900/50 text-violet-400',
  none:    'bg-slate-700 text-slate-400',
  trialing:'bg-blue-900/50 text-blue-400',
}
const STATUS_COLORS: Record<string, string> = {
  active:    'bg-emerald-900/50 text-emerald-400',
  trialing:  'bg-blue-900/50 text-blue-400',
  trial:     'bg-blue-900/50 text-blue-400',
  past_due:  'bg-amber-900/50 text-amber-400',
  cancelled: 'bg-red-900/50 text-red-400',
  canceled:  'bg-red-900/50 text-red-400',
  none:      'bg-slate-700 text-slate-400',
}

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`
}

function MrrHistoryChart({ data }: { data: Array<{ month: string; mrr: number }> }) {
  const max = Math.max(...data.map(d => d.mrr), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => {
        const isLatest = i === data.length - 1
        return (
          <div key={i} className="flex-1 group relative">
            <div
              className={`w-full rounded-sm transition-all ${isLatest ? 'bg-teal-400' : 'bg-slate-600 group-hover:bg-teal-600'}`}
              style={{ height: `${Math.max((d.mrr / max) * 100, 2)}%`, minHeight: '4px' }}
              title={`${d.month}: ${fmt(d.mrr)}`}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Inline tier + trial controls ──────────────────────────────────────────────

function TierSelect({
  record,
  onChanged,
  onMsg,
}: {
  record: SubscriptionRecord
  onChanged: () => void
  onMsg: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const tiers = ['starter', 'growth', 'pro']

  const changeTier = async (tier: string) => {
    if (tier === record.tier) { setOpen(false); return }
    setSaving(true)
    setOpen(false)
    try {
      await updateSubscriptionTier(record.hoaId, tier)
      onMsg(`Tier updated → ${tier} for ${record.hoaName}`)
      onChanged()
    } catch (e: unknown) {
      onMsg(`Error: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : record.tier}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-32 bg-slate-700 rounded-lg border border-slate-600 shadow-xl z-10">
          {tiers.map(t => (
            <button
              key={t}
              onClick={() => void changeTier(t)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-600 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                t === record.tier ? 'text-teal-400 font-semibold' : 'text-slate-300'
              }`}
            >
              {t} · ${TIER_PRICES[t]}/mo
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ExtendTrialButton({
  record,
  onChanged,
  onMsg,
}: {
  record: SubscriptionRecord
  onChanged: () => void
  onMsg: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const isInTrial = ['trialing', 'trial'].includes(record.status.toLowerCase())
  if (!isInTrial) return null

  const handleExtend = async (days: number) => {
    setSaving(true)
    try {
      await extendTrial(record.hoaId, days)
      onMsg(`Trial extended by ${days} days for ${record.hoaName}`)
      onChanged()
    } catch (e: unknown) {
      onMsg(`Error: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={() => void handleExtend(14)}
      disabled={saving}
      className="px-2.5 py-1 rounded-lg bg-blue-900/40 hover:bg-blue-800/50 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50"
    >
      {saving ? '…' : '+14d'}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [data, setData] = useState<SubscriptionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const load = useCallback(async () => {
    try {
      const d = await getSubscriptions()
      setData(d)
      setError(null)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-400">
      <RefreshCw className="h-4 w-4 animate-spin" /> Loading subscriptions…
    </div>
  )
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!data) return null

  const filtered = data.subscriptions.filter(s => {
    const matchSearch = `${s.hoaName} ${s.city} ${s.state}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status.toLowerCase() === statusFilter
    return matchSearch && matchStatus
  })

  const totalByTierMrr = data.byTier.reduce((s, t) => s + t.mrr, 0) || 1

  return (
    <div className="p-8 space-y-7">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.subscriptions.length} communities · revenue & plan management</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-5 py-3 border border-slate-700">
          <div className="text-center">
            <p className="text-xs text-slate-400 uppercase tracking-wider">MRR</p>
            <p className="text-xl font-bold text-teal-400">{fmt(data.mrr)}</p>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div className="text-center">
            <p className="text-xs text-slate-400 uppercase tracking-wider">ARR</p>
            <p className="text-xl font-bold text-white">{fmt(data.arr)}</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 text-sm">
          {msg}
          <button onClick={() => setMsg(null)} className="text-slate-500 hover:text-white ml-4">✕</button>
        </div>
      )}

      {/* Revenue breakdown + MRR history */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Tier breakdown */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-sm font-semibold text-white mb-4">Revenue by Plan</h2>
          <div className="space-y-3">
            {['pro', 'growth', 'starter', 'trialing', 'trial', 'none'].map(tier => {
              const row = data.byTier.find(t => t.tier === tier)
              if (!row || row.count === 0) return null
              const pct = Math.round((row.mrr / totalByTierMrr) * 100) || 0
              return (
                <div key={tier}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="capitalize font-medium text-slate-300">{tier}</span>
                    <span className="text-slate-400">{row.count} HOAs · {row.mrr > 0 ? fmt(row.mrr) : 'free'}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-700">
                    <div
                      className={`h-full rounded-full ${
                        tier === 'pro'     ? 'bg-violet-500' :
                        tier === 'growth'  ? 'bg-teal-500' :
                        tier === 'starter' ? 'bg-blue-500' : 'bg-slate-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* MRR history */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-white">MRR History</h2>
            <TrendingUp className="h-4 w-4 text-teal-400" />
          </div>
          <p className="text-xs text-slate-500 mb-4">Active subscriptions over last 12 months</p>
          <MrrHistoryChart data={data.mrrHistory} />
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-slate-600">{data.mrrHistory[0]?.month}</span>
            <span className="text-[10px] text-slate-600">{data.mrrHistory[data.mrrHistory.length - 1]?.month}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          placeholder="Search by name or location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 rounded-lg bg-slate-800 text-white placeholder-slate-500 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex gap-1 bg-slate-800 rounded-lg border border-slate-700 p-1">
          {['all', 'active', 'trialing', 'past_due', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Subscriptions table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
              <th className="px-4 py-3 text-left">Community</th>
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3 text-right">Users</th>
              <th className="px-4 py-3 text-right">Units</th>
              <th className="px-4 py-3 text-left">Renewal / Trial End</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(s => (
              <tr key={s.hoaId} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/admin/hoas/${s.hoaId}`} className="text-white hover:text-teal-400 transition-colors">
                    {s.hoaName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {[s.city, s.state].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <TierSelect record={s} onChanged={load} onMsg={setMsg} />
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status.toLowerCase()] ?? STATUS_COLORS.none}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={s.mrr > 0 ? 'text-teal-400 font-semibold' : 'text-slate-500'}>
                    {s.mrr > 0 ? fmt(s.mrr) : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-300">{s.userCount}</td>
                <td className="px-4 py-3 text-right text-slate-400">{s.unitCount}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {s.trialEndsAt
                    ? <span className="text-blue-400">{new Date(s.trialEndsAt).toLocaleDateString()}</span>
                    : s.currentPeriodEnd
                      ? new Date(s.currentPeriodEnd).toLocaleDateString()
                      : '—'
                  }
                </td>
                <td className="px-4 py-3">
                  <ExtendTrialButton record={s} onChanged={load} onMsg={setMsg} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No subscriptions match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
