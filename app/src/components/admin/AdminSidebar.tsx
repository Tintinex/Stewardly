'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const navItems = [
  { href: '/admin/hoas',       label: 'HOAs',       icon: '🏘️' },
  { href: '/admin/users',      label: 'Users',      icon: '👥' },
  { href: '/admin/stats',      label: 'Statistics', icon: '📊' },
  { href: '/admin/monitoring', label: 'Monitoring', icon: '🔍' },
  { href: '/admin/billing',    label: 'Billing',    icon: '💳' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Stewardly</div>
        <div className="text-lg font-bold text-white">Admin Console</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white',
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          ← Back to App
        </Link>
      </div>
    </aside>
  )
}
