'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getHoas } from '@/lib/admin-api'
import type { HoaSummary } from '@/types/admin'

function statusBadge(status: string | null) {
  const s = (status ?? 'none').toLowerCase()
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    trialing: 'bg-blue-100 text-blue-800',
    trial: 'bg-blue-100 text-blue-800',
    past_due: 'bg-amber-100 text-amber-800',
    cancelled: 'bg-red-100 text-red-800',
    none: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[s] ?? colors.none}`}>
      {status ?? 'none'}
    </span>
  )
}

export default function HoasPage() {
  const [hoas, setHoas] = useState<HoaSummary[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHoas()
      .then(setHoas)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = hoas.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase()) ||
    h.city.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">HOA Communities</h1>
          <p className="text-slate-400 text-sm mt-1">{hoas.length} total communities</p>
        </div>
        <input
          type="search"
          placeholder="Search by name or city…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 rounded-lg bg-slate-800 text-white placeholder-slate-400 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
        />
      </div>

      {loading && <p className="text-slate-400">Loading…</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Tier</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Users</th>
                <th className="px-4 py-3 text-right">Units</th>
                <th className="px-4 py-3 text-right">Open Tasks</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(hoa => (
                <tr key={hoa.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/hoas/${hoa.id}`} className="text-teal-400 hover:text-teal-300 font-medium">
                      {hoa.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{[hoa.city, hoa.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-3">{hoa.subscriptionTier ?? '—'}</td>
                  <td className="px-4 py-3">{statusBadge(hoa.subscriptionStatus)}</td>
                  <td className="px-4 py-3 text-right">{hoa.userCount}</td>
                  <td className="px-4 py-3 text-right">{hoa.unitCount}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={hoa.openTasks > 0 ? 'text-amber-400' : 'text-slate-500'}>{hoa.openTasks}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(hoa.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No communities found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
