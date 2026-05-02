'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  DollarSign, TrendingUp, PiggyBank, Plus, X, Upload, Download,
  CheckCircle, AlertCircle, Clock, Trash2, Edit2, ChevronDown,
  BarChart2, FileText, CreditCard, Users, Lightbulb, ArrowUpRight,
  ArrowDownRight, RefreshCw, Building, Filter, Search, AlertTriangle,
  Check, TrendingDown, Link, Unlink, WifiOff,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { usePlaidLink } from 'react-plaid-link'
import { useAuth } from '@/contexts/AuthContext'
import { config } from '@/lib/config'
import { getAuthToken } from '@/lib/amplify'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { clsx } from 'clsx'
import type {
  Financials, BudgetWithLineItems, Transaction, FinanceAccount,
  Assessment, AnalyticsData, PlaidItem,
} from '@/types'

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Session expired')
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((e as { message: string }).message)
  }
  return res.json() as Promise<T>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['overview', 'budget', 'transactions', 'assessments', 'accounts'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  budget: 'Budget',
  transactions: 'Transactions',
  assessments: 'Dues & Assessments',
  accounts: 'Accounts',
}

const CATEGORIES = [
  'Landscaping', 'Utilities', 'Insurance', 'Maintenance', 'Reserves',
  'Management', 'Administrative', 'Legal', 'Security', 'Amenities',
  'Capital Improvements', 'Dues Collection', 'Other',
]

const ACCOUNT_TYPES = ['checking', 'savings', 'money_market', 'other']

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
  paid:     { label: 'Paid',     cls: 'bg-green-100 text-green-700' },
  overdue:  { label: 'Overdue',  cls: 'bg-red-100   text-red-700'   },
}

