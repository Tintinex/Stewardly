'use client'

import React, { useState } from 'react'
import { Bell, ChevronDown, LogOut, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/ui/Avatar'

interface TopBarProps {
  onMenuToggle?: () => void
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, hoaId, signOut } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const notificationCount = 3

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/auth/signin'
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
      {/* Left: mobile menu + HOA name */}
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
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {user ? 'Maple Ridge HOA' : ''}
          </p>
          {hoaId && (
            <p className="hidden text-xs text-gray-400 md:block">HOA Management Portal</p>
          )}
        </div>
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
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
            >
              <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
              <span className="hidden text-sm font-medium text-gray-700 md:block">
                {user.firstName}
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
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-gray-100 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <User className="h-4 w-4 text-gray-400" />
                    My Profile
                  </button>
                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      void handleSignOut()
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
