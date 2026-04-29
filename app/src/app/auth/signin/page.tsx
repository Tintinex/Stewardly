'use client'

import React, { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// Inner component uses useSearchParams — must be inside <Suspense>
function SignInForm() {
  const { signIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getRedirectPath(role: string): string {
    // If middleware set a returnUrl (e.g., tried to access /admin/...), honour it
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl && returnUrl.startsWith('/')) return returnUrl
    // Route by role
    if (role === 'superadmin') return '/admin/dashboard'
    return '/dashboard'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const loggedInUser = await signIn(email, password)
      // Set the middleware cookie BEFORE navigating to /admin/* — the middleware
      // checks this cookie to gate the route, and AdminLayout hasn't rendered yet
      // to set it, so we'd loop back to sign-in without this.
      if (loggedInUser?.role === 'superadmin') {
        document.cookie = 'stewardly-admin-verified=1; path=/; SameSite=Strict'
      }
      router.push(getRedirectPath(loggedInUser?.role ?? 'homeowner'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Mobile logo */}
      <div className="mb-8 flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
            <path
              d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
              stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
            />
            <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-lg font-bold text-navy">Stewardly</span>
      </div>

      <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
      <p className="mt-1 text-sm text-gray-500">Sign in to your HOA management portal</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" className="rounded border-gray-300 text-teal focus:ring-teal" />
            Remember me
          </label>
          <Link href="/auth/forgot-password" className="text-sm text-teal hover:text-teal-600 font-medium">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Sign In
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Joining your community?{' '}
        <Link href="/auth/signup" className="font-medium text-teal hover:text-teal-600">
          Sign up with invite code
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        Starting a new HOA?{' '}
        <Link href="/auth/register-hoa" className="font-medium text-teal hover:text-teal-600">
          Register your HOA
        </Link>
      </p>
    </div>
  )
}

// Exported page wraps the form in Suspense — required by Next.js 14 when
// a client component calls useSearchParams() (needed for ?returnUrl= support).
export default function SignInPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-navy p-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
              <path
                d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
                stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
              />
              <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Stewardly</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Manage your HOA with confidence
          </h1>
          <p className="text-white/70 text-lg">
            Streamline dues collection, meeting management, and resident communications — all in one place.
          </p>

          <div className="space-y-4">
            {[
              { stat: '96%', label: 'Average dues collection rate' },
              { stat: '3x',  label: 'Faster meeting preparation' },
              { stat: '500+', label: 'HOAs trust Stewardly' },
            ].map(({ stat, label }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="text-2xl font-bold text-gold">{stat}</div>
                <div className="text-white/70 text-sm">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/30 text-xs">© 2024 Stewardly, Inc. All rights reserved.</p>
      </div>

      {/* Right sign-in form — wrapped in Suspense for useSearchParams() */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
        <Suspense fallback={<div className="w-full max-w-sm h-64 animate-pulse bg-gray-100 rounded-lg" />}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
