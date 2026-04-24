'use client'

import React, { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, CheckCircle, Mail, ArrowRight, ArrowLeft, Building2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { validateInviteCode, ensureOwner } from '@/lib/api'
import { amplifySignIn } from '@/lib/amplify'
import { signUp as amplifySignUp, confirmSignUp } from 'aws-amplify/auth'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'invite' | 'details' | 'confirm' | 'done'

interface FormState {
  inviteCode: string
  hoaId: string
  hoaName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  unitNumber: string
  password: string
  confirmPassword: string
  confirmationCode: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'invite',  label: 'Community' },
    { key: 'details', label: 'Your Info' },
    { key: 'confirm', label: 'Confirm' },
  ]
  const active = steps.findIndex(s => s.key === step)
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < active ? 'bg-teal text-white' :
              i === active ? 'bg-teal text-white ring-2 ring-teal ring-offset-2' :
              'bg-gray-200 text-gray-500'
            }`}>
              {i < active ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm ${i === active ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px ${i < active ? 'bg-teal' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ── Inner component (uses useSearchParams) ────────────────────────────────────

function SignUpForm() {
  const { signIn: ctxSignIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<Step>('invite')
  const [form, setForm] = useState<FormState>({
    inviteCode: searchParams.get('invite') ?? '',
    hoaId: '',
    hoaName: '',
    firstName: '', lastName: '', email: '',
    phone: '', unitNumber: '',
    password: '', confirmPassword: '',
    confirmationCode: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  // ── Step 1: validate invite code ─────────────────────────────────────────
  const handleValidateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.inviteCode.trim()) { setError('Please enter your community invite code'); return }
    setError(null)
    setLoading(true)
    try {
      const result = await validateInviteCode(form.inviteCode.trim().toUpperCase())
      if (!result.valid) {
        setError(result.message ?? 'Invalid or expired invite code. Ask your board admin for a new one.')
        return
      }
      setForm(f => ({ ...f, hoaId: result.hoaId ?? '', hoaName: result.hoaName ?? '' }))
      setStep('details')
    } catch {
      setError('Could not verify the invite code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: create Cognito account ───────────────────────────────────────
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('Please fill in all required fields'); return
    }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    setError(null)
    setLoading(true)
    try {
      await amplifySignUp({
        username: form.email.toLowerCase(),
        password: form.password,
        options: {
          userAttributes: {
            email: form.email.toLowerCase(),
            given_name: form.firstName,
            family_name: form.lastName,
            'custom:hoaId': form.hoaId,
            'custom:role': 'homeowner',
            'custom:unitId': '',
          },
        },
      })
      setStep('confirm')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-up failed'
      if (msg.includes('UsernameExistsException') || msg.toLowerCase().includes('already exists')) {
        setError('An account with this email already exists. Try signing in instead.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: confirm email ────────────────────────────────────────────────
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.confirmationCode.trim()) { setError('Please enter the confirmation code'); return }
    setError(null)
    setLoading(true)
    try {
      await confirmSignUp({ username: form.email.toLowerCase(), confirmationCode: form.confirmationCode.trim() })

      // Auto sign-in after confirmation using the AuthContext path (creates DB record, sets user state)
      await ctxSignIn(form.email.toLowerCase(), form.password)

      // Create the owner record in DB from JWT claims
      try {
        await ensureOwner({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email.toLowerCase(),
          phone: form.phone || undefined,
          unitNumber: form.unitNumber || undefined,
        })
      } catch {
        // Non-fatal: owner record will be created lazily on first API call
        console.warn('ensureOwner failed on sign-up — will retry on first API call')
      }

      setStep('done')
      setTimeout(() => { router.push('/dashboard') }, 1800)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed'
      if (msg.toLowerCase().includes('codemismatch') || msg.toLowerCase().includes('invalid verification')) {
        setError('That code is incorrect. Please check your email and try again.')
      } else if (msg.toLowerCase().includes('expiredcode')) {
        setError('The code has expired. Please request a new one.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-teal/10 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-teal" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Welcome to {form.hoaName}!</h2>
        <p className="text-gray-500">Your account is set up. Taking you to your portal…</p>
        <div className="flex justify-center">
          <div className="h-1 w-24 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-teal animate-[grow_1.8s_linear_forwards]" style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      {/* Mobile logo */}
      <div className="mb-6 flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
            <path d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-lg font-bold text-navy">Stewardly</span>
      </div>

      <StepIndicator step={step} />

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Step 1: Invite code ── */}
      {step === 'invite' && (
        <form onSubmit={handleValidateInvite} className="space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Join your community</h2>
            <p className="mt-1 text-sm text-gray-500">
              Enter the invite code from your HOA board admin to get started
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Community Invite Code</label>
            <input
              type="text"
              value={form.inviteCode}
              onChange={set('inviteCode')}
              placeholder="e.g. GREENWD4"
              autoFocus
              required
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-center text-lg tracking-widest font-mono uppercase text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <Button type="submit" className="w-full flex items-center justify-center gap-2" isLoading={loading}>
            Verify Code <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/auth/signin" className="font-medium text-teal hover:text-teal-600">Sign in</Link>
          </p>
        </form>
      )}

      {/* ── Step 2: Personal details ── */}
      {step === 'details' && (
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-teal" />
              <span className="text-sm font-semibold text-teal">{form.hoaName}</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
            <p className="mt-0.5 text-sm text-gray-500">Tell us a bit about yourself</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={form.firstName} onChange={set('firstName')} placeholder="Jane" required autoFocus />
            <Input label="Last Name" value={form.lastName} onChange={set('lastName')} placeholder="Smith" required />
          </div>
          <Input label="Email address" type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unit Number" value={form.unitNumber} onChange={set('unitNumber')} placeholder="101" />
            <Input label="Phone (optional)" type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="At least 8 characters"
                required
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Input label="Confirm Password" type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Repeat password" required />

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setStep('invite'); setError(null) }}
              className="flex items-center gap-1 px-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <Button type="submit" className="flex-1" isLoading={loading}>
              Create Account
            </Button>
          </div>
        </form>
      )}

      {/* ── Step 3: Confirm email ── */}
      {step === 'confirm' && (
        <form onSubmit={handleConfirm} className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal/10">
              <Mail className="h-5 w-5 text-teal" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Check your email</h2>
              <p className="mt-1 text-sm text-gray-500">
                We sent a 6-digit code to <strong className="text-gray-700">{form.email}</strong>
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Code</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.confirmationCode}
              onChange={set('confirmationCode')}
              placeholder="123456"
              autoFocus
              required
              maxLength={6}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <Button type="submit" className="w-full" isLoading={loading}>
            Confirm & Sign In
          </Button>
          <p className="text-center text-xs text-gray-400">
            Didn&apos;t receive the email? Check your spam folder, or{' '}
            <button type="button" className="underline hover:text-gray-600" onClick={() => setStep('details')}>
              go back and re-enter your email
            </button>
          </p>
        </form>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-navy p-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
              <path d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Stewardly</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Your community,<br />at your fingertips
          </h1>
          <p className="text-white/70 text-lg">
            Stay informed on HOA announcements, track your dues, attend meetings, and connect with your neighbors — all in one place.
          </p>
          <div className="space-y-4">
            {[
              { stat: '2 min', label: 'Setup time with your invite code' },
              { stat: '24/7',  label: 'Access to community info & documents' },
              { stat: '100%',  label: 'Free for residents' },
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

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
        <Suspense fallback={<div className="w-full max-w-sm h-64 animate-pulse bg-gray-100 rounded-lg" />}>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  )
}
