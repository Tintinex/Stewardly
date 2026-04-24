'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import {
  LayoutDashboard, Building2, Users, CreditCard,
  BarChart2, Activity, Server, ArrowLeft,
} from 'lucide-react'

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

      {/* Back to app */}
      <div className="px-4 py-4 border-t border-slate-800">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to App
        </Link>
      </div>
    </aside>
  )
}
