'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import {
  LayoutDashboard, Building2, Users, CreditCard,
  BarChart2, Activity, Server, LogOut,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/ui/Avatar'

const navItems = [
  { href: '/admin/dashboard',     label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/admin/hoas',          label: 'Communities',    icon: Building2 },
  { href: '/admin/users',         label: 'Users',          icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions',  icon: CreditCard },
  { href: '/admin/stats',         label: 'Statistics',     icon: BarChart2 },
  { href: '/admin/activity',      label: 'Activity Log',   icon: Activity },
  { href: '/admin/monitoring',    label: 'Monitoring',     icon: Server },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    // Clear the admin-verified cookie so middleware doesn't grant re-entry
    document.cookie = 'stewardly-admin-verified=; path=/; max-age=0; SameSite=Strict'
    await signOut()
    window.location.href = '/auth/signin'
  }

  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim() || user.email
    : 'Admin'

  return (
    <aside className="w-56 min-h-screen bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Stewardly</div>
        <div className="text-base font-bold text-white">Admin Console</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-teal-600/20 text-teal-400 border border-teal-600/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 mb-1">
          <Avatar
            name={displayName}
            src={user?.avatarUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-200">{displayName}</p>
            <p className="truncate text-[10px] text-slate-500">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => void handleSignOut()}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
