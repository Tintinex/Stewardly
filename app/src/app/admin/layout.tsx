'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { getCurrentUser } from '@/lib/api'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    getCurrentUser()
      .then(user => {
        if (user.role !== 'superadmin') {
          router.replace('/dashboard')
          return
        }
        // Set a cookie so Next.js middleware can fast-gate subsequent navigations
        document.cookie = 'stewardly-admin-verified=1; path=/; SameSite=Strict'
        setVerified(true)
      })
      .catch(() => {
        router.replace('/auth/signin?returnUrl=/admin/dashboard')
      })
  }, [router])

  if (!verified) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Verifying access…</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
