'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getMembers, updateMemberStatus } from '@/lib/api'
import type { Member, AuthUser } from '@/types'

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  active:    'bg-green-100 text-green-800',
  pending:   'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status as keyof typeof STATUS_STYLES] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  )
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  board_admin:  'Board Admin',
  board_member: 'Board Member',
  homeowner:    'Homeowner',
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

// ─── Time since ──────────────────────────────────────────────────────────────

function timeSince(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Approval modal ──────────────────────────────────────────────────────────

interface ActionModalProps {
  member: Member
  action: 'approve' | 'suspend' | 'reinstate'
  onConfirm: (notes: string) => void
  onClose: () => void
  loading: boolean
}

function ActionModal({ member, action, onConfirm, onClose, loading }: ActionModalProps) {
  const [notes, setNotes] = useState('')

  const copy = {
    approve:   { title: 'Approve Membership',   btn: 'Approve',   color: 'bg-green-600 hover:bg-green-700' },
    suspend:   { title: 'Suspend Member',        btn: 'Suspend',   color: 'bg-red-600 hover:bg-red-700'   },
    reinstate: { title: 'Reinstate Member',      btn: 'Reinstate', color: 'bg-blue-600 hover:bg-blue-700' },
  }[action]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{copy.title}</h3>
          <p className="text-sm text-gray-600 mb-4">
            {member.firstName} {member.lastName} · {member.email}
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Add a reason or note..."
          />
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notes)}
            disabled={loading}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white ${copy.color} disabled:opacity-50`}
          >
            {loading ? 'Processing…' : copy.btn}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'pending' | 'active' | 'suspended'

export default function MembersPage() {
  const router = useRouter()
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter]   = useState<FilterTab>('all')
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [modal, setModal] = useState<{ member: Member; action: 'approve' | 'suspend' | 'reinstate' } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchMembers = useCallback(async (status?: FilterTab) => {
    setLoading(true)
    setError('')
    try {
      const data = await getMembers(status === 'all' || !status ? undefined : status)
      setMembers(data)
    } catch {
      setError('Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getCurrentUser().then(u => {
      if (u.role !== 'board_admin' && u.role !== 'board_member') {
        router.replace('/dashboard')
        return
      }
      setUser(u)
      void fetchMembers('all')
    }).catch(() => router.replace('/auth/signin'))
  }, [router, fetchMembers])

  const handleFilterChange = (tab: FilterTab) => {
    setFilter(tab)
    void fetchMembers(tab)
  }

  const handleAction = async (notes: string) => {
    if (!modal) return
    setActionLoading(true)
    try {
      const newStatus = modal.action === 'suspend' ? 'suspended' : 'active'
      const updated = await updateMemberStatus(modal.member.id, newStatus, notes || undefined)
      setMembers(prev => prev.map(m => m.id === updated.id ? updated : m))
      setModal(null)
    } catch {
      setError('Failed to update member status')
    } finally {
      setActionLoading(false)
    }
  }

  const pendingCount = members.filter(m => m.status === 'pending').length

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.unitNumber ?? '').toLowerCase().includes(q)
    )
  })

  if (!user) return null

  const isAdmin = user.role === 'board_admin'

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage HOA residents and approve new memberships
          </p>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={() => handleFilterChange('pending')}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm font-medium hover:bg-yellow-100"
          >
            <span className="inline-flex items-center justify-center w-5 h-5 bg-yellow-500 text-white text-xs rounded-full font-bold">
              {pendingCount}
            </span>
            Pending Approvals
          </button>
        )}
      </div>

      {/* Pending approvals banner */}
      {filter !== 'pending' && pendingCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <div className="text-2xl">⏳</div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900">
              {pendingCount} resident{pendingCount > 1 ? 's' : ''} awaiting membership approval
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              New residents who joined with your invite code need to be approved before they gain full access.
            </p>
          </div>
          <button
            onClick={() => handleFilterChange('pending')}
            className="text-sm font-medium text-yellow-800 underline shrink-0"
          >
            Review now →
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* Filter tabs + search */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {(['all', 'pending', 'active', 'suspended'] as FilterTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => handleFilterChange(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                filter === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
              {tab === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-yellow-500 text-white text-xs rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or unit…"
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Members table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Loading members…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-medium text-gray-600">No members found</p>
          <p className="text-sm mt-1">
            {search ? 'Try a different search term.' : 'Share your invite code to add residents.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Member</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Active</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(member => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-semibold text-xs shrink-0">
                        {member.firstName[0]}{member.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{member.firstName} {member.lastName}</p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{member.unitNumber ?? <span className="text-gray-400 italic">Unassigned</span>}</td>
                  <td className="px-4 py-3"><RoleBadge role={member.role} /></td>
                  <td className="px-4 py-3"><StatusBadge status={member.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{timeSince(member.lastSeenAt)}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(member.createdAt).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {member.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setModal({ member, action: 'approve' })}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setModal({ member, action: 'suspend' })}
                              className="px-3 py-1 border border-red-300 text-red-600 rounded text-xs font-medium hover:bg-red-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {member.status === 'active' && (
                          <button
                            onClick={() => setModal({ member, action: 'suspend' })}
                            className="px-3 py-1 border border-gray-300 text-gray-600 rounded text-xs font-medium hover:bg-gray-50"
                          >
                            Suspend
                          </button>
                        )}
                        {member.status === 'suspended' && (
                          <button
                            onClick={() => setModal({ member, action: 'reinstate' })}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                          >
                            Reinstate
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action modal */}
      {modal && (
        <ActionModal
          member={modal.member}
          action={modal.action}
          onConfirm={handleAction}
          onClose={() => setModal(null)}
          loading={actionLoading}
        />
      )}
    </div>
  )
}
