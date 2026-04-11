'use client'

import { useEffect, useState } from 'react'
import { getPlatformStats } from '@/lib/admin-api'
import type { PlatformStats } from '@/types/admin'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sub && <div className="text-slate-400 text-xs mt-1">{sub}</div>}
    </div>
  )
}

function BarChart({ data, labelKey, valueKey }: { data: Record<string, unknown>[]; labelKey: string; valueKey: string }) {
  const max = Math.max(...data.map(d => d[valueKey] as number), 1)
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-24 text-xs text-slate-400 truncate text-right">{item[labelKey] as string}</div>
          <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 bg-teal-500 rounded-full transition-all"
              style={{ width: `${((item[valueKey] as number) / max) * 100}%` }}
            />
          </div>
          <div className="w-8 text-xs text-slate-300 text-right">{item[valueKey] as number}</div>
        </div>
      ))}
    </div>
  )
}

function GrowthChart({ data }: { data: Array<{ week: string; count: number }> }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-teal-500 rounded-sm hover:bg-teal-400 transition-colors cursor-default"
            style={{ height: `${(d.count / max) * 80}px`, minHeight: '2px' }}
            title={`${new Date(d.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${d.count} new`}
          />
        </div>
      ))}
    </div>
  )
}

export default function StatsPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!stats) return null

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Statistics</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time data across all communities</p>
      </div>

      {/* Top-line numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total HOAs" value={stats.totalHoas} />
        <StatCard label="Active (30 days)" value={stats.activeHoas} sub={`${stats.totalHoas ? Math.round((stats.activeHoas / stats.totalHoas) * 100) : 0}% of all`} />
        <StatCard label="Total Users" value={stats.totalUsers} sub={`Avg ${stats.avgOwnersPerHoa}/HOA`} />
        <StatCard label="Tasks This Month" value={stats.tasksThisMonth} sub={`${stats.meetingsThisMonth} meetings`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* HOA Growth */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">New HOAs — Last 12 Weeks</h2>
            <span className="text-xs text-slate-400">Weekly</span>
          </div>
          {stats.growthByWeek.length > 0
            ? <GrowthChart data={stats.growthByWeek} />
            : <p className="text-slate-500 text-sm">No data yet</p>
          }
        </div>

        {/* Users by role */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-sm font-semibold text-white mb-4">Users by Role</h2>
          <BarChart data={stats.usersByRole} labelKey="role" valueKey="count" />
        </div>

        {/* Subscriptions by status */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-sm font-semibold text-white mb-4">Subscriptions by Status</h2>
          <BarChart data={stats.subscriptionsByStatus} labelKey="status" valueKey="count" />
        </div>

        {/* HOAs by tier */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-sm font-semibold text-white mb-4">HOAs by Tier</h2>
          <BarChart data={stats.hoasByTier} labelKey="tier" valueKey="count" />
        </div>

        {/* Feature usage */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-sm font-semibold text-white mb-4">Feature Usage This Month</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Tasks created</span>
              <span className="text-white font-semibold">{stats.tasksThisMonth}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Meetings completed</span>
              <span className="text-white font-semibold">{stats.meetingsThisMonth}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Avg owners / HOA</span>
              <span className="text-white font-semibold">{stats.avgOwnersPerHoa}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
