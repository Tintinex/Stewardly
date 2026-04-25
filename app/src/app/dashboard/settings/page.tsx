'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getHoaInviteCode, rotateHoaInviteCode, createHoaAdminUser } from '@/lib/api'
import type { HoaInviteCode, AuthUser } from '@/types'

// ─── Invite Code Card ─────────────────────────────────────────────────────────

function InviteCodeCard({ role }: { role: string }) {
  const [code, setCode]         = useState<HoaInviteCode | null>(null)
  const [loading, setLoading]   = useState(true)
  const [rotating, setRotating] = useState(false)
  const [copied, setCopied]     = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showOpts, setShowOpts] = useState(false)
  const [maxUses, setMaxUses]   = useState('')
  const [expDays, setExpDays]   = useState('')

  useEffect(() => {
    getHoaInviteCode()
      .then(setCode)
      .catch(() => setCode(null))
      .finally(() => setLoading(false))
  }, [])

  const handleCopy = () => {
    if (!code) return
    void navigator.clipboard.writeText(code.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleCopyLink = () => {
    if (!code) return
    const link = `${window.location.origin}/auth/signup?code=${code.code}`
    void navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  const handleRotate = async () => {
    if (code && !confirm('Generate a new invite code? The old code will stop working immediately.')) return
    setRotating(true)
    try {
      const opts = {
        ...(maxUses ? { maxUses: parseInt(maxUses, 10) } : {}),
        ...(expDays ? { expiresInDays: parseInt(expDays, 10) } : {}),
      }
      const newCode = await rotateHoaInviteCode(opts)
      setCode(newCode)
      setShowOpts(false)
      setMaxUses('')
      setExpDays('')
    } catch {
      alert('Failed to generate new code. Please try again.')
    } finally {
      setRotating(false)
    }
  }

  const isAdmin = role === 'board_admin'

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-12 bg-gray-100 rounded" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Invite Code</h2>
          <p className="text-sm text-gray-500 mt-0.5">Share this code with residents so they can join your HOA</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowOpts(!showOpts)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            {showOpts ? 'Hide options' : 'Options'}
          </button>
        )}
      </div>

      {code ? (
        <>
          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <span className="text-3xl font-bold font-mono tracking-widest text-indigo-700 flex-1">
              {code.code}
            </span>
            <button onClick={handleCopy}
              className="px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors">
              {copied ? '✓ Copied!' : 'Copy code'}
            </button>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-600 flex-wrap">
            <span>
              <span className="font-semibold text-gray-900">{code.usedCount}</span> used
              {code.maxUses !== null && <span className="text-gray-400"> of {code.maxUses}</span>}
            </span>
            {code.expiresAt ? (
              <span>Expires <span className="font-semibold text-gray-900">{new Date(code.expiresAt).toLocaleDateString()}</span></span>
            ) : (
              <span className="text-gray-400">No expiry</span>
            )}
            <span className={`inline-flex items-center gap-1.5 ${code.isActive ? 'text-green-600' : 'text-red-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${code.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
              {code.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <button onClick={handleCopyLink}
            className="text-sm text-indigo-600 hover:text-indigo-800 underline">
            {copiedLink ? '✓ Link copied!' : 'Copy sign-up link with code pre-filled →'}
          </button>

          {showOpts && isAdmin && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">Generate new code with options:</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Max uses (blank = unlimited)</label>
                  <input type="number" min="1" value={maxUses} onChange={e => setMaxUses(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Expires in days (blank = never)</label>
                  <input type="number" min="1" value={expDays} onChange={e => setExpDays(e.target.value)}
                    placeholder="Never"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <button onClick={handleRotate} disabled={rotating}
                className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
                {rotating ? 'Generating…' : '🔄 Generate New Code (invalidates old)'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-3">No invite code yet. Create one to start onboarding residents.</p>
          {isAdmin && (
            <button onClick={handleRotate} disabled={rotating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {rotating ? 'Creating…' : 'Create Invite Code'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Board Admin Card ─────────────────────────────────────────────────────

function AddBoardAdminCard({ user }: { user: AuthUser }) {
  const [open, setOpen]       = useState(false)
  const [form, setForm]       = useState({ email: '', firstName: '', lastName: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ password: string; name: string } | null>(null)
  const [error, setError]     = useState('')

  if (user.role !== 'board_admin') return null

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await createHoaAdminUser(user.hoaId, {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
      })
      setResult({ password: res.temporaryPassword, name: `${form.firstName} ${form.lastName}` })
      setForm({ email: '', firstName: '', lastName: '', phone: '' })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Board Members</h2>
          <p className="text-sm text-gray-500 mt-0.5">Add admins or board members who can co-manage the HOA</p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            + Add Board Admin
          </button>
        )}
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-green-900">✓ Account created for {result.name}</p>
          <p className="text-xs text-green-800">
            Temporary password: <code className="font-mono font-bold bg-green-100 px-1 rounded">{result.password}</code>
          </p>
          <p className="text-xs text-green-700">They can sign in immediately at {window.location.origin}/auth/signin</p>
          <button onClick={() => setResult(null)} className="text-xs text-green-600 underline">Dismiss</button>
        </div>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">New board admin account:</p>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">First name *</label>
              <input required value={form.firstName} onChange={set('firstName')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Last name *</label>
              <input required value={form.lastName} onChange={set('lastName')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Email *</label>
            <input required type="email" value={form.email} onChange={set('email')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Phone (optional)</label>
            <input type="tel" value={form.phone} onChange={set('phone')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => { setOpen(false); setError('') }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── How membership works ─────────────────────────────────────────────────────

function MembershipInfoCard() {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-blue-900 mb-3">How membership works</h3>
      <div className="space-y-2 text-sm text-blue-800">
        <div className="flex gap-2">
          <span className="text-blue-400 shrink-0 mt-0.5">①</span>
          <span>A resident gets your invite code (or the pre-filled sign-up link)</span>
        </div>
        <div className="flex gap-2">
          <span className="text-blue-400 shrink-0 mt-0.5">②</span>
          <span>They complete sign-up — their account is created as <strong>Pending</strong></span>
        </div>
        <div className="flex gap-2">
          <span className="text-blue-400 shrink-0 mt-0.5">③</span>
          <span>You (or another board admin) approve them on the <strong>Members</strong> page</span>
        </div>
        <div className="flex gap-2">
          <span className="text-blue-400 shrink-0 mt-0.5">④</span>
          <span>Approved residents get full access to their portal — unit info, announcements, calendar, and more</span>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    getCurrentUser().then(u => {
      if (u.role !== 'board_admin' && u.role !== 'board_member') {
        router.replace('/dashboard')
        return
      }
      setUser(u)
    }).catch(() => router.replace('/auth/signin'))
  }, [router])

  if (!user) return null

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">HOA Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your community's invite code and board access</p>
      </div>

      <InviteCodeCard role={user.role} />
      <AddBoardAdminCard user={user} />
      <MembershipInfoCard />
    </div>
  )
}
