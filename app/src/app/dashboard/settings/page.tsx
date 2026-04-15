'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import * as api from '@/lib/api'
import type { User } from '@/types'

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-4 py-4 border-b border-gray-100 last:border-0">
      <div>
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  )
}

function Input({ value, onChange, disabled, placeholder, type = 'text' }: {
  value: string; onChange?: (v: string) => void; disabled?: boolean; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-gray-50 disabled:text-gray-400"
    />
  )
}

function SaveButton({ onClick, saving, disabled }: { onClick: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className="mt-4 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
    >
      {saving ? 'Saving…' : 'Save Changes'}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${checked ? 'bg-teal' : 'bg-gray-200'}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, hoaId } = useAuth()
  const isAdmin = user?.role === 'board_admin'

  // Profile state
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [phone, setPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)

  // HOA state (board_admin only)
  const [hoaName, setHoaName] = useState('')
  const [hoaAddress, setHoaAddress] = useState('')
  const [hoaCity, setHoaCity] = useState('')
  const [hoaState, setHoaState] = useState('')
  const [hoaZip, setHoaZip] = useState('')
  const [hoaTimezone, setHoaTimezone] = useState('America/New_York')
  const [savingHoa, setSavingHoa] = useState(false)
  const [hoaMsg, setHoaMsg] = useState<string | null>(null)

  // Notification prefs
  const [notifyTasks, setNotifyTasks] = useState(true)
  const [notifyMeetings, setNotifyMeetings] = useState(true)
  const [notifyMessages, setNotifyMessages] = useState(false)
  const [notifyFinances, setNotifyFinances] = useState(true)
  const [savingNotifs, setSavingNotifs] = useState(false)

  // Members list (board_admin only)
  const [members, setMembers] = useState<User[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  useEffect(() => {
    if (!hoaId) return

    // Load HOA details for admin
    if (isAdmin) {
      api.getResidents(hoaId).then(residents => {
        setMembers(residents)
      }).catch(console.error).finally(() => setLoadingMembers(false))
    }

    // Load notification preferences from localStorage (no backend yet)
    try {
      const prefs = JSON.parse(localStorage.getItem('stewardly-notif-prefs') ?? '{}')
      if (prefs.tasks !== undefined) setNotifyTasks(prefs.tasks)
      if (prefs.meetings !== undefined) setNotifyMeetings(prefs.meetings)
      if (prefs.messages !== undefined) setNotifyMessages(prefs.messages)
      if (prefs.finances !== undefined) setNotifyFinances(prefs.finances)
    } catch {}
  }, [hoaId, isAdmin])

  async function saveProfile() {
    if (!hoaId || !user) return
    setSavingProfile(true)
    setProfileMsg(null)
    try {
      await api.updateResident(hoaId, user.id, { firstName, lastName })
      setProfileMsg('Profile saved.')
    } catch (e: unknown) {
      setProfileMsg(`Error: ${(e as Error).message}`)
    } finally {
      setSavingProfile(false)
    }
  }

  function saveNotifications() {
    setSavingNotifs(true)
    localStorage.setItem('stewardly-notif-prefs', JSON.stringify({
      tasks: notifyTasks, meetings: notifyMeetings,
      messages: notifyMessages, finances: notifyFinances,
    }))
    setTimeout(() => setSavingNotifs(false), 600)
  }

  async function changeRole(residentId: string, newRole: 'board_admin' | 'board_member' | 'homeowner') {
    if (!hoaId) return
    await api.updateResident(hoaId, residentId, { role: newRole })
    setMembers(prev => prev.map(m => m.id === residentId ? { ...m, role: newRole } : m))
  }

  const TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your profile, HOA configuration, and preferences</p>
      </div>

      {/* ── Profile ──────────────────────────────────────────────────────── */}
      <Section title="Your Profile" description="Update your personal information">
        <Field label="First Name">
          <Input value={firstName} onChange={setFirstName} />
        </Field>
        <Field label="Last Name">
          <Input value={lastName} onChange={setLastName} />
        </Field>
        <Field label="Email" hint="Managed by your HOA admin">
          <Input value={user?.email ?? ''} disabled />
        </Field>
        <Field label="Phone" hint="Optional — for urgent HOA communications">
          <Input value={phone} onChange={setPhone} placeholder="(555) 000-0000" type="tel" />
        </Field>
        <Field label="Role">
          <div className="inline-flex px-2.5 py-1 rounded-full bg-navy/10 text-navy text-xs font-medium capitalize">
            {user?.role?.replace('_', ' ')}
          </div>
        </Field>
        {profileMsg && (
          <p className={`text-sm mt-2 ${profileMsg.startsWith('Error') ? 'text-red-500' : 'text-teal'}`}>
            {profileMsg}
          </p>
        )}
        <SaveButton onClick={saveProfile} saving={savingProfile} />
      </Section>

      {/* ── HOA Configuration (admin only) ───────────────────────────────── */}
      {isAdmin && (
        <Section title="HOA Configuration" description="Update your community details. Changes are visible to all members.">
          <Field label="Community Name">
            <Input value={hoaName} onChange={setHoaName} placeholder="Maple Ridge HOA" />
          </Field>
          <Field label="Address">
            <Input value={hoaAddress} onChange={setHoaAddress} placeholder="100 Main Street" />
          </Field>
          <Field label="City">
            <Input value={hoaCity} onChange={setHoaCity} placeholder="Raleigh" />
          </Field>
          <Field label="State">
            <Input value={hoaState} onChange={setHoaState} placeholder="NC" />
          </Field>
          <Field label="ZIP Code">
            <Input value={hoaZip} onChange={setHoaZip} placeholder="27609" />
          </Field>
          <Field label="Timezone">
            <select
              value={hoaTimezone}
              onChange={e => setHoaTimezone(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
              ))}
            </select>
          </Field>
          {hoaMsg && (
            <p className={`text-sm mt-2 ${hoaMsg.startsWith('Error') ? 'text-red-500' : 'text-teal'}`}>
              {hoaMsg}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-4">
            Note: HOA name and address updates require a backend migration to be wired up. Contact your platform administrator.
          </p>
        </Section>
      )}

      {/* ── Member Management (admin only) ───────────────────────────────── */}
      {isAdmin && (
        <Section title="Member Roles" description="Adjust roles for your community members. Board admins can manage the full HOA.">
          {loadingMembers
            ? <div className="flex justify-center py-8"><Spinner /></div>
            : (
              <div className="divide-y divide-gray-100">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-gray-400">{member.email}</p>
                    </div>
                    {member.id === user?.id
                      ? (
                        <span className="text-xs text-gray-400 italic">You</span>
                      )
                      : (
                        <select
                          value={member.role}
                          onChange={e => changeRole(member.id, e.target.value as 'board_admin' | 'board_member' | 'homeowner')}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal"
                        >
                          <option value="homeowner">Homeowner</option>
                          <option value="board_member">Board Member</option>
                          <option value="board_admin">Board Admin</option>
                        </select>
                      )
                    }
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">No members found</p>
                )}
              </div>
            )
          }
        </Section>
      )}

      {/* ── Notification Preferences ─────────────────────────────────────── */}
      <Section title="Notification Preferences" description="Choose what activity sends you an email digest.">
        <div className="space-y-4">
          <Toggle checked={notifyTasks} onChange={setNotifyTasks} label="Task assignments and status changes" />
          <Toggle checked={notifyMeetings} onChange={setNotifyMeetings} label="Upcoming meetings and agenda updates" />
          <Toggle checked={notifyMessages} onChange={setNotifyMessages} label="New community board posts" />
          <Toggle checked={notifyFinances} onChange={setNotifyFinances} label="Financial reports and budget alerts" />
        </div>
        <SaveButton onClick={saveNotifications} saving={savingNotifs} />
      </Section>

      {/* ── Subscription ─────────────────────────────────────────────────── */}
      <Section title="Subscription" description="Your current plan and billing information.">
        <Field label="Current Plan">
          <span className="inline-flex px-2.5 py-1 rounded-full bg-teal/10 text-teal text-xs font-semibold uppercase tracking-wide">
            Growth
          </span>
        </Field>
        <Field label="Status">
          <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
            Trial
          </span>
        </Field>
        <Field label="Billing">
          <p className="text-sm text-gray-500">
            To upgrade your plan or manage billing, contact{' '}
            <a href="mailto:billing@stewardly.biz" className="text-teal hover:underline">
              billing@stewardly.biz
            </a>
          </p>
        </Field>
      </Section>

      {/* ── Danger Zone (admin only) ─────────────────────────────────────── */}
      {isAdmin && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Danger Zone</CardTitle>
            <CardDescription>These actions are irreversible. Proceed with caution.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-3 border-b border-red-100">
              <div>
                <p className="text-sm font-medium text-gray-900">Export All Data</p>
                <p className="text-xs text-gray-400">Download a full CSV export of all HOA data</p>
              </div>
              <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Export
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-red-700">Delete Community</p>
                <p className="text-xs text-gray-400">Permanently delete this HOA and all its data</p>
              </div>
              <button
                onClick={() => alert('Please contact support@stewardly.biz to delete your community.')}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
