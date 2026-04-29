'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { config } from '@/lib/config'
import { configureAmplify, fetchAuthSession } from '@/lib/amplify'
import * as api from '@/lib/api'
import type { AuthUser, UserRole } from '@/types'

// Configure Amplify once, client-side only (guard against SSR)
if (typeof window !== 'undefined') {
  configureAmplify()
}

interface AuthContextValue {
  user: AuthUser | null
  hoaId: string | null
  role: UserRole | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<AuthUser | null>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
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

  const loadUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      if (config.useMock) {
        // Auto-sign in as board admin in mock mode
        const u = await api.getCurrentUser()
        setUser(u)
        return u
      } else {
        const session = await fetchAuthSession()
        if (session.tokens) {
          const u = await api.getCurrentUser()
          setUser(u)
          return u
        } else {
          setUser(null)
          return null
        }
      }
    } catch {
      setUser(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthUser | null> => {
    await api.signIn(email, password)
    return loadUser()
  }, [loadUser])

  const signOut = useCallback(async () => {
    await api.signOut()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const u = await api.getCurrentUser().catch(() => null)
    if (u) setUser(u)
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
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
