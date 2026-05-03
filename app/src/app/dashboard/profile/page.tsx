'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Camera, Loader2, CheckCircle2, AlertCircle, User, Phone, Mail,
  Building2, Shield, Calendar, Home, Lock, Pencil, X, Save,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { getMyFullProfile, getAvatarUploadUrl, updateMyProfile } from '@/lib/api'
import type { FullProfile } from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { clsx } from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function roleLabel(role: string) {
  return role === 'board_admin'  ? 'Board Admin'
       : role === 'board_member' ? 'Board Member'
       : role === 'homeowner'    ? 'Homeowner'
       : role === 'superadmin'   ? 'Super Admin'
       : role
}

function roleBadgeVariant(role: string): 'warning' | 'info' | 'success' | 'default' {
  return role === 'board_admin'  ? 'warning'
       : role === 'board_member' ? 'info'
       : role === 'homeowner'    ? 'success'
       : 'default'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-6 py-4">
        <Icon className="h-[18px] w-[18px] text-teal shrink-0" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function ReadField({ label, value, note }: { label: string; value?: string | null; note?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      {value
        ? <p className="text-sm font-medium text-gray-900">{value}</p>
        : <p className="text-sm italic text-gray-400">Not set</p>
      }
      {note && <p className="mt-0.5 text-xs text-gray-400">{note}</p>}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { refreshUser } = useAuth()

  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit form state
  const [editing,    setEditing]    = useState(false)
  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [phone,      setPhone]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null)

  // Avatar upload state
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const [uploading,      setUploading]      = useState(false)
  const [uploadError,    setUploadError]    = useState<string | null>(null)
  const [uploadSuccess,  setUploadSuccess]  = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    try {
      const data = await getMyFullProfile()
      setProfile(data)
      setFirstName(data.firstName)
      setLastName(data.lastName)
      setPhone(data.phone ?? '')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadProfile() }, [loadProfile])

  // ── Save edits ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setSaveResult(null)
    try {
      await updateMyProfile({
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        phone:     phone.trim() || null,
      })
      await refreshUser()
      await loadProfile()
      setEditing(false)
      setSaveResult('success')
      setTimeout(() => setSaveResult(null), 4000)
    } catch {
      setSaveResult('error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (!profile) return
    setFirstName(profile.firstName)
    setLastName(profile.lastName)
    setPhone(profile.phone ?? '')
    setEditing(false)
    setSaveResult(null)
  }

  // ── Avatar upload ─────────────────────────────────────────────────────────

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setUploadError('Please select an image file.'); return }
    if (file.size > 5 * 1024 * 1024)    { setUploadError('Photo must be under 5 MB.'); return }

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(false)
    try {
      const { uploadUrl, avatarKey } = await getAvatarUploadUrl()
      const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'image/jpeg' } })
      if (!res.ok) throw new Error('Upload failed.')
      await updateMyProfile({ avatarKey })
      await refreshUser()
      await loadProfile()
      setUploadSuccess(true)
      setTimeout(() => setUploadSuccess(false), 4000)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }
  if (!profile) return null

  const displayName  = `${profile.firstName} ${profile.lastName}`.trim() || profile.email
  const memberSince  = profile.createdAt ? format(parseISO(profile.createdAt), 'MMMM d, yyyy') : null

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your personal information and account settings</p>
      </div>

      {/* ── Hero card: avatar + identity ─────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Teal top stripe */}
        <div className="h-2 bg-gradient-to-r from-teal to-teal-400" />

        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 px-6 pt-5 pb-6">

          {/* Avatar */}
          <div className="relative group shrink-0 -mt-1">
            <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
            <Avatar name={displayName} src={profile.avatarUrl} size="xl" />
            <button
              onClick={() => { setUploadError(null); fileInputRef.current?.click() }}
              disabled={uploading}
              className={clsx(
                'absolute inset-0 flex flex-col items-center justify-center rounded-full',
                'bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity',
                'cursor-pointer disabled:cursor-wait',
              )}
              title="Change profile photo"
            >
              {uploading
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <><Camera className="h-5 w-5" /><span className="text-[10px] font-semibold mt-0.5">Change</span></>}
            </button>
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-900 truncate">{displayName}</h2>
            <p className="text-sm text-gray-500 truncate">{profile.email}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <Badge variant={roleBadgeVariant(profile.role)}>{roleLabel(profile.role)}</Badge>
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <Building2 className="h-3 w-3" />{profile.hoaName}
              </span>
              {memberSince && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Calendar className="h-3 w-3" />Since {memberSince}
                </span>
              )}
            </div>

            {/* Upload feedback */}
            {uploadError && (
              <p className="mt-2 flex items-center justify-center sm:justify-start gap-1.5 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />{uploadError}
              </p>
            )}
            {uploadSuccess && (
              <p className="mt-2 flex items-center justify-center sm:justify-start gap-1.5 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Photo updated
              </p>
            )}
          </div>

          {/* Edit / Cancel toggle */}
          <div className="shrink-0">
            {!editing ? (
              <button
                onClick={() => { setEditing(true); setSaveResult(null) }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />Edit Profile
              </button>
            ) : (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Save result banner */}
      {saveResult === 'success' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />Profile updated successfully.
        </div>
      )}
      {saveResult === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />Failed to save changes — please try again.
        </div>
      )}

      {/* ── Personal Information ─────────────────────────────────────────── */}
      <SectionCard title="Personal Information" icon={User}>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="Last name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Phone Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="(555) 000-0000"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-sm text-gray-400 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Email is managed by your account and cannot be changed here.</p>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !firstName.trim() || !lastName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ReadField label="First Name"     value={profile.firstName} />
            <ReadField label="Last Name"      value={profile.lastName} />
            <ReadField
              label="Phone Number"
              value={profile.phone}
              note={profile.phone ? undefined : 'Tap Edit Profile to add a phone number'}
            />
            <ReadField
              label="Email Address"
              value={profile.email}
              note="Managed by account provider"
            />
          </div>
        )}
      </SectionCard>

      {/* ── Account Details ──────────────────────────────────────────────── */}
      <SectionCard title="Account Details" icon={Shield}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Role</p>
            <Badge variant={roleBadgeVariant(profile.role)}>{roleLabel(profile.role)}</Badge>
            <p className="text-xs text-gray-400 mt-1.5">
              {profile.role === 'board_admin'  && 'Full access to all HOA management tools and settings.'}
              {profile.role === 'board_member' && 'Access to board management tools.'}
              {profile.role === 'homeowner'    && 'Access to the resident portal — unit info, payments, documents, and community.'}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">HOA Community</p>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy/10 shrink-0">
                <Building2 className="h-3.5 w-3.5 text-navy" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{profile.hoaName}</p>
            </div>
          </div>

          {memberSince && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Member Since</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                <p className="text-sm font-medium text-gray-900">{memberSince}</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Account ID</p>
            <p className="text-[11px] font-mono text-gray-400 truncate" title={profile.id}>{profile.id}</p>
          </div>
        </div>

        {/* Unit info */}
        {profile.unitId && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">Assigned Unit</p>
            <div className="flex items-start gap-3 rounded-xl bg-teal/5 border border-teal/20 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/10 shrink-0 mt-0.5">
                <Home className="h-4 w-4 text-teal" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Unit {profile.unitNumber}</p>
                {profile.unitAddress
                  ? <p className="text-sm text-gray-500 mt-0.5">{profile.unitAddress}</p>
                  : <p className="text-xs text-gray-400 mt-0.5">No address on file</p>
                }
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Security ─────────────────────────────────────────────────────── */}
      <SectionCard title="Security" icon={Lock}>
        <div className="space-y-0 divide-y divide-gray-100">

          <div className="flex items-center justify-between py-4 first:pt-0">
            <div>
              <p className="text-sm font-medium text-gray-900">Password</p>
              <p className="text-xs text-gray-400 mt-0.5">Use a strong, unique password to protect your account</p>
            </div>
            <a
              href={`/auth/forgot-password?email=${encodeURIComponent(profile.email)}`}
              className="shrink-0 ml-4 px-3 py-1.5 text-sm font-medium text-teal border border-teal/30 rounded-lg hover:bg-teal/5 transition-colors whitespace-nowrap"
            >
              Change Password
            </a>
          </div>

          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
              <p className="text-xs text-gray-400 mt-0.5">Add an extra layer of security to your sign-ins</p>
            </div>
            <span className="shrink-0 ml-4 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full whitespace-nowrap">
              Coming soon
            </span>
          </div>

          <div className="flex items-center justify-between py-4 last:pb-0">
            <div>
              <p className="text-sm font-medium text-gray-900">Active Sessions</p>
              <p className="text-xs text-gray-400 mt-0.5">Manage devices where you're signed in</p>
            </div>
            <span className="shrink-0 ml-4 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full whitespace-nowrap">
              Coming soon
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
          <Shield className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Your account is secured through Amazon Cognito. Password changes take effect immediately.
            If you suspect unauthorized access, change your password right away and notify your HOA administrator.
          </p>
        </div>
      </SectionCard>

    </div>
  )
}
