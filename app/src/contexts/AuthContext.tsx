'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { config } from '@/lib/config'
import * as api from '@/lib/api'
import type { AuthUser, UserRole } from '@/types'

interface AuthContextValue {
  user: AuthUser | null
  hoaId: string | null
  role: UserRole | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadUser = useCallback(async () => {
    try {
      if (config.useMock) {
        // Auto-sign in as board admin in mock mode
        const u = await api.getCurrentUser()
        setUser(u)
      } else {
        const { fetchAuthSession } = await import('aws-amplify/auth')
        const session = await fetchAuthSession()
        if (session.tokens) {
          const u = await api.getCurrentUser()
          setUser(u)
        } else {
          setUser(null)
        }
      }
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  const signIn = useCallback(async (email: string, password: string) => {
    await api.signIn(email, password)
    await loadUser()
  }, [loadUser])

  const signOut = useCallback(async () => {
    await api.signOut()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        hoaId: user?.hoaId ?? null,
        role: user?.role ?? null,
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
