'use client'

import { useEffect, useState } from 'react'
import { getBillingOverview } from '@/lib/admin-api'
import type { BillingOverview } from '@/types/admin'

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function statusColor(status: string) {
  const s = status.toLowerCase()
  if (s === 'active') return 'bg-emerald-900/50 text-emerald-400'
  if (s === 'trialing' || s === 'trial') return 'bg-blue-900/50 text-blue-400'
  if (s === 'past_due') return 'bg-amber-900/50 text-amber-400'
  if (s === 'cancelled' || s === 'canceled') return 'bg-red-900/50 text-red-400'
  return 'bg-slate-700 text-slate-400'
}

export default function BillingPage() {
  const [data, setData] = useState<BillingOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getBillingOverview()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!data) return null

  const filtered = data.hoas.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing Overview</h1>
        <p className="text-slate-400 text-sm mt-1">{data.hoas.length} communities</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Active" value={data.summary.active} color="text-emerald-400" />
        <SummaryCard label="Trial" value={data.summary.trial} color="text-blue-400" />
        <SummaryCard label="Past Due" value={data.summary.pastDue} color="text-amber-400" />
        <SummaryCard label="Cancelled" value={data.summary.cancelled} color="text-red-400" />
      </div>

      <div className="flex justify-end">
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 rounded-lg bg-slate-800 text-white placeholder-slate-400 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Community</th>
              <th className="px-4 py-3 text-left">Tier</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Users</th>
              <th className="px-4 py-3 text-left">Trial Ends</th>
              <th className="px-4 py-3 text-left">Period End</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(h => (
              <tr key={h.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-3 font-medium text-white">{h.name}</td>
                <td className="px-4 py-3 text-slate-400">{h.tier}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(h.status)}`}>
                    {h.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{h.userCount}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {h.trialEndsAt ? new Date(h.trialEndsAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {h.currentPeriodEnd ? new Date(h.currentPeriodEnd).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No results</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
