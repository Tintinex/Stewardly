'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getAdminDashboard } from '@/lib/admin-api'
import type { AdminDashboardData } from '@/types/admin'
import {
  TrendingUp, Users, Building2, CreditCard,
  Clock, AlertTriangle, RefreshCw, CheckCircle2,
  AlertCircle, XCircle, ArrowUpRight,
} from 'lucide-react'

// ── Small helpers ─────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`
}

function KpiCard({
  label, value, sub, subColor, icon: Icon, iconColor,
}: {
  label: string
  value: string | number
  sub?: string
  subColor?: string
  icon: React.ElementType
  iconColor: string
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        {sub && <div className={`text-xs mt-1 ${subColor ?? 'text-slate-400'}`}>{sub}</div>}
      </div>
    </div>
  )
}

function MrrChart({ data }: { data: Array<{ month: string; mrr: number }> }) {
  const max = Math.max(...data.map(d => d.mrr), 1)
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => {
        const pct = (d.mrr / max) * 100
        const isLatest = i === data.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div
              className={`w-full rounded-t transition-all ${isLatest ? 'bg-teal-400' : 'bg-slate-600 group-hover:bg-teal-600'}`}
              style={{ height: `${Math.max(pct * 0.9, 2)}%`, minHeight: '4px' }}
              title={`${d.month}: ${fmt(d.mrr)}`}
            />
            {i % 3 === 0 && (
              <span className="text-[9px] text-slate-500 whitespace-nowrap">{d.month}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function HealthDot({ status }: { status: 'healthy' | 'degraded' | 'down' }) {
  const cfg = {
    healthy:  { color: 'bg-emerald-500', label: 'Healthy',  text: 'text-emerald-400', Icon: CheckCircle2 },
    degraded: { color: 'bg-amber-500',   label: 'Degraded', text: 'text-amber-400',   Icon: AlertCircle },
    down:     { color: 'bg-red-500',     label: 'Down',     text: 'text-red-400',     Icon: XCircle },
  }[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <cfg.Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const d = await getAdminDashboard()
      setData(d)
      setLastRefresh(new Date())
      setError(null)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-400">
      <RefreshCw className="h-4 w-4 animate-spin" />
      Loading platform overview…
    </div>
  )
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!data) return null

  const tierColors: Record<string, string> = {
    starter: 'bg-slate-700 text-slate-300',
    growth:  'bg-teal-900/50 text-teal-400',
    pro:     'bg-violet-900/50 text-violet-400',
    none:    'bg-slate-700 text-slate-400',
  }

  return (
    <div className="p-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Last updated {lastRefresh.toLocaleTimeString()} ·{' '}
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="MRR"
          value={fmt(data.mrr)}
          sub={`ARR ${fmt(data.arr)}`}
          icon={TrendingUp}
          iconColor="bg-teal-600/20 text-teal-400"
        />
        <KpiCard
          label="Active Plans"
          value={data.activeSubscriptions}
          sub={`of ${data.totalHoas} HOAs`}
          icon={CreditCard}
          iconColor="bg-violet-600/20 text-violet-400"
        />
        <KpiCard
          label="Total HOAs"
          value={data.totalHoas}
          sub={data.newHoasThisMonth > 0 ? `+${data.newHoasThisMonth} this month` : 'No new this month'}
          subColor={data.newHoasThisMonth > 0 ? 'text-emerald-400' : 'text-slate-500'}
          icon={Building2}
          iconColor="bg-blue-600/20 text-blue-400"
        />
        <KpiCard
          label="Total Users"
          value={data.totalUsers}
          icon={Users}
          iconColor="bg-amber-600/20 text-amber-400"
        />
        <KpiCard
          label="In Trial"
          value={data.trialCount}
          sub={data.trialExpiringSoon > 0 ? `${data.trialExpiringSoon} expiring soon` : 'None expiring'}
          subColor={data.trialExpiringSoon > 0 ? 'text-amber-400' : 'text-slate-400'}
          icon={Clock}
          iconColor="bg-orange-600/20 text-orange-400"
        />
        <KpiCard
          label="Churned"
          value={data.churnedThisMonth}
          sub="This month"
          subColor={data.churnedThisMonth > 0 ? 'text-red-400' : 'text-slate-400'}
          icon={AlertTriangle}
          iconColor={data.churnedThisMonth > 0 ? 'bg-red-600/20 text-red-400' : 'bg-slate-600/20 text-slate-400'}
        />
      </div>

      {/* MRR trend + trial pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* MRR Trend */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-white">MRR Trend — Last 12 Months</h2>
            <span className="text-xs text-slate-400">Current: <span className="text-teal-400 font-semibold">{fmt(data.mrr)}/mo</span></span>
          </div>
          <p className="text-xs text-slate-500 mb-4">Based on active subscriptions at each month point</p>
          {data.mrrTrend.length > 0
            ? <MrrChart data={data.mrrTrend} />
            : <p className="text-slate-500 text-sm h-28 flex items-center justify-center">No data yet</p>
          }
        </div>

        {/* Trial Pipeline */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Trial Pipeline</h2>
            <Link href="/admin/subscriptions" className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-0.5">
              Manage <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {data.trialPipeline.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-slate-500 text-sm text-center">No HOAs currently in trial</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {data.trialPipeline.slice(0, 6).map(hoa => {
                const urgent = hoa.daysLeft <= 3
                const warn   = hoa.daysLeft <= 7
                return (
                  <li key={hoa.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{hoa.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{hoa.tier} · {hoa.userCount} users</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      urgent ? 'bg-red-900/50 text-red-400' :
                      warn   ? 'bg-amber-900/50 text-amber-400' :
                               'bg-slate-700 text-slate-300'
                    }`}>
                      {hoa.daysLeft}d left
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Recent Signups + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Signups */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Signups</h2>
            <Link href="/admin/hoas" className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-0.5">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {data.recentSignups.length === 0 ? (
            <p className="px-5 py-6 text-slate-500 text-sm">No new HOAs in the last 30 days</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-700/50">
                  <th className="px-5 py-2.5 text-left">Community</th>
                  <th className="px-5 py-2.5 text-left">Location</th>
                  <th className="px-5 py-2.5 text-left">Plan</th>
                  <th className="px-5 py-2.5 text-right">Users</th>
                  <th className="px-5 py-2.5 text-left">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.recentSignups.map(h => (
                  <tr key={h.id} className="hover:bg-slate-700/30">
                    <td className="px-5 py-3">
                      <Link href={`/admin/hoas/${h.id}`} className="text-white font-medium hover:text-teal-400 transition-colors">
                        {h.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{[h.city, h.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierColors[h.tier] ?? tierColors.none}`}>
                        {h.tier}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">{h.userCount}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* System Health */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">System Health</h2>
            <HealthDot status={data.systemHealth.status} />
          </div>

          <ul className="space-y-3">
            {[
              {
                label: 'API 5xx Errors',
                value: data.systemHealth.apiErrors5xx,
                ok: data.systemHealth.apiErrors5xx === 0,
                warn: data.systemHealth.apiErrors5xx < 5,
                format: (v: number) => String(v),
              },
              {
                label: 'Database CPU',
                value: data.systemHealth.dbCpu,
                ok: data.systemHealth.dbCpu < 60,
                warn: data.systemHealth.dbCpu < 85,
                format: (v: number) => `${v}%`,
              },
              {
                label: 'Lambda Errors',
                value: data.systemHealth.lambdaErrors,
                ok: data.systemHealth.lambdaErrors === 0,
                warn: data.systemHealth.lambdaErrors < 10,
                format: (v: number) => String(v),
              },
            ].map(({ label, value, ok, warn, format }) => (
              <li key={label} className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{label}</span>
                <span className={`text-sm font-semibold tabular-nums ${
                  ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {format(value)}
                </span>
              </li>
            ))}
          </ul>

          <Link
            href="/admin/monitoring"
            className="mt-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors"
          >
            View full monitoring <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
