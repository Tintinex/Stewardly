'use client'

import React, { useState, useRef } from 'react'
import Link from 'next/link'
import { Bell, ChevronDown, LogOut, User, Camera, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { getAvatarUploadUrl, updateMyProfile } from '@/lib/api'

interface TopBarProps {
  onMenuToggle?: () => void
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, signOut, refreshUser } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const notificationCount = 3

  const handleSignOut = async () => {
    document.cookie = 'stewardly-admin-verified=; path=/; max-age=0; SameSite=Strict'
    await signOut()
    window.location.href = '/auth/signin'
  }

  const handleAvatarClick = () => {
    setUploadError(null)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Basic validation
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Photo must be under 5 MB.')
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      // 1. Get presigned PUT URL from our API
      const { uploadUrl, avatarKey } = await getAvatarUploadUrl()

      // 2. Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'image/jpeg' },
      })
      if (!uploadRes.ok) throw new Error('Upload failed. Please try again.')

      // 3. Save the S3 key back to our DB via PATCH /api/residents/me
      await updateMyProfile({ avatarKey })

      // 4. Refresh user state so the new avatar URL is fetched
      await refreshUser()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      // Reset input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim() || user.email
    : ''
  const firstName = user?.firstName || user?.email?.split('@')[0] || ''

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
      {/* Left: mobile menu toggle (no HOA name — it's in the sidebar) */}
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        {/* HOA name from live user context */}
        {user?.hoaName && (
          <div>
            <p className="text-sm font-semibold text-gray-900">{user.hoaName}</p>
            <p className="hidden text-xs text-gray-400 md:block">HOA Management Portal</p>
          </div>
        )}
      </div>

      {/* Right: notifications + user dropdown */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label={`${notificationCount} notifications`}
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {notificationCount}
            </span>
          )}
        </button>

        {/* User dropdown */}
        {user && (
          <div className="relative">
            {/* Hidden file input for avatar upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleFileChange}
              aria-label="Upload profile photo"
            />

            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
            >
              <Avatar
                name={displayName || user.email}
                src={user.avatarUrl}
                size="sm"
              />
              <span className="hidden text-sm font-medium text-gray-700 md:block">
                {firstName}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">

                  {/* User identity header */}
                  <div className="border-b border-gray-100 px-4 py-3">
                    {/* Avatar with upload overlay */}
                    <div className="flex items-center gap-3">
                      <div className="relative group">
                        <Avatar
                          name={displayName || user.email}
                          src={user.avatarUrl}
                          size="lg"
                        />
                        <button
                          onClick={handleAvatarClick}
                          disabled={uploading}
                          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
                          title="Change photo"
                        >
                          {uploading
                            ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                            : <Camera className="h-4 w-4 text-white" />
                          }
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {displayName}
                        </p>
                        <p className="truncate text-xs text-gray-500">{user.email}</p>
                        {user.hoaName && (
                          <p className="truncate text-xs text-gray-400 mt-0.5">{user.hoaName}</p>
                        )}
                      </div>
                    </div>

                    {/* Upload feedback */}
                    {uploadError && (
                      <p className="mt-2 text-xs text-red-500">{uploadError}</p>
                    )}
                    {uploading && (
                      <p className="mt-2 text-xs text-gray-400">Uploading photo…</p>
                    )}
                  </div>

                  {/* Menu items */}
                  <Link
                    href="/dashboard/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User className="h-4 w-4 text-gray-400" />
                    My Profile
                  </Link>
                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      void handleSignOut()
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
