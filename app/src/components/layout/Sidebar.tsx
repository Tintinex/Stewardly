'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckSquare, Calendar, Users, BarChart2, MessageSquare,
  Settings, LogOut, ShieldAlert, Home, Wrench, Megaphone, FileText, UserCheck, Building2, Package, UserCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { getMembers, getPendingPackageCount } from '@/lib/api'

// ── Navigation config ─────────────────────────────────────────────────────────

const COMMON_ITEMS = [
  { href: '/dashboard/profile',  label: 'My Profile', icon: UserCircle },
  { href: '/dashboard/settings', label: 'Settings',   icon: Settings },
]

const BOARD_ITEMS = [
  { href: '/dashboard',            label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/dashboard/tasks',      label: 'Tasks',        icon: CheckSquare },
  { href: '/dashboard/meetings',   label: 'Meetings',     icon: Calendar },
  { href: '/dashboard/members',    label: 'Members',      icon: UserCheck },
  { href: '/dashboard/residents',  label: 'Residents',    icon: Users },
  { href: '/dashboard/units',      label: 'Units',        icon: Building2 },
  { href: '/dashboard/packages',   label: 'Packages',     icon: Package },
  { href: '/dashboard/finances',   label: 'Finances',     icon: BarChart2 },
  { href: '/dashboard/messages',   label: 'Messages',     icon: MessageSquare },
  { href: '/dashboard/documents',  label: 'Documents',    icon: FileText },
]

const HOMEOWNER_ITEMS = [
  { href: '/dashboard',                 label: 'Home',          icon: Home },
  { href: '/dashboard/my-unit',         label: 'My Unit',       icon: Home },
  { href: '/dashboard/packages',        label: 'Packages',      icon: Package },
  { href: '/dashboard/announcements',   label: 'Announcements', icon: Megaphone },
  { href: '/dashboard/calendar',        label: 'Calendar',      icon: Calendar },
  { href: '/dashboard/messages',        label: 'Messages',      icon: MessageSquare },
  { href: '/dashboard/documents',       label: 'Documents',     icon: FileText },
  { href: '/dashboard/finances',        label: 'Finances',      icon: BarChart2 },
  { href: '/dashboard/residents',       label: 'Residents',     icon: Users },
]

const deduped = (items: typeof BOARD_ITEMS) =>
  items.filter((item, idx, arr) => arr.findIndex(i => i.href === item.href) === idx)

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [pendingMemberCount, setPendingMemberCount] = useState(0)
  const [pendingPackageCount, setPendingPackageCount] = useState(0)

  const isBoard = user?.role === 'board_admin' || user?.role === 'board_member'

  // Poll pending members count for board admins
  useEffect(() => {
    if (!isBoard || user?.role === 'board_member') return
    const load = () => {
      getMembers('pending').then(m => setPendingMemberCount(m.length)).catch(() => {})
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [isBoard, user?.role])

  // Poll pending package count for all roles
  useEffect(() => {
    if (!user) return
    const load = () => {
      getPendingPackageCount().then(r => setPendingPackageCount(r.count)).catch(() => {})
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [user])

  const baseItems = isBoard ? BOARD_ITEMS : HOMEOWNER_ITEMS
  const navItems = deduped([...baseItems, ...COMMON_ITEMS])

  const handleSignOut = async () => {
    document.cookie = 'stewardly-admin-verified=; path=/; max-age=0; SameSite=Strict'
    await signOut()
    window.location.href = '/auth/signin'
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside className="flex h-full w-64 flex-col bg-navy text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
            <path
              d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
              stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
            />
            <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-lg font-bold tracking-tight">Stewardly</span>
      </div>

      {/* Role badge */}
      {user && (
        <div className="mx-3 mt-3 rounded-lg bg-white/5 px-3 py-1.5">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">
            {user.role === 'board_admin' ? 'Board Admin' :
             user.role === 'board_member' ? 'Board Member' : 'Resident'}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <li key={`${href}-${label}`}>
              <Link
                href={href}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-teal text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" size={18} />
                <span className="flex-1">{label}</span>
                {/* Pending badge on Members link */}
                {href === '/dashboard/members' && pendingMemberCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-yellow-400 text-gray-900 text-[10px] font-bold rounded-full">
                    {pendingMemberCount}
                  </span>
                )}
                {/* Pending package badge */}
                {href === '/dashboard/packages' && pendingPackageCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-amber-400 text-gray-900 text-[10px] font-bold rounded-full">
                    {pendingPackageCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        {/* Board admins also get a section for resident announcements */}
        {isBoard && (
          <>
            <div className="my-3 border-t border-white/10" />
            <p className="px-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">Community</p>
            <ul className="space-y-0.5">
              {[
                { href: '/dashboard/announcements', label: 'Announcements', icon: Megaphone },
                { href: '/dashboard/calendar',      label: 'Calendar',      icon: Calendar },
              ].map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive(href) ? 'bg-teal text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <Icon size={18} className="shrink-0" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* Admin Console link — superadmin only */}
      {user?.role === 'superadmin' && (
        <div className="px-3 pb-2">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-amber-300 hover:bg-white/10 transition-colors border border-amber-400/30"
          >
            <ShieldAlert size={18} className="shrink-0" />
            Admin Console
          </Link>
        </div>
      )}

      {/* User Footer */}
      {user && (
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Link
              href="/dashboard/profile"
              onClick={onClose}
              className="flex items-center gap-3 min-w-0 flex-1 group"
              title="View my profile"
            >
              <Avatar
                name={`${user.firstName} ${user.lastName}`.trim() || user.email}
                src={user.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white group-hover:text-teal transition-colors">
                  {`${user.firstName} ${user.lastName}`.trim() || user.email}
                </p>
                <p className="truncate text-xs text-white/50 capitalize">
                  {user.role.replace(/_/g, ' ')}
                </p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white transition-colors shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