const fmt$ = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const { role, isLoading: authLoading } = useAuth()
  const isBoard = role === 'board_admin' || role === 'board_member'

  const [tab, setTab] = useState<Tab>('overview')
  const [summary, setSummary] = useState<Financials | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [budget, setBudget] = useState<BudgetWithLineItems | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txnTotal, setTxnTotal] = useState(0)
  const [txnCategories, setTxnCategories] = useState<string[]>([])
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [plaidItems, setPlaidItems] = useState<PlaidItem[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ itemId: string; added: number; modified: number } | null>(null)

  // Filters
  const [txnSearch, setTxnSearch] = useState('')
  const [txnCategory, setTxnCategory] = useState('')
  const [txnType, setTxnType] = useState('')
  const [txnPage, setTxnPage] = useState(0)
  const [assessStatus, setAssessStatus] = useState('all')

  // Modals
  const [addTxnOpen, setAddTxnOpen] = useState(false)
  const [addAcctOpen, setAddAcctOpen] = useState(false)
  const [addAssessOpen, setAddAssessOpen] = useState(false)
  const [bulkAssessOpen, setBulkAssessOpen] = useState(false)
  const [budgetBuilderOpen, setBudgetBuilderOpen] = useState(false)
  const [importBudgetOpen, setImportBudgetOpen] = useState(false)
  const [importTxnOpen, setImportTxnOpen] = useState(false)
  const [editTxn, setEditTxn] = useState<Transaction | null>(null)

  const currentYear = new Date().getFullYear()

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadSummary = useCallback(async () => {
    const data = await apiFetch<Financials>('/api/finances')
    setSummary(data)
  }, [])

  const loadAnalytics = useCallback(async () => {
    const data = await apiFetch<AnalyticsData>('/api/finances/analytics')
    setAnalytics(data)
  }, [])

  const loadBudget = useCallback(async (year?: number) => {
    const data = await apiFetch<{ budget: BudgetWithLineItems | null; availableYears: number[] }>(
      `/api/finances/budget${year ? `?year=${year}` : ''}`
    )
    setBudget(data.budget)
    setAvailableYears(data.availableYears)
  }, [])

  const loadTransactions = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50', offset: String(txnPage * 50) })
    if (txnSearch) params.set('search', txnSearch)
    if (txnCategory) params.set('category', txnCategory)
    if (txnType) params.set('type', txnType)
    const data = await apiFetch<{ transactions: Transaction[]; total: number; categories: string[] }>(
      `/api/finances/transactions?${params}`
    )
    setTransactions(data.transactions)
    setTxnTotal(data.total)
    setTxnCategories(data.categories)
  }, [txnSearch, txnCategory, txnType, txnPage])

  const loadAccounts = useCallback(async () => {
    const [acctData, plaidData] = await Promise.all([
      apiFetch<{ accounts: FinanceAccount[] }>('/api/finances/accounts'),
      apiFetch<{ items: PlaidItem[] }>('/api/finances/plaid/items'),
    ])
    setAccounts(acctData.accounts)
    setPlaidItems(plaidData.items)
  }, [])

  const loadAssessments = useCallback(async () => {
    const data = await apiFetch<{ assessments: Assessment[] }>(
      `/api/finances/assessments?status=${assessStatus}`
    )
    setAssessments(data.assessments)
  }, [assessStatus])

  useEffect(() => {
    if (authLoading) return
    setLoading(true)
    Promise.all([loadSummary(), loadAnalytics()])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [authLoading, loadSummary, loadAnalytics])

  useEffect(() => {
    if (tab === 'budget') loadBudget()
    if (tab === 'transactions') loadTransactions()
    if (tab === 'accounts') loadAccounts()
    if (tab === 'assessments') loadAssessments()
  }, [tab, loadBudget, loadTransactions, loadAccounts, loadAssessments])

  useEffect(() => {
    if (tab === 'transactions') loadTransactions()
  }, [txnSearch, txnCategory, txnType, txnPage, tab, loadTransactions])

  useEffect(() => {
    if (tab === 'assessments') loadAssessments()
  }, [assessStatus, tab, loadAssessments])

  if (authLoading || loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  const ytdPercent = (summary?.totalBudget ?? 0) > 0
    ? Math.min(Math.round(((summary?.ytdExpenses ?? 0) / summary!.totalBudget) * 100), 100)
    : 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finances</h1>
          <p className="text-sm text-gray-500">FY {currentYear} · All figures in USD</p>
        </div>
        {isBoard && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />} onClick={() => setImportTxnOpen(true)}>Import CSV</Button>
            <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddTxnOpen(true)}>Add Transaction</Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                t === tab
                  ? 'border-navy text-navy'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && summary && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard icon={<DollarSign className="h-5 w-5" />} label="Annual Budget" value={fmt$(summary.totalBudget)} sub="FY operating budget" color="navy" />
            <KpiCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="YTD Expenses"
              value={fmt$(summary.ytdExpenses)}
              sub={
                <div className="mt-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>{ytdPercent}% used</span>
                    <span>{fmt$(summary.totalBudget - summary.ytdExpenses)} left</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100">
                    <div className={clsx('h-full rounded-full', ytdPercent > 90 ? 'bg-red-500' : ytdPercent > 70 ? 'bg-amber-400' : 'bg-teal')} style={{ width: `${ytdPercent}%` }} />
                  </div>
                </div>
              }
              color="teal"
            />
            <KpiCard icon={<ArrowDownRight className="h-5 w-5" />} label="YTD Income" value={fmt$(summary.ytdIncome)} sub="Dues & assessments" color="green" />
            <KpiCard icon={<PiggyBank className="h-5 w-5" />} label="Reserve Fund" value={fmt$(summary.reserveFundBalance)} sub="Savings account total" color="purple" />
          </div>

          {/* Insights */}
          {analytics && analytics.insights.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {analytics.insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          )}

          {/* Monthly trend + category pie */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>12-Month Cash Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={analytics?.monthlyTrend ?? []} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0D9E8A" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0D9E8A" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0C1F3F" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0C1F3F" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                    <Tooltip formatter={(v: number) => fmt$(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="income" name="Income" stroke="#0D9E8A" fill="url(#incomeGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#0C1F3F" fill="url(#expenseGrad)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="budget" name="Budget/mo" stroke="#F5A623" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={summary.expenseBreakdown} cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="amount" nameKey="category">
                      {summary.expenseBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt$(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Budget vs actual + top vendors */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Budget vs. Actual</CardTitle>
                  {isBoard && (
                    <Button variant="ghost" size="sm" onClick={() => { setTab('budget'); setBudgetBuilderOpen(true) }}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit Budget
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {summary.lineItems.length === 0 ? (
                  <EmptyPrompt icon={<BarChart2 className="h-8 w-8 text-gray-300" />} title="No budget set" action={isBoard ? { label: 'Create Budget', onClick: () => { setTab('budget'); setBudgetBuilderOpen(true) } } : undefined} />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        <th className="pb-2 text-left">Category</th>
                        <th className="pb-2 text-right">Budgeted</th>
                        <th className="pb-2 text-right">Actual</th>
                        <th className="pb-2 text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {summary.lineItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-2.5">
                            <p className="font-medium text-gray-900">{item.category}</p>
                            {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                          </td>
                          <td className="py-2.5 text-right text-gray-500">{fmt$(item.budgetedAmount)}</td>
                          <td className="py-2.5 text-right font-medium text-gray-900">{fmt$(item.actualAmount)}</td>
                          <td className={clsx('py-2.5 text-right font-medium', item.variance > 0 ? 'text-green-600' : item.variance < 0 ? 'text-red-600' : 'text-gray-400')}>
                            {item.variance > 0 ? '+' : ''}{fmt$(item.variance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top Vendors</CardTitle></CardHeader>
              <CardContent>
                {(analytics?.topVendors ?? []).length === 0 ? (
                  <EmptyPrompt icon={<Building className="h-8 w-8 text-gray-300" />} title="No vendor data" />
                ) : (
                  <div className="space-y-2">
                    {(analytics?.topVendors ?? []).map((v, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{v.vendor}</p>
                          <p className="text-xs text-gray-400">{v.count} transaction{v.count !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="ml-2 text-sm font-semibold text-gray-900">{fmt$(v.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent transactions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Transactions</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setTab('transactions')}>View all →</Button>
              </div>
            </CardHeader>
            <CardContent>
              <TransactionList transactions={summary.recentTransactions.slice(0, 10)} compact />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Budget Tab ───────────────────────────────────────────────────── */}
      {tab === 'budget' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Fiscal Year:</span>
              <select
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                value={budget?.fiscalYear ?? currentYear}
                onChange={e => loadBudget(parseInt(e.target.value))}
              >
                {Array.from(new Set([currentYear, currentYear + 1, ...availableYears])).sort((a, b) => b - a).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {budget?.approvedAt && (
                <Badge className="bg-green-100 text-green-700 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1 inline" />Approved {format(parseISO(budget.approvedAt), 'MMM d, yyyy')}
                </Badge>
              )}
            </div>
            {isBoard && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" leftIcon={<Upload className="h-3.5 w-3.5" />} onClick={() => setImportBudgetOpen(true)}>Import CSV</Button>
                <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setBudgetBuilderOpen(true)}>
                  {budget ? 'Edit Budget' : 'Create Budget'}
                </Button>
              </div>
            )}
          </div>

          {!budget ? (
            <Card>
              <CardContent className="py-12">
                <EmptyPrompt
                  icon={<BarChart2 className="h-12 w-12 text-gray-200" />}
                  title={`No budget for FY ${currentYear}`}
                  description="Create a budget to track spending against planned amounts. You can build it from scratch or import a CSV."
                  action={isBoard ? { label: 'Create Budget', onClick: () => setBudgetBuilderOpen(true) } : undefined}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Budget Line Items</CardTitle>
                    <div className="text-sm font-medium text-gray-900">
                      Total: {fmt$(budget.totalAmount)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        <th className="pb-2 text-left">Category</th>
                        <th className="pb-2 text-right">Budgeted</th>
                        <th className="pb-2 text-right">Actual</th>
                        <th className="pb-2 text-right">Variance</th>
                        <th className="pb-2 text-right">% Used</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {budget.lineItems.map(item => {
                        const pct = item.budgetedAmount > 0 ? Math.round((item.actualAmount / item.budgetedAmount) * 100) : 0
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="py-3">
                              <p className="font-medium text-gray-900">{item.category}</p>
                              {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                            </td>
                            <td className="py-3 text-right text-gray-500">{fmt$(item.budgetedAmount)}</td>
                            <td className="py-3 text-right font-medium text-gray-900">{fmt$(item.actualAmount)}</td>
                            <td className={clsx('py-3 text-right font-medium', item.variance > 0 ? 'text-green-600' : item.variance < 0 ? 'text-red-600' : 'text-gray-400')}>
                              {item.variance > 0 ? '+' : ''}{fmt$(item.variance)}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="h-1.5 w-16 rounded-full bg-gray-100">
                                  <div className={clsx('h-full rounded-full', pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-teal')} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200">
                      <tr>
                        <td className="pt-3 font-semibold text-gray-900">Total</td>
                        <td className="pt-3 text-right font-semibold">{fmt$(budget.lineItems.reduce((s, i) => s + i.budgetedAmount, 0))}</td>
                        <td className="pt-3 text-right font-semibold">{fmt$(budget.lineItems.reduce((s, i) => s + i.actualAmount, 0))}</td>
                        <td className={clsx('pt-3 text-right font-semibold', budget.lineItems.reduce((s, i) => s + i.variance, 0) >= 0 ? 'text-green-600' : 'text-red-600')}>
                          {fmt$(budget.lineItems.reduce((s, i) => s + i.variance, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle>Budget vs. Actual</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={budget.lineItems.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 10 }}>
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={fmtK} />
                        <YAxis type="category" dataKey="category" tick={{ fontSize: 9 }} width={80} />
                        <Tooltip formatter={(v: number) => fmt$(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="budgetedAmount" name="Budgeted" fill="#E8ECF4" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="actualAmount" name="Actual" fill="#0D9E8A" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {isBoard && !budget.approvedAt && (
                  <Button
                    className="w-full"
                    leftIcon={<CheckCircle className="h-4 w-4" />}
                    onClick={async () => {
                      await apiFetch(`/api/finances/budget/${budget.id}/approve`, { method: 'POST' })
                      loadBudget(budget.fiscalYear)
                    }}
                  >
                    Approve Budget
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Transactions Tab ─────────────────────────────────────────────── */}
      {tab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm"
                placeholder="Search description or vendor…"
                value={txnSearch}
                onChange={e => { setTxnSearch(e.target.value); setTxnPage(0) }}
              />
            </div>
            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={txnCategory} onChange={e => { setTxnCategory(e.target.value); setTxnPage(0) }}>
              <option value="">All categories</option>
              {txnCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={txnType} onChange={e => { setTxnType(e.target.value); setTxnPage(0) }}>
              <option value="">All types</option>
              <option value="debit">Expenses</option>
              <option value="credit">Income</option>
            </select>
            <Button variant="ghost" size="sm" onClick={loadTransactions}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="py-12">
                  <EmptyPrompt icon={<CreditCard className="h-10 w-10 text-gray-200" />} title="No transactions found" description="Add transactions manually or import from a CSV file." action={isBoard ? { label: 'Add Transaction', onClick: () => setAddTxnOpen(true) } : undefined} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Description</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">Account</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        {isBoard && <th className="px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {transactions.map(txn => (
                        <tr key={txn.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(parseISO(txn.date), 'MMM d, yyyy')}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{txn.description}</p>
                            {txn.vendor && <p className="text-xs text-gray-400">{txn.vendor}</p>}
                            {txn.notes && <p className="text-xs text-gray-400 italic">{txn.notes}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="bg-gray-100 text-gray-700 text-xs">{txn.category}</Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{txn.accountName ?? '—'}</td>
                          <td className={clsx('px-4 py-3 text-right font-semibold tabular-nums', txn.type === 'credit' ? 'text-green-600' : 'text-gray-900')}>
                            {txn.type === 'credit' ? '+' : '-'}{fmt$(txn.amount)}
                          </td>
                          {isBoard && (
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={() => setEditTxn(txn)}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={async () => {
                                  if (!confirm('Delete this transaction?')) return
                                  await apiFetch(`/api/finances/transactions/${txn.id}`, { method: 'DELETE' })
                                  loadTransactions()
                                  loadSummary()
                                }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {txnTotal > 50 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Showing {txnPage * 50 + 1}–{Math.min((txnPage + 1) * 50, txnTotal)} of {txnTotal}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={txnPage === 0} onClick={() => setTxnPage(p => p - 1)}>← Prev</Button>
                <Button variant="outline" size="sm" disabled={(txnPage + 1) * 50 >= txnTotal} onClick={() => setTxnPage(p => p + 1)}>Next →</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Assessments Tab ──────────────────────────────────────────────── */}
      {tab === 'assessments' && (
        <div className="space-y-4">
          {/* Summary cards */}
          {analytics && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard icon={<DollarSign className="h-5 w-5" />} label="Total Expected" value={fmt$(analytics.assessmentSummary.totalExpected)} sub="This year" color="navy" />
              <KpiCard icon={<CheckCircle className="h-5 w-5" />} label="Collected" value={fmt$(analytics.assessmentSummary.totalCollected)} sub={`${analytics.assessmentSummary.collectionRate}% rate`} color="green" />
              <KpiCard icon={<Clock className="h-5 w-5" />} label="Outstanding" value={fmt$(analytics.assessmentSummary.outstanding)} sub="Not yet paid" color="amber" />
              <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Overdue" value={String(analytics.assessmentSummary.overdueCount)} sub="Past due date" color="red" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {(['all', 'pending', 'paid', 'overdue'] as const).map(s => (
                <button key={s} onClick={() => setAssessStatus(s)} className={clsx('rounded-lg px-3 py-1.5 text-sm font-medium', assessStatus === s ? 'bg-navy text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50')}>
                  {s === 'all' ? 'All' : STATUS_BADGE[s].label}
                </button>
              ))}
            </div>
            {isBoard && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" leftIcon={<Users className="h-3.5 w-3.5" />} onClick={() => setBulkAssessOpen(true)}>Bulk Create</Button>
                <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddAssessOpen(true)}>Add Assessment</Button>
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {assessments.length === 0 ? (
                <div className="py-12">
                  <EmptyPrompt icon={<Users className="h-10 w-10 text-gray-200" />} title="No assessments found" description="Create individual assessments or use bulk create to send dues to all units." action={isBoard ? { label: 'Bulk Create Dues', onClick: () => setBulkAssessOpen(true) } : undefined} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Unit</th>
                        <th className="px-4 py-3 text-left">Owner</th>
                        <th className="px-4 py-3 text-left">Description</th>
                        <th className="px-4 py-3 text-left">Due Date</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        {isBoard && <th className="px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {assessments.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">Unit {a.unitNumber}</td>
                          <td className="px-4 py-3 text-gray-600">{a.ownerName ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{a.description}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(parseISO(a.dueDate), 'MMM d, yyyy')}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{fmt$(a.amount)}</td>
                          <td className="px-4 py-3">
                            <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[a.status].cls)}>
                              {STATUS_BADGE[a.status].label}
                            </span>
                          </td>
                          {isBoard && (
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {a.status !== 'paid' && (
                                  <button className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600" title="Mark as paid" onClick={async () => {
                                    await apiFetch(`/api/finances/assessments/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) })
                                    loadAssessments()
                                    loadAnalytics()
                                  }}>
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={async () => {
                                  if (!confirm('Delete this assessment?')) return
                                  await apiFetch(`/api/finances/assessments/${a.id}`, { method: 'DELETE' })
                                  loadAssessments()
                                }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Accounts Tab ─────────────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <div className="space-y-6">

          {/* ── Connected Institutions (Plaid) ───────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Connected Bank Accounts</CardTitle>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Link your HOA bank accounts to automatically import transactions.
                  </p>
                </div>
                {isBoard && (
                  <PlaidLinkButton
                    onSuccess={async () => {
                      await loadAccounts()
                      await loadSummary()
                    }}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {plaidItems.length === 0 ? (
                <div className="py-8 text-center">
                  <Building className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-600">No bank connections yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Connect your HOA&#39;s bank to automatically sync transactions.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {plaidItems.map(item => (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'flex h-9 w-9 items-center justify-center rounded-full',
                            item.status === 'active' ? 'bg-green-50' :
                            item.status === 'item_login_required' ? 'bg-amber-50' : 'bg-red-50',
                          )}>
                            {item.status === 'active'
                              ? <Link className="h-4 w-4 text-green-600" />
                              : item.status === 'item_login_required'
                              ? <WifiOff className="h-4 w-4 text-amber-600" />
                              : <AlertCircle className="h-4 w-4 text-red-600" />
                            }
                          </div>
                          <div>
                            <p className="font-medium text-sm text-gray-900">{item.institutionName}</p>
                            <p className="text-xs text-gray-500">
                              {item.accountCount} account{item.accountCount !== 1 ? 's' : ''}
                              {item.lastSyncedAt && (
                                <> · Last synced {format(parseISO(item.lastSyncedAt), 'MMM d, h:mm a')}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.status === 'item_login_required' && isBoard && (
                            <PlaidLinkButton
                              itemId={item.id}
                              label="Re-connect"
                              variant="outline"
                              onSuccess={async () => { await loadAccounts(); await loadSummary() }}
                            />
                          )}
                          {item.status === 'active' && isBoard && (
                            <button
                              className={clsx(
                                'flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50',
                              )}
                              disabled={syncingItemId === item.id}
                              onClick={async () => {
                                setSyncingItemId(item.id)
                                setSyncResult(null)
                                try {
                                  const res = await apiFetch<{ added: number; modified: number }>(
                                    `/api/finances/plaid/sync/${item.id}`,
                                    { method: 'POST' },
                                  )
                                  setSyncResult({ itemId: item.id, added: res.added, modified: res.modified })
                                  await loadAccounts()
                                  await loadTransactions()
                                  await loadSummary()
                                } catch (e) {
                                  alert((e as Error).message)
                                } finally {
                                  setSyncingItemId(null)
                                }
                              }}
                            >
                              {syncingItemId === item.id
                                ? <><Spinner size="sm" />&nbsp;Syncing…</>
                                : <><RefreshCw className="h-3 w-3" />Sync Now</>
                              }
                            </button>
                          )}
                          {item.status === 'active' && syncResult?.itemId === item.id && (
                            <span className="text-xs text-green-600 font-medium">
                              +{syncResult.added} new
                            </span>
                          )}
                          {isBoard && (
                            <button
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                              title="Disconnect bank"
                              onClick={async () => {
                                if (!confirm(`Disconnect ${item.institutionName}? This will not delete existing transactions.`)) return
                                try {
                                  await apiFetch(`/api/finances/plaid/items/${item.id}`, { method: 'DELETE' })
                                  loadAccounts()
                                } catch (e) { alert((e as Error).message) }
                              }}
                            >
                              <Unlink className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {item.status !== 'active' && (
                        <p className="mt-2 ml-12 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                          {item.status === 'item_login_required'
                            ? 'Your bank requires you to re-authenticate. Click Re-connect to restore access.'
                            : `Error: ${item.errorCode ?? 'Unknown error'}. Please reconnect this account.`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Account Balances ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Account Balances</h3>
              {isBoard && (
                <Button size="sm" variant="ghost" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddAcctOpen(true)}>
                  Add Manual Account
                </Button>
              )}
            </div>

            {accounts.length === 0 ? (
              <Card>
                <CardContent className="py-10">
                  <EmptyPrompt
                    icon={<CreditCard className="h-12 w-12 text-gray-200" />}
                    title="No accounts"
                    description="Connect a bank above or add a manual account to track balances."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map(acct => (
                  <Card key={acct.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 truncate">{acct.accountName}</p>
                            {acct.plaidItemId && (
                              <span title="Connected via Plaid" className="flex-shrink-0">
                                <Link className="h-3 w-3 text-green-500" />
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{acct.institutionName}</p>
                          <Badge className="mt-2 bg-gray-100 text-gray-600 text-xs capitalize">
                            {acct.accountType.replace('_', ' ')}
                          </Badge>
                        </div>
                        {isBoard && !acct.plaidItemId && (
                          <button
                            className="text-gray-400 hover:text-red-500 flex-shrink-0"
                            onClick={async () => {
                              if (!confirm('Remove this account? This will fail if it has transactions.')) return
                              try {
                                await apiFetch(`/api/finances/accounts/${acct.id}`, { method: 'DELETE' })
                                loadAccounts()
                              } catch (e) { alert((e as Error).message) }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="mt-4 text-2xl font-bold text-gray-900">{fmt$(acct.balance)}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Updated {format(parseISO(acct.lastSyncedAt), 'MMM d, h:mm a')}
                      </p>
                      {isBoard && !acct.plaidItemId && (
                        <button
                          className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                          onClick={() => {
                            const balStr = prompt('Enter new balance:', String(acct.balance))
                            const bal = parseFloat(balStr ?? '')
                            if (!isNaN(bal)) {
                              apiFetch(`/api/finances/accounts/${acct.id}`, { method: 'PATCH', body: JSON.stringify({ balance: bal }) })
                                .then(loadAccounts)
                            }
                          }}
                        >
                          <RefreshCw className="h-3 w-3 inline mr-1" />Update Balance
                        </button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════ MODALS ════════════════════════════ */}

      {/* Add Transaction */}
      <AddTransactionModal
        isOpen={addTxnOpen}
        accounts={accounts}
        onClose={() => setAddTxnOpen(false)}
        onSave={async data => {
          await apiFetch('/api/finances/transactions', { method: 'POST', body: JSON.stringify(data) })
          setAddTxnOpen(false)
          loadTransactions()
          loadSummary()
        }}
      />

      {/* Edit Transaction */}
      {editTxn && (
        <EditTransactionModal
          txn={editTxn}
          isOpen
          onClose={() => setEditTxn(null)}
          onSave={async data => {
            await apiFetch(`/api/finances/transactions/${editTxn.id}`, { method: 'PATCH', body: JSON.stringify(data) })
            setEditTxn(null)
            loadTransactions()
          }}
        />
      )}

      {/* Import Transactions CSV */}
      <ImportCSVModal
        isOpen={importTxnOpen}
        title="Import Transactions"
        description='CSV format: Date, Description, Amount, Type (debit/credit), Category, Vendor (optional)'
        exampleCSV={`Date,Description,Amount,Type,Category,Vendor\n2025-01-15,Water Utility Bill,450.00,debit,Utilities,City Water\n2025-01-20,HOA Dues Collection,2500.00,credit,Dues,`}
        onClose={() => setImportTxnOpen(false)}
        onImport={async (csv, accountId) => {
          if (!accountId) throw new Error('Please select an account')
          return apiFetch('/api/finances/transactions/import', { method: 'POST', body: JSON.stringify({ csv, accountId }) })
        }}
        accounts={accounts}
      />

      {/* Budget Builder */}
      <BudgetBuilderModal
        isOpen={budgetBuilderOpen}
        existing={budget}
        currentYear={currentYear}
        onClose={() => setBudgetBuilderOpen(false)}
        onSave={async data => {
          await apiFetch('/api/finances/budget', { method: 'POST', body: JSON.stringify(data) })
          setBudgetBuilderOpen(false)
          loadBudget()
          loadSummary()
        }}
      />

      {/* Import Budget */}
      <ImportCSVModal
        isOpen={importBudgetOpen}
        title="Import Budget from CSV"
        description='CSV format: Category, Description (optional), Budgeted Amount'
        exampleCSV={`Category,Description,Budgeted Amount\nLandscaping,Monthly lawn care,12000\nUtilities,Water and electricity,8500\nInsurance,HOA liability coverage,6000`}
        onClose={() => setImportBudgetOpen(false)}
        onImport={async (csv) => {
          const year = budget?.fiscalYear ?? currentYear
          return apiFetch('/api/finances/budget/import', { method: 'POST', body: JSON.stringify({ csv, fiscalYear: year }) })
        }}
        onSuccess={() => { setImportBudgetOpen(false); loadBudget() }}
      />

      {/* Add Account */}
      <AddAccountModal
        isOpen={addAcctOpen}
        onClose={() => setAddAcctOpen(false)}
        onSave={async data => {
          await apiFetch('/api/finances/accounts', { method: 'POST', body: JSON.stringify(data) })
          setAddAcctOpen(false)
          loadAccounts()
        }}
      />

      {/* Add Assessment */}
      <AddAssessmentModal
        isOpen={addAssessOpen}
        onClose={() => setAddAssessOpen(false)}
        onSave={async data => {
          await apiFetch('/api/finances/assessments', { method: 'POST', body: JSON.stringify(data) })
          setAddAssessOpen(false)
          loadAssessments()
        }}
      />

      {/* Bulk Assessments */}
      <BulkAssessmentModal
        isOpen={bulkAssessOpen}
        onClose={() => setBulkAssessOpen(false)}
        onSave={async data => {
          const result = await apiFetch<{ created: number }>('/api/finances/assessments/bulk', { method: 'POST', body: JSON.stringify(data) })
          setBulkAssessOpen(false)
          loadAssessments()
          loadAnalytics()
          alert(`Created ${result.created} assessments.`)
        }}
      />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string
  sub: React.ReactNode; color: 'navy' | 'teal' | 'green' | 'amber' | 'red' | 'purple'
}) {
  const bg: Record<string, string> = {
    navy: 'bg-navy-50 text-navy', teal: 'bg-teal-50 text-teal',
    green: 'bg-green-50 text-green-600', amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600', purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', bg[color])}>{icon}</div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <div className="mt-1 text-xs text-gray-500">{sub}</div>
    </div>
  )
}

function InsightCard({ insight }: { insight: { type: 'warning' | 'success' | 'info'; title: string; message: string } }) {
  const styles: Record<string, string> = {
    warning: 'bg-amber-50 border-amber-200',
    success: 'bg-green-50 border-green-200',
    info: 'bg-blue-50 border-blue-200',
  }
  const icons: Record<string, React.ReactNode> = {
    warning: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
    success: <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />,
    info: <Lightbulb className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />,
  }
  return (
    <div className={clsx('rounded-lg border px-4 py-3 flex gap-2.5', styles[insight.type])}>
      {icons[insight.type]}
      <div>
        <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
        <p className="text-xs text-gray-600 mt-0.5">{insight.message}</p>
      </div>
    </div>
  )
}

function EmptyPrompt({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-xs">{description}</p>}
      {action && <Button size="sm" className="mt-4" onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}

function TransactionList({ transactions, compact }: { transactions: Transaction[]; compact?: boolean }) {
  if (transactions.length === 0) return <EmptyPrompt icon={<CreditCard className="h-8 w-8 text-gray-200" />} title="No transactions" />
  return (
    <ul className="divide-y divide-gray-50">
      {transactions.map(txn => (
        <li key={txn.id} className="flex items-center gap-3 py-2.5 px-1">
          <div className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', txn.type === 'credit' ? 'bg-green-50' : 'bg-gray-100')}>
            {txn.type === 'credit' ? <ArrowDownRight className="h-4 w-4 text-green-600" /> : <ArrowUpRight className="h-4 w-4 text-gray-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{txn.description}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge className="bg-gray-100 text-gray-600 text-xs py-0">{txn.category}</Badge>
              <span className="text-xs text-gray-400">{format(parseISO(txn.date), 'MMM d')}</span>
            </div>
          </div>
          <span className={clsx('text-sm font-semibold tabular-nums', txn.type === 'credit' ? 'text-green-600' : 'text-gray-900')}>
            {txn.type === 'credit' ? '+' : '-'}{fmt$(txn.amount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ─── Modal: Add Transaction ───────────────────────────────────────────────────

function AddTransactionModal({ isOpen, accounts, onClose, onSave }: {
  isOpen: boolean; accounts: FinanceAccount[]; onClose: () => void
  onSave: (data: object) => Promise<void>
}) {
  const [form, setForm] = useState({ accountId: '', amount: '', description: '', vendor: '', category: 'Other', date: new Date().toISOString().split('T')[0], type: 'debit' as 'debit' | 'credit', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Transaction" size="md">
      <div className="space-y-4">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Account *</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.accountId} onChange={e => set('accountId', e.target.value)}>
              <option value="">Select account…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type *</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="debit">Expense (Debit)</option>
              <option value="credit">Income (Credit)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount *</label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
            <Input placeholder="e.g. Monthly water bill" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
            <Input placeholder="e.g. City Water Dept" value={form.vendor} onChange={e => set('vendor', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <Input placeholder="Optional notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" isLoading={saving} onClick={async () => {
            setErr('')
            if (!form.accountId) return setErr('Account is required')
            if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Valid amount is required')
            if (!form.description.trim()) return setErr('Description is required')
            setSaving(true)
            try {
              await onSave({ ...form, amount: parseFloat(form.amount), vendor: form.vendor || undefined, notes: form.notes || undefined })
            } catch (e) {
              setErr((e as Error).message)
            } finally {
              setSaving(false)
            }
          }}>Add Transaction</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: Edit Transaction ──────────────────────────────────────────────────

function EditTransactionModal({ txn, isOpen, onClose, onSave }: {
  txn: Transaction; isOpen: boolean; onClose: () => void
  onSave: (data: object) => Promise<void>
}) {
  const [form, setForm] = useState({ description: txn.description, vendor: txn.vendor ?? '', category: txn.category, notes: txn.notes ?? '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Transaction" size="sm">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <Input value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
          <Input value={form.vendor} onChange={e => set('vendor', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" isLoading={saving} onClick={async () => {
            setSaving(true)
            try { await onSave(form) } finally { setSaving(false) }
          }}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: Import CSV ────────────────────────────────────────────────────────

function ImportCSVModal({ isOpen, title, description, exampleCSV, onClose, onImport, onSuccess, accounts }: {
  isOpen: boolean; title: string; description: string; exampleCSV: string
  onClose: () => void
  onImport: (csv: string, accountId?: string) => Promise<{ imported?: number; importedRows?: number; errors?: string[] }>
  onSuccess?: () => void
  accounts?: FinanceAccount[]
}) {
  const [csv, setCsv] = useState('')
  const [accountId, setAccountId] = useState('')
  const [result, setResult] = useState<{ imported?: number; importedRows?: number; errors?: string[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <Modal isOpen={isOpen} onClose={() => { setResult(null); setCsv(''); setErr(''); onClose() }} title={title} size="lg">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">{description}</p>
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 font-mono text-xs text-gray-600 overflow-x-auto whitespace-pre">{exampleCSV}</div>

        {accounts && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Account *</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Select account…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">Paste CSV or upload file</label>
            <button className="text-xs text-navy hover:underline" onClick={() => fileRef.current?.click()}>Upload file</button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => setCsv(ev.target?.result as string ?? '')
            reader.readAsText(file)
          }} />
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono h-32 resize-none"
            placeholder="Paste CSV content here…"
            value={csv}
            onChange={e => setCsv(e.target.value)}
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        {result && (
          <div className={clsx('rounded-lg border p-3 text-sm', (result.errors?.length ?? 0) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200')}>
            <p className="font-medium">{result.imported ?? result.importedRows ?? 0} rows imported successfully</p>
            {(result.errors?.length ?? 0) > 0 && <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">{result.errors!.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => { setResult(null); setCsv(''); setErr(''); onClose() }}>Close</Button>
          <Button className="flex-1" isLoading={saving} onClick={async () => {
            if (!csv.trim()) return setErr('Please paste or upload a CSV file')
            setSaving(true); setErr('')
            try {
              const r = await onImport(csv, accountId || undefined)
              setResult(r)
              if (onSuccess) onSuccess()
            } catch (e) {
              setErr((e as Error).message)
            } finally {
              setSaving(false)
            }
          }}>Import</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: Budget Builder ────────────────────────────────────────────────────

function BudgetBuilderModal({ isOpen, existing, currentYear, onClose, onSave }: {
  isOpen: boolean; existing: BudgetWithLineItems | null; currentYear: number
  onClose: () => void; onSave: (data: object) => Promise<void>
}) {
  type LineItem = { category: string; description: string; budgetedAmount: string }
  const defaultItems: LineItem[] = existing
    ? existing.lineItems.map(l => ({ category: l.category, description: l.description, budgetedAmount: String(l.budgetedAmount) }))
    : CATEGORIES.slice(0, 6).map(c => ({ category: c, description: '', budgetedAmount: '' }))

  const [fiscalYear, setFiscalYear] = useState(existing?.fiscalYear ?? currentYear)
  const [items, setItems] = useState<LineItem[]>(defaultItems)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const total = items.reduce((s, i) => s + (parseFloat(i.budgetedAmount) || 0), 0)

  const updateItem = (idx: number, key: keyof LineItem, val: string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: val } : item))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? 'Edit Budget' : 'Create Budget'} size="lg">
      <div className="space-y-4">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Fiscal Year:</label>
          <select className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={fiscalYear} onChange={e => setFiscalYear(parseInt(e.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="ml-auto text-sm font-semibold text-gray-900">Total: {fmt$(total)}</span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-gray-100">
              <tr className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="pb-2 text-left">Category</th>
                <th className="pb-2 text-left">Description</th>
                <th className="pb-2 text-right">Amount ($)</th>
                <th className="pb-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1.5 pr-2">
                    <select className="w-full rounded border border-gray-200 px-2 py-1 text-xs" value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input className="w-full rounded border border-gray-200 px-2 py-1 text-xs" placeholder="Optional description" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right" type="number" min="0" step="100" placeholder="0" value={item.budgetedAmount} onChange={e => updateItem(idx, 'budgetedAmount', e.target.value)} />
                  </td>
                  <td className="py-1.5">
                    <button className="text-gray-300 hover:text-red-500" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}><X className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="text-sm text-navy hover:underline flex items-center gap-1" onClick={() => setItems(p => [...p, { category: 'Other', description: '', budgetedAmount: '' }])}>
          <Plus className="h-3.5 w-3.5" /> Add line item
        </button>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" isLoading={saving} onClick={async () => {
            setErr('')
            const lineItems = items.filter(i => i.category && parseFloat(i.budgetedAmount) > 0)
            if (lineItems.length === 0) return setErr('Add at least one line item with an amount')
            setSaving(true)
            try {
              await onSave({
                fiscalYear,
                lineItems: lineItems.map(i => ({ category: i.category, description: i.description, budgetedAmount: parseFloat(i.budgetedAmount) })),
              })
            } catch (e) {
              setErr((e as Error).message)
            } finally {
              setSaving(false)
            }
          }}>Save Budget</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: Add Account ───────────────────────────────────────────────────────

function AddAccountModal({ isOpen, onClose, onSave }: {
  isOpen: boolean; onClose: () => void; onSave: (data: object) => Promise<void>
}) {
  const [form, setForm] = useState({ accountName: '', institutionName: '', accountType: 'checking', balance: '', currency: 'USD' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Bank Account" size="sm">
      <div className="space-y-3">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Account Name *</label>
          <Input placeholder="e.g. HOA Operating Account" value={form.accountName} onChange={e => set('accountName', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Institution *</label>
          <Input placeholder="e.g. Chase Bank" value={form.institutionName} onChange={e => set('institutionName', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Account Type *</label>
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={form.accountType} onChange={e => set('accountType', e.target.value)}>
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Current Balance *</label>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.balance} onChange={e => set('balance', e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" isLoading={saving} onClick={async () => {
            setErr('')
            if (!form.accountName.trim()) return setErr('Account name is required')
            if (!form.institutionName.trim()) return setErr('Institution is required')
            if (!form.balance || parseFloat(form.balance) < 0) return setErr('Balance is required')
            setSaving(true)
            try {
              await onSave({ ...form, balance: parseFloat(form.balance) })
            } catch (e) {
              setErr((e as Error).message)
            } finally {
              setSaving(false)
            }
          }}>Add Account</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: Add Assessment ────────────────────────────────────────────────────

function AddAssessmentModal({ isOpen, onClose, onSave }: {
  isOpen: boolean; onClose: () => void; onSave: (data: object) => Promise<void>
}) {
  const [form, setForm] = useState({ unitId: '', amount: '', description: 'Monthly HOA Dues', dueDate: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Assessment" size="sm">
      <div className="space-y-3">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Unit ID *</label>
          <Input placeholder="Unit UUID" value={form.unitId} onChange={e => set('unitId', e.target.value)} />
          <p className="text-xs text-gray-400 mt-0.5">Find unit IDs in the Residents section</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Amount *</label>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
          <Input value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Due Date *</label>
          <Input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" isLoading={saving} onClick={async () => {
            setErr('')
            if (!form.unitId.trim()) return setErr('Unit ID is required')
            if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Valid amount is required')
            if (!form.dueDate) return setErr('Due date is required')
            setSaving(true)
            try { await onSave({ ...form, amount: parseFloat(form.amount) }) } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
          }}>Create Assessment</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: Bulk Assessments ──────────────────────────────────────────────────

function BulkAssessmentModal({ isOpen, onClose, onSave }: {
  isOpen: boolean; onClose: () => void; onSave: (data: object) => Promise<void>
}) {
  const [method, setMethod] = useState<'fixed' | 'percentage'>('fixed')
  const [form, setForm] = useState({ amount: '', description: 'Monthly HOA Dues', dueDate: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const amountLabel = method === 'fixed' ? 'Amount per Unit *' : 'Total Assessment Amount *'
  const amountHelp = method === 'fixed'
    ? 'Each unit will receive an assessment for exactly this amount.'
    : 'Each unit\'s assessment will be calculated as: Total × (unit ownership %). Units without an ownership % set will be skipped.'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Create Assessments" size="sm">
      <div className="space-y-3">
        {/* Method selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Distribution Method</label>
          <div className="grid grid-cols-2 gap-2">
            {(['fixed', 'percentage'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={clsx(
                  'rounded-lg border px-3 py-2.5 text-xs font-medium text-left transition-colors',
                  method === m
                    ? 'border-teal bg-teal/5 text-teal'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300',
                )}
              >
                <span className="block font-semibold capitalize mb-0.5">{m === 'fixed' ? 'Fixed Amount' : 'By Ownership %'}</span>
                <span className="text-gray-400 font-normal leading-snug">
                  {m === 'fixed' ? 'Same amount for every unit' : 'Proportional to ownership share'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3 leading-relaxed">
          {amountHelp}
        </p>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{amountLabel}</label>
          <Input type="number" min="0" step="0.01" placeholder="e.g. 350.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
          <Input value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Due Date *</label>
          <Input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
          <Input placeholder="e.g. Q1 2025 dues" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" isLoading={saving} onClick={async () => {
            setErr('')
            if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Valid amount is required')
            if (!form.dueDate) return setErr('Due date is required')
            setSaving(true)
            const payload = method === 'fixed'
              ? { method: 'fixed', amount: parseFloat(form.amount), description: form.description, dueDate: form.dueDate, notes: form.notes }
              : { method: 'percentage', totalAmount: parseFloat(form.amount), description: form.description, dueDate: form.dueDate, notes: form.notes }
            try { await onSave(payload) } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
          }}>Create Assessments</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Plaid Link Button ────────────────────────────────────────────────────────
// Handles both new connections and OAuth redirect re-entry.
// OAuth flow: user selects Chase/BoA → Plaid redirects to this page with
// ?oauth_state_id=xxx → we detect it, re-init Link with receivedRedirectUri → done.

const OAUTH_STORAGE_KEY = 'plaid_link_token'

function PlaidLinkButton({
  itemId,
  label = 'Connect Bank Account',
  variant = 'primary',
  onSuccess,
}: {
  itemId?: string
  label?: string
  variant?: 'primary' | 'outline'
  onSuccess?: () => void
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [fetchingToken, setFetchingToken] = useState(false)
  const [exchanging, setExchanging] = useState(false)
  const [err, setErr] = useState('')

  // Detect OAuth return: ?oauth_state_id=xxx in the URL
  const isOAuthReturn = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('oauth_state_id')

  // On OAuth return, restore the link token from sessionStorage
  useEffect(() => {
    if (isOAuthReturn) {
      const stored = sessionStorage.getItem(OAUTH_STORAGE_KEY)
      if (stored) setLinkToken(stored)
    }
  }, [isOAuthReturn])

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    // On OAuth return, pass the full current URL back to Plaid to complete the flow
    receivedRedirectUri: isOAuthReturn ? window.location.href : undefined,
    onSuccess: async (publicToken) => {
      sessionStorage.removeItem(OAUTH_STORAGE_KEY)
      // Strip oauth params from URL without navigating
      window.history.replaceState({}, '', window.location.pathname)
      setExchanging(true)
      setLinkToken(null)
      try {
        await apiFetch('/api/finances/plaid/exchange', {
          method: 'POST',
          body: JSON.stringify({ publicToken }),
        })
        onSuccess?.()
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setExchanging(false)
      }
    },
    onExit: () => {
      if (!isOAuthReturn) setLinkToken(null)
    },
  })

  // Auto-open: new token ready OR OAuth return token restored
  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  const handleClick = async () => {
    setErr('')
    setFetchingToken(true)
    try {
      // redirectUri tells Plaid where to send the user back after OAuth login
      const redirectUri = `${window.location.origin}${window.location.pathname}`
      const payload: Record<string, string> = { redirectUri }
      if (itemId) payload.itemId = itemId
      const data = await apiFetch<{ linkToken: string }>('/api/finances/plaid/link-token', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      // Persist token so the OAuth return can restore it
      sessionStorage.setItem(OAUTH_STORAGE_KEY, data.linkToken)
      setLinkToken(data.linkToken)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setFetchingToken(false)
    }
  }

  const isLoading = fetchingToken || exchanging || (!!linkToken && !ready)

  return (
    <div>
      <Button
        size="sm"
        variant={variant}
        isLoading={isLoading}
        leftIcon={!isLoading ? <Link className="h-3.5 w-3.5" /> : undefined}
        onClick={handleClick}
      >
        {label}
      </Button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  )
}
