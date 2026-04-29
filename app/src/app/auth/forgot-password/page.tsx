'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowLeft, Mail, KeyRound, CheckCircle2 } from 'lucide-react'
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

type Step = 'email' | 'code' | 'done'

export default function ForgotPasswordPage() {
  const router = useRouter()

  const [step, setStep]         = useState<Step>('email')
  const [email, setEmail]       = useState('')
  const [code, setCode]         = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [showCf, setShowCf]     = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // ── Step 1 — send reset code ────────────────────────────────────────────────
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      await resetPassword({ username: email })
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2 — confirm code + new password ────────────────────────────────────
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setIsLoading(true)
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword: password })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password. Please check your code and try again.')
    } finally {
      setIsLoading(false)
    }
  }

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

        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-white leading-tight">Reset your password</h1>
          <p className="text-white/70">
            We&apos;ll send a verification code to your email address so you can create a new password.
          </p>
        </div>

        <p className="text-white/30 text-xs">© 2024 Stewardly, Inc. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
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

          {/* ── Done state ─────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-14 w-14 text-teal" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Password updated!</h2>
              <p className="text-sm text-gray-500">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <Button className="w-full mt-4" onClick={() => router.push('/auth/signin')}>
                Go to Sign In
              </Button>
            </div>
          )}

          {/* ── Step 1 — email ─────────────────────────────────────────────── */}
          {step === 'email' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/10">
                  <Mail className="h-4.5 w-4.5 text-teal" size={18} />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-3">Forgot your password?</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter your email and we&apos;ll send you a reset code.
              </p>

              <form onSubmit={handleSendCode} className="mt-8 space-y-5">
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

                <Button type="submit" className="w-full" isLoading={isLoading}>
                  Send Reset Code
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center gap-1.5 text-sm text-teal hover:text-teal-600 font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </>
          )}

          {/* ── Step 2 — code + new password ───────────────────────────────── */}
          {step === 'code' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/10">
                  <KeyRound className="h-4.5 w-4.5 text-teal" size={18} />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-3">Check your email</h2>
              <p className="mt-1 text-sm text-gray-500">
                We sent a 6-digit code to <span className="font-medium text-gray-700">{email}</span>.
                Enter it below along with your new password.
              </p>

              <form onSubmit={handleConfirm} className="mt-8 space-y-5">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Input
                  label="Verification code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  required
                />

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="new-password">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="confirm-password">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showCf ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      required
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCf(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showCf ? 'Hide password' : 'Show password'}
                    >
                      {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" isLoading={isLoading}>
                  Reset Password
                </Button>
              </form>

              <div className="mt-4 text-center space-y-2">
                <p className="text-xs text-gray-500">
                  Didn&apos;t receive the code?{' '}
                  <button
                    type="button"
                    onClick={() => { setError(null); handleSendCode({ preventDefault: () => {} } as React.FormEvent) }}
                    className="text-teal hover:text-teal-600 font-medium"
                  >
                    Resend
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setError(null) }}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Change email
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
