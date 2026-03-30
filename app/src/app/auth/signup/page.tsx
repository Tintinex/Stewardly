'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { config } from '@/lib/config'

type SignupMode = 'new_hoa' | 'existing_hoa'

export default function SignUpPage() {
  const router = useRouter()
  const [mode, setMode] = useState<SignupMode>('new_hoa')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hoaName, setHoaName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      if (config.useMock) {
        // Mock mode: just redirect to dashboard
        await new Promise(resolve => setTimeout(resolve, 400))
        router.push('/dashboard')
        return
      }

      const { signUp } = await import('aws-amplify/auth')
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: firstName,
            family_name: lastName,
          },
        },
      })
      // Redirect to confirm page or dashboard
      router.push('/auth/signin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
              <path
                d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
                stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
              />
              <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-xl font-bold text-navy">Stewardly</span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Create your account</h2>
          <p className="mt-1 text-sm text-gray-500">Get started with Stewardly in minutes</p>

          {/* Mode toggle */}
          <div className="mt-5 flex rounded-lg border border-gray-200 p-1 gap-1">
            <button
              type="button"
              onClick={() => setMode('new_hoa')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'new_hoa'
                  ? 'bg-navy text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              New HOA
            </button>
            <button
              type="button"
              onClick={() => setMode('existing_hoa')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'existing_hoa'
                  ? 'bg-navy text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Join Existing HOA
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Jane"
                required
              />
              <Input
                label="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                required
              />
            </div>

            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              required
              helperText="Must include uppercase, number, and symbol"
            />

            {mode === 'new_hoa' ? (
              <Input
                label="HOA Name"
                value={hoaName}
                onChange={e => setHoaName(e.target.value)}
                placeholder="e.g., Maple Ridge HOA"
                required
              />
            ) : (
              <Input
                label="Invite Code"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="Enter code from your board"
                required
                helperText="Contact your board president if you need an invite code"
              />
            )}

            <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
              {mode === 'new_hoa' ? 'Create Account & HOA' : 'Join HOA'}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-400">
            By creating an account, you agree to our{' '}
            <button type="button" className="text-teal hover:underline">Terms of Service</button>{' '}
            and{' '}
            <button type="button" className="text-teal hover:underline">Privacy Policy</button>.
          </p>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/auth/signin" className="font-medium text-teal hover:text-teal-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
