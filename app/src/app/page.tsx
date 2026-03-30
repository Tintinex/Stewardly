'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { FullPageSpinner } from '@/components/ui/Spinner'

export default function RootPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (user) {
      router.replace('/dashboard')
    } else {
      router.replace('/auth/signin')
    }
  }, [user, isLoading, router])

  return <FullPageSpinner />
}
