'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getHoa, updateHoa, getAdminUsers } from '@/lib/admin-api'
import type { HoaDetail, AdminUserRecord } from '@/types/admin'

export default function HoaDetailPage() {
  const { hoaId } = useParams<{ hoaId: string }>()
  const router = useRouter()
  const [hoa, setHoa] = useState<HoaDetail | null>(null)
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getHoa(hoaId), getAdminUsers(hoaId)])
      .then(([h, u]) => {
        setHoa(h)
        setUsers(u)
        setEditName(h.name)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [hoaId])

  async function handleSave() {
    if (!hoa) return
    setSaving(true)
    try {
      const updated = await updateHoa(hoaId, { name: editName })
      setHoa(updated)
      setEditing(false)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!hoa) return null

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="text-slate-600">/</span>
        <Link href="/admin/hoas" className="text-slate-400 hover:text-white text-sm">HOAs</Link>
        <span className="text-slate-600">/</span>
        <span className="text-white text-sm">{hoa.name}</span>
      </div>

      {/* HOA Summary */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-start justify-between mb-4">
          {editing ? (
            <div className="flex items-center gap-3">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-700 text-white border border-slate-600 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setEditName(hoa.name) }} className="text-slate-400 hover:text-white text-sm">
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-white">{hoa.name}</h1>
          )}
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-white border border-slate-600 px-3 py-1.5 rounded-lg">
              Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Location', value: [hoa.city, hoa.state].filter(Boolean).join(', ') || '—' },
            { label: 'Subscription', value: `${hoa.subscriptionTier ?? 'none'} · ${hoa.subscriptionStatus ?? 'none'}` },
            { label: 'Users', value: hoa.userCount },
            { label: 'Units', value: hoa.unitCount },
            { label: 'Open Tasks', value: hoa.openTasks },
            { label: 'Trial Ends', value: hoa.trialEndsAt ? new Date(hoa.trialEndsAt).toLocaleDateString() : '—' },
            { label: 'Created', value: new Date(hoa.createdAt).toLocaleDateString() },
          ].map(item => (
            <div key={item.label}>
              <div className="text-xs text-slate-400 uppercase tracking-wider">{item.label}</div>
              <div className="text-white font-medium mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white">Users ({users.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-700/30">
                <td className="px-4 py-3 text-white">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-xs">{u.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.status === 'active' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                  }`}>{u.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
