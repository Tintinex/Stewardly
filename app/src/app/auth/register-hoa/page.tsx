'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, User, CheckCircle, ArrowRight, ArrowLeft,
  Eye, EyeOff, Copy, Check, Sparkles,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { registerHoa } from '@/lib/api'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'hoa' | 'admin' | 'done'

interface FormState {
  // HOA details
  hoaName: string
  address: string
  city: string
  state: string
  zip: string
  unitCount: string
  // Admin user
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  confirmPassword: string
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key: 'hoa',   label: 'Your HOA',   icon: <Building2 className="h-3.5 w-3.5" /> },
    { key: 'admin', label: 'Your Account', icon: <User className="h-3.5 w-3.5" /> },
  ]
  const active = steps.findIndex(s => s.key === step)
  if (step === 'done') return null

  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              i < active  ? 'bg-teal text-white' :
              i === active ? 'bg-teal text-white ring-2 ring-teal ring-offset-2' :
              'bg-gray-200 text-gray-500'
            }`}>
              {i < active ? <CheckCircle className="h-4 w-4" /> : s.icon}
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

// ── US States ─────────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

// ── Main form ─────────────────────────────────────────────────────────────────

export default function RegisterHoaPage() {
  const { signIn: ctxSignIn } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState<Step>('hoa')
  const [form, setForm] = useState<FormState>({
    hoaName: '', address: '', city: '', state: '', zip: '', unitCount: '',
    firstName: '', lastName: '', email: '', phone: '',
    password: '', confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ hoaName: string; inviteCode: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  // ── Step 1 → 2 ──────────────────────────────────────────────────────────────
  const handleHoaStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.hoaName.trim()) { setError('HOA name is required'); return }
    setError(null)
    setStep('admin')
  }

  // ── Step 2 → submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('Please fill in all required fields'); return
    }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/[A-Z]/.test(form.password)) { setError('Password must contain at least one uppercase letter'); return }
    if (!/[0-9]/.test(form.password)) { setError('Password must contain at least one number'); return }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }

    setError(null)
    setLoading(true)
    try {
      const res = await registerHoa({
        hoaName: form.hoaName.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state || undefined,
        zip: form.zip.trim() || undefined,
        unitCount: form.unitCount ? parseInt(form.unitCount, 10) : undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      })

      // Auto-sign-in with the credentials
      await ctxSignIn(form.email.trim().toLowerCase(), form.password)

      setResult({ hoaName: res.hoa.name, inviteCode: res.inviteCode })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyInviteCode = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const goToDashboard = () => router.push('/dashboard')

  // ── Done screen ──────────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-navy p-12">
          <BrandPanel />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
          <div className="w-full max-w-sm text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-teal/10 flex items-center justify-center">
                <Sparkles className="h-10 w-10 text-teal" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{result.hoaName} is live!</h2>
              <p className="mt-2 text-gray-500 text-sm">
                Your HOA portal is ready. Share this invite code with your residents so they can join.
              </p>
            </div>

            {/* Invite code card */}
            <div className="rounded-xl border-2 border-teal/20 bg-teal/5 p-5">
              <p className="text-xs font-semibold text-teal uppercase tracking-widest mb-2">Community Invite Code</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl font-mono font-bold tracking-widest text-gray-900">
                  {result.inviteCode}
                </span>
                <button
                  onClick={copyInviteCode}
                  className="text-gray-400 hover:text-teal transition-colors"
                  title="Copy invite code"
                >
                  {copied ? <Check className="h-5 w-5 text-teal" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Residents use this code at{' '}
                <span className="font-mono text-gray-600">stewardly.biz/signup</span>
              </p>
            </div>

            <div className="space-y-3">
              <Button onClick={goToDashboard} className="w-full flex items-center justify-center gap-2">
                Go to your dashboard <ArrowRight className="h-4 w-4" />
              </Button>
              <button
                onClick={copyInviteCode}
                className="w-full py-2.5 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                {copied ? <><Check className="h-4 w-4 text-teal" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy invite code</>}
              </button>
            </div>

            <p className="text-xs text-gray-400">
              You can find this code anytime in Dashboard → Settings
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-navy p-12">
        <BrandPanel />
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
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

          {/* ── Step 1: HOA details ── */}
          {step === 'hoa' && (
            <form onSubmit={handleHoaStep} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Register your HOA</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Start your 14-day free trial — no credit card required.
                </p>
              </div>

              <Input
                label="HOA / Community Name"
                value={form.hoaName}
                onChange={set('hoaName')}
                placeholder="e.g. Green Valley Homeowners Association"
                required
                autoFocus
              />

              <Input
                label="Street Address (optional)"
                value={form.address}
                onChange={set('address')}
                placeholder="123 Main Street"
              />

              <div className="grid grid-cols-2 gap-3">
                <Input label="City" value={form.city} onChange={set('city')} placeholder="Springfield" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <select
                    value={form.state}
                    onChange={set('state')}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
                  >
                    <option value="">State</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="ZIP Code" value={form.zip} onChange={set('zip')} placeholder="62701" maxLength={10} />
                <Input label="Number of Units" type="number" min="0" value={form.unitCount} onChange={set('unitCount')} placeholder="50" />
              </div>

              <Button type="submit" className="w-full flex items-center justify-center gap-2">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link href="/auth/signin" className="font-medium text-teal hover:text-teal-600">Sign in</Link>
              </p>
              <p className="text-center text-sm text-gray-500">
                Joining an existing HOA?{' '}
                <Link href="/auth/signup" className="font-medium text-teal hover:text-teal-600">Use an invite code</Link>
              </p>
            </form>
          )}

          {/* ── Step 2: Admin account ── */}
          {step === 'admin' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-teal" />
                  <span className="text-sm font-semibold text-teal">{form.hoaName}</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Create your admin account</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  You&apos;ll be the board administrator for this HOA.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="First Name" value={form.firstName} onChange={set('firstName')} placeholder="Jane" required autoFocus />
                <Input label="Last Name" value={form.lastName} onChange={set('lastName')} placeholder="Smith" required />
              </div>
              <Input label="Email address" type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" required />
              <Input label="Phone (optional)" type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={set('password')}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    required
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Input
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                placeholder="Repeat password"
                required
              />

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setStep('hoa'); setError(null) }}
                  className="flex items-center gap-1 px-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <Button type="submit" className="flex-1" isLoading={loading}>
                  Create HOA
                </Button>
              </div>

              <p className="text-center text-xs text-gray-400">
                By registering you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Brand panel (shared between steps) ───────────────────────────────────────

function BrandPanel() {
  return (
    <>
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
          Your HOA,<br />fully managed.
        </h1>
        <p className="text-white/70 text-lg">
          Set up in minutes. Invite your residents. Run your community with confidence.
        </p>

        <div className="space-y-4">
          {[
            { stat: '14 days', label: 'Free trial — no credit card needed' },
            { stat: '2 min',   label: 'Setup time to get your portal running' },
            { stat: '500+',    label: 'HOA communities trust Stewardly' },
          ].map(({ stat, label }) => (
            <div key={label} className="flex items-center gap-4">
              <div className="text-2xl font-bold text-gold">{stat}</div>
              <div className="text-white/70 text-sm">{label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3 pt-2">
          {[
            'Member management & approvals',
            'Dues & financial tracking',
            'Meeting scheduling & minutes',
            'Community message boards',
            'Maintenance requests',
            'Document library',
          ].map(feat => (
            <div key={feat} className="flex items-center gap-2.5">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-teal/20 flex items-center justify-center">
                <CheckCircle className="h-3.5 w-3.5 text-teal" />
              </div>
              <span className="text-white/80 text-sm">{feat}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-white/30 text-xs">© 2024 Stewardly, Inc. All rights reserved.</p>
    </>
  )
}
