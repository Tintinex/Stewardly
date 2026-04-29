'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getHoa, updateHoa, getAdminUsers, getHoaHealth, getHoaInviteCode, rotateHoaInviteCode,
  createHoaAdminUser, removeUserFromHoa, disableUser, enableUser, resetUserPassword,
  updateUserRole, updateSubscriptionTier, extendTrial,
} from '@/lib/admin-api'
import type { HoaDetail, AdminUserRecord, HoaHealth, InviteCodeData } from '@/types/admin'

const ROLES = ['homeowner', 'board_member', 'board_admin'] as const
const TIERS = ['starter', 'growth', 'pro'] as const

function Badge({ label, variant }: { label: string; variant: 'green' | 'red' | 'blue' | 'amber' | 'slate' | 'purple' }) {
  const cls = {
    green:  'bg-emerald-900/50 text-emerald-400 border border-emerald-800',
    red:    'bg-red-900/50 text-red-400 border border-red-800',
    blue:   'bg-blue-900/50 text-blue-400 border border-blue-800',
    amber:  'bg-amber-900/50 text-amber-400 border border-amber-800',
    slate:  'bg-slate-700 text-slate-300 border border-slate-600',
    purple: 'bg-purple-900/50 text-purple-400 border border-purple-800',
  }[variant]
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

function roleBadge(role: string) {
  if (role === 'board_admin')  return <Badge label="Board Admin"  variant="purple" />
  if (role === 'board_member') return <Badge label="Board Member" variant="blue" />
  return <Badge label="Homeowner" variant="slate" />
}

function statusBadge(dbStatus: string, status: 'active' | 'disabled') {
  if (dbStatus === 'inactive') return <Badge label="Removed" variant="red" />
  if (dbStatus === 'pending')  return <Badge label="Pending"  variant="amber" />
  if (status === 'disabled')   return <Badge label="Disabled" variant="red" />
  return <Badge label="Active" variant="green" />
}

type Tab = 'members' | 'health' | 'support'

export default function HoaDetailPage() {
  const { hoaId } = useParams<{ hoaId: string }>()
  const router = useRouter()

  const [hoa,        setHoa]        = useState<HoaDetail | null>(null)
  const [users,      setUsers]      = useState<AdminUserRecord[]>([])
  const [health,     setHealth]     = useState<HoaHealth | null>(null)
  const [inviteCode, setInviteCode] = useState<InviteCodeData | null>(null)
  const [tab,        setTab]        = useState<Tab>('members')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [actionMsg,  setActionMsg]  = useState<string | null>(null)
  const [busy,       setBusy]       = useState<string | null>(null)  // tracks which action is in flight

  // ── Edit HOA name ────────────────────────────────────────────────────────────
  const [editing,  setEditing]  = useState(false)
  const [editName, setEditName] = useState('')

  // ── Add board admin form ─────────────────────────────────────────────────────
  const [addAdmin, setAddAdmin] = useState(false)
  const [adminForm, setAdminForm] = useState({ email: '', firstName: '', lastName: '', phone: '' })

  const load = useCallback(async () => {
    try {
      const [h, u, hl, ic] = await Promise.all([
        getHoa(hoaId),
        getAdminUsers(hoaId),
        getHoaHealth(hoaId),
        getHoaInviteCode(hoaId),
      ])
      setHoa(h); setUsers(u); setHealth(hl); setInviteCode(ic)
      setEditName(h.name)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [hoaId])

  useEffect(() => { load() }, [load])

  function flash(msg: string) {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(null), 3000)
  }

  async function doAction(key: string, fn: () => Promise<void>, successMsg: string) {
    setBusy(key)
    try {
      await fn()
      flash(successMsg)
      await load()
    } catch (e: unknown) {
      flash(`Error: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSaveName() {
    if (!hoa || editName === hoa.name) { setEditing(false); return }
    await doAction('edit-name', async () => {
      const updated = await updateHoa(hoaId, { name: editName })
      setHoa(updated)
    }, 'Community name updated')
    setEditing(false)
  }

  async function handleRotateCode() {
    await doAction('rotate-code', async () => {
      const ic = await rotateHoaInviteCode(hoaId)
      setInviteCode(ic)
    }, 'Invite code rotated')
  }

  async function handleChangeTier(tier: string) {
    await doAction('tier', () => updateSubscriptionTier(hoaId, tier), `Subscription updated to ${tier}`)
  }

  async function handleExtendTrial(days: number) {
    await doAction('trial', () => extendTrial(hoaId, days), `Trial extended by ${days} days`)
  }

  async function handleAddAdmin() {
    if (!adminForm.email || !adminForm.firstName || !adminForm.lastName) return
    await doAction('add-admin', async () => {
      await createHoaAdminUser(hoaId, adminForm)
      setAddAdmin(false)
      setAdminForm({ email: '', firstName: '', lastName: '', phone: '' })
    }, `Board admin ${adminForm.email} created`)
  }

  async function handleDisable(u: AdminUserRecord) {
    if (!u.cognitoUsername) return
    await doAction(`disable-${u.id}`, () => disableUser(u.cognitoUsername!), `${u.firstName} disabled`)
  }

  async function handleEnable(u: AdminUserRecord) {
    if (!u.cognitoUsername) return
    await doAction(`enable-${u.id}`, () => enableUser(u.cognitoUsername!), `${u.firstName} re-enabled`)
  }

  async function handleResetPwd(u: AdminUserRecord) {
    if (!u.cognitoUsername) return
    await doAction(`reset-${u.id}`, () => resetUserPassword(u.cognitoUsername!), `Password reset email sent to ${u.email}`)
  }

  async function handleChangeRole(u: AdminUserRecord, role: string) {
    if (!u.cognitoUsername) return
    await doAction(`role-${u.id}`, () => updateUserRole(u.cognitoUsername!, role), `Role updated to ${role}`)
  }

  async function handleRemove(u: AdminUserRecord) {
    if (!confirm(`Remove ${u.firstName} ${u.lastName} from this community? This will disable their account.`)) return
    await doAction(`remove-${u.id}`, () => removeUserFromHoa(hoaId, u.id), `${u.firstName} removed from community`)
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (error)   return <div className="p-8 text-red-400">Error: {error}</div>
  if (!hoa)    return null

  const subStatus = hoa.subscriptionStatus?.toLowerCase() ?? 'none'

  return (
    <div className="p-6 space-y-5 max-w-6xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <button onClick={() => router.back()} className="hover:text-white transition-colors">← Back</button>
        <span>/</span>
        <Link href="/admin/hoas" className="hover:text-white transition-colors">Communities</Link>
        <span>/</span>
        <span className="text-white">{hoa.name}</span>
      </div>

      {/* Toast */}
      {actionMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-700 border border-slate-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {actionMsg}
        </div>
      )}

      {/* HOA Header card */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            {editing ? (
              <div className="flex items-center gap-3">
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 text-white border border-slate-600 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 w-72"
                />
                <button onClick={handleSaveName} disabled={busy === 'edit-name'}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm transition-colors disabled:opacity-50">
                  {busy === 'edit-name' ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setEditName(hoa.name) }}
                  className="text-slate-400 hover:text-white text-sm">Cancel</button>
              </div>
            ) : (
              <h1 className="text-2xl font-bold text-white">{hoa.name}</h1>
            )}
            <p className="text-slate-400 text-sm mt-1">
              {[hoa.city, hoa.state].filter(Boolean).join(', ') || 'No location set'}
              {hoa.address ? <span className="ml-2 text-slate-500">· {hoa.address}</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)}
                className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors">
                Rename
              </button>
            )}
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
              subStatus === 'active'   ? 'bg-emerald-900/60 text-emerald-400' :
              subStatus === 'trialing' || subStatus === 'trial' ? 'bg-blue-900/60 text-blue-400' :
              subStatus === 'past_due' ? 'bg-amber-900/60 text-amber-400' :
              'bg-slate-700 text-slate-400'
            }`}>
              {hoa.subscriptionTier ?? 'none'} · {hoa.subscriptionStatus ?? 'none'}
            </span>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Members',     value: hoa.userCount,               color: 'text-white' },
            { label: 'Units',       value: hoa.unitCount,               color: 'text-white' },
            { label: 'Open Tasks',  value: hoa.openTasks,               color: hoa.openTasks > 0 ? 'text-amber-400' : 'text-slate-400' },
            { label: 'Pending',     value: health?.pendingMembers ?? 0, color: (health?.pendingMembers ?? 0) > 0 ? 'text-amber-400' : 'text-slate-400' },
            { label: 'Maintenance', value: health?.openMaintenance ?? 0,color: (health?.openMaintenance ?? 0) > 0 ? 'text-orange-400' : 'text-slate-400' },
            { label: 'Documents',   value: health?.documentsCount ?? 0, color: 'text-slate-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-750 bg-slate-700/40 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {(['members', 'health', 'support'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'text-teal-400 border-b-2 border-teal-400 -mb-px'
                : 'text-slate-400 hover:text-white'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── MEMBERS TAB ──────────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Members ({users.length})</h2>
            <button onClick={() => { setTab('support'); setAddAdmin(true) }}
              className="text-xs bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-lg transition-colors">
              + Add Board Admin
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700 bg-slate-800/80">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {users.map(u => {
                  const isBusy = (k: string) => busy === `${k}-${u.id}`
                  const isInactive = u.dbStatus === 'inactive'
                  return (
                    <tr key={u.id} className={`hover:bg-slate-700/20 transition-colors ${isInactive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{u.firstName} {u.lastName}</div>
                        {u.phone && <div className="text-slate-500 text-xs">{u.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{u.email}</td>
                      <td className="px-4 py-3">{roleBadge(u.role)}</td>
                      <td className="px-4 py-3">{statusBadge(u.dbStatus, u.status)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {!isInactive && (
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {/* Change role */}
                            <select
                              value={u.role}
                              onChange={e => handleChangeRole(u, e.target.value)}
                              disabled={!!busy || !u.cognitoUsername}
                              className="text-xs bg-slate-700 text-slate-300 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                            >
                              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>

                            {/* Disable / Enable */}
                            {u.status === 'active' ? (
                              <button onClick={() => handleDisable(u)}
                                disabled={!!busy || !u.cognitoUsername}
                                className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-amber-900/50 hover:text-amber-400 text-slate-300 border border-slate-600 transition-colors disabled:opacity-50">
                                {isBusy('disable') ? '…' : 'Disable'}
                              </button>
                            ) : (
                              <button onClick={() => handleEnable(u)}
                                disabled={!!busy || !u.cognitoUsername}
                                className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-emerald-900/50 hover:text-emerald-400 text-slate-300 border border-slate-600 transition-colors disabled:opacity-50">
                                {isBusy('enable') ? '…' : 'Enable'}
                              </button>
                            )}

                            {/* Reset password */}
                            <button onClick={() => handleResetPwd(u)}
                              disabled={!!busy || !u.cognitoUsername}
                              className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-blue-900/50 hover:text-blue-400 text-slate-300 border border-slate-600 transition-colors disabled:opacity-50">
                              {isBusy('reset') ? '…' : 'Reset pwd'}
                            </button>

                            {/* Remove */}
                            <button onClick={() => handleRemove(u)}
                              disabled={!!busy}
                              className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-red-900/50 hover:text-red-400 text-slate-300 border border-slate-600 transition-colors disabled:opacity-50">
                              {isBusy('remove') ? '…' : 'Remove'}
                            </button>
                          </div>
                        )}
                        {isInactive && (
                          <span className="text-xs text-slate-600 text-right block">Removed</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No members found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── HEALTH TAB ───────────────────────────────────────────────────────── */}
      {tab === 'health' && health && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Task breakdown */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Task Health</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Open',        value: health.openTasks,       color: 'text-white' },
                { label: 'In Progress', value: health.inProgressTasks, color: 'text-blue-400' },
                { label: 'Overdue',     value: health.overdueTasks,    color: health.overdueTasks > 0 ? 'text-red-400' : 'text-slate-500' },
              ].map(s => (
                <div key={s.label} className="bg-slate-700/40 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            {health.overdueTasks > 0 && (
              <p className="mt-3 text-xs text-red-400">⚠ {health.overdueTasks} overdue task{health.overdueTasks !== 1 ? 's' : ''} need attention</p>
            )}
          </div>

          {/* Upcoming meetings */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Upcoming Meetings</h3>
            {health.upcomingMeetings.length === 0 ? (
              <p className="text-slate-500 text-sm">No upcoming meetings scheduled</p>
            ) : (
              <ul className="space-y-2">
                {health.upcomingMeetings.map(m => (
                  <li key={m.id} className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal-900/40 border border-teal-800 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-xs text-teal-400 font-bold leading-none">
                        {new Date(m.scheduledAt).toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                      <span className="text-teal-300 font-bold text-sm leading-none">
                        {new Date(m.scheduledAt).getDate()}
                      </span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{m.title}</p>
                      <p className="text-slate-400 text-xs">
                        {new Date(m.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {m.location ? ` · ${m.location}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-white mb-4">Recent Activity</h3>
            {health.recentActivity.length === 0 ? (
              <p className="text-slate-500 text-sm">No recent activity</p>
            ) : (
              <div className="space-y-1">
                {health.recentActivity.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="w-24 text-xs text-slate-500 flex-shrink-0">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                    <span className="text-slate-300">{a.action.replace(/_/g, ' ')}</span>
                    {a.ownerName && <span className="text-slate-500 text-xs ml-auto">by {a.ownerName}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUPPORT TAB ──────────────────────────────────────────────────────── */}
      {tab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Subscription management */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Subscription</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Change Tier</label>
                <div className="flex gap-2">
                  {TIERS.map(t => (
                    <button key={t} onClick={() => handleChangeTier(t)}
                      disabled={busy === 'tier' || hoa.subscriptionTier === t}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors disabled:opacity-50 ${
                        hoa.subscriptionTier === t
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Extend Trial</label>
                <div className="flex gap-2">
                  {[7, 14, 30].map(d => (
                    <button key={d} onClick={() => handleExtendTrial(d)}
                      disabled={busy === 'trial'}
                      className="flex-1 py-2 rounded-lg text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600 transition-colors disabled:opacity-50">
                      +{d}d
                    </button>
                  ))}
                </div>
              </div>
              {hoa.trialEndsAt && (
                <p className="text-xs text-slate-400">
                  Trial ends: <span className="text-white">{new Date(hoa.trialEndsAt).toLocaleDateString()}</span>
                </p>
              )}
            </div>
          </div>

          {/* Invite code */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Invite Code</h3>
            {inviteCode ? (
              <div className="space-y-3">
                <div className="bg-slate-700/50 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-2xl font-mono font-bold text-teal-400 tracking-widest">{inviteCode.code}</span>
                  <span className="text-xs text-slate-400">{inviteCode.usedCount} uses</span>
                </div>
                <button onClick={handleRotateCode} disabled={busy === 'rotate-code'}
                  className="w-full py-2 rounded-lg text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600 transition-colors disabled:opacity-50">
                  {busy === 'rotate-code' ? 'Rotating…' : 'Rotate Code'}
                </button>
                {inviteCode.expiresAt && (
                  <p className="text-xs text-slate-500">
                    Expires: {new Date(inviteCode.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-slate-500 text-sm">No active invite code</p>
                <button onClick={handleRotateCode} disabled={busy === 'rotate-code'}
                  className="w-full py-2 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50">
                  {busy === 'rotate-code' ? 'Generating…' : 'Generate Invite Code'}
                </button>
              </div>
            )}
          </div>

          {/* Add board admin */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Add Board Admin</h3>
              <button onClick={() => setAddAdmin(v => !v)}
                className="text-xs text-slate-400 hover:text-white border border-slate-600 px-3 py-1.5 rounded-lg transition-colors">
                {addAdmin ? 'Cancel' : '+ Add'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Creates a Cognito account and sends a temporary password to the specified email. The user will be added as board_admin.
            </p>
            {addAdmin && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'firstName', label: 'First name', required: true },
                  { key: 'lastName',  label: 'Last name',  required: true },
                  { key: 'email',     label: 'Email',      required: true },
                  { key: 'phone',     label: 'Phone (optional)', required: false },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                    <input
                      type={f.key === 'email' ? 'email' : 'text'}
                      value={adminForm[f.key as keyof typeof adminForm]}
                      onChange={e => setAdminForm(v => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-700 text-white border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
                      placeholder={f.label}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <button onClick={handleAddAdmin}
                    disabled={busy === 'add-admin' || !adminForm.email || !adminForm.firstName || !adminForm.lastName}
                    className="w-full sm:w-auto px-6 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    {busy === 'add-admin' ? 'Creating…' : 'Create Board Admin'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
