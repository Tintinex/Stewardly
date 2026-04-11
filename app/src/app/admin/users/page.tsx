'use client'

import { useEffect, useState } from 'react'
import { getAdminUsers, disableUser, enableUser, resetUserPassword } from '@/lib/admin-api'
import type { AdminUserRecord } from '@/types/admin'

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    getAdminUsers()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filtered = users.filter(u =>
    `${u.firstName} ${u.lastName} ${u.email} ${u.hoaName ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleAction(action: 'disable' | 'enable' | 'reset', user: AdminUserRecord) {
    if (!user.cognitoUsername) return setActionMsg('No Cognito username found for this user')
    try {
      if (action === 'disable') await disableUser(user.cognitoUsername)
      else if (action === 'enable') await enableUser(user.cognitoUsername)
      else await resetUserPassword(user.cognitoUsername)
      setActionMsg(`${action === 'reset' ? 'Password reset sent' : `User ${action}d`}: ${user.email}`)
      load()
    } catch (e: unknown) {
      setActionMsg(`Error: ${(e as Error).message}`)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">All Users</h1>
          <p className="text-slate-400 text-sm mt-1">{users.length} total users</p>
        </div>
        <input
          type="search"
          placeholder="Search by name, email, HOA…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 rounded-lg bg-slate-800 text-white placeholder-slate-400 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-72"
        />
      </div>

      {actionMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 text-sm flex items-center justify-between">
          {actionMsg}
          <button onClick={() => setActionMsg(null)} className="text-slate-500 hover:text-white ml-4">✕</button>
        </div>
      )}

      {loading && <p className="text-slate-400">Loading…</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">HOA</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(user => (
                <tr key={user.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-white">{user.firstName} {user.lastName}</td>
                  <td className="px-4 py-3 text-slate-400">{user.email}</td>
                  <td className="px-4 py-3 text-slate-400">{user.hoaName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-xs">{user.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.status === 'active' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.status === 'active'
                        ? <button onClick={() => handleAction('disable', user)} className="text-xs text-amber-400 hover:text-amber-300">Disable</button>
                        : <button onClick={() => handleAction('enable', user)} className="text-xs text-emerald-400 hover:text-emerald-300">Enable</button>
                      }
                      <button onClick={() => handleAction('reset', user)} className="text-xs text-slate-400 hover:text-white">Reset PW</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
