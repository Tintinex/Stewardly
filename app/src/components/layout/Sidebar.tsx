'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CheckSquare, Calendar, Users,
  BarChart2, MessageSquare, Settings, LogOut,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/ui/Avatar'

const navItems = [
  { href: '/dashboard',           label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/dashboard/tasks',     label: 'Tasks',      icon: CheckSquare },
  { href: '/dashboard/meetings',  label: 'Meetings',   icon: Calendar },
  { href: '/dashboard/residents', label: 'Residents',  icon: Users },
  { href: '/dashboard/finances',  label: 'Finances',   icon: BarChart2 },
  { href: '/dashboard/messages',  label: 'Messages',   icon: MessageSquare },
  { href: '/dashboard/settings',  label: 'Settings',   icon: Settings },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <li key={href}>
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
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User Footer */}
      {user && (
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs text-white/50">{user.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
