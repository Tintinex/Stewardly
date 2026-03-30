'use client'

import React, { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, PiggyBank, Link } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { Financials } from '@/types'
import { clsx } from 'clsx'

export default function FinancesPage() {
  const { hoaId } = useAuth()
  const [data, setData] = useState<Financials | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [plaidModalOpen, setPlaidModalOpen] = useState(false)

  useEffect(() => {
    if (!hoaId) return
    api.getFinancials(hoaId).then(setData).finally(() => setIsLoading(false))
  }, [hoaId])

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  if (!data) return null

  const ytdPercent = Math.round((data.ytdExpenses / data.totalBudget) * 100)
  const remaining = data.totalBudget - data.ytdExpenses

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finances</h1>
          <p className="text-sm text-gray-500">FY 2024 · All figures in USD</p>
        </div>
        <Button
          variant="outline"
          leftIcon={<Link className="h-4 w-4" />}
          onClick={() => setPlaidModalOpen(true)}
        >
          Connect Bank Account
        </Button>
      </div>

      {/* Top 3 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Total Budget</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            ${data.totalBudget.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Annual operating budget</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">YTD Expenses</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            ${data.ytdExpenses.toLocaleString()}
          </p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{ytdPercent}% of budget used</span>
              <span>${remaining.toLocaleString()} remaining</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  ytdPercent > 90 ? 'bg-red-500' : ytdPercent > 70 ? 'bg-gold' : 'bg-teal',
                )}
                style={{ width: `${Math.min(ytdPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Reserve Fund</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <PiggyBank className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            ${data.reserveFundBalance.toLocaleString()}
          </p>
          <p className="text-xs text-green-600 font-medium mt-1">↑ +$2,500 this month</p>
        </div>
      </div>

      {/* Budget line items + Pie chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Budget vs. Actual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="pb-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Budgeted</th>
                    <th className="pb-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actual</th>
                    <th className="pb-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.lineItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-3">
                        <div>
                          <p className="font-medium text-gray-900">{item.category}</p>
                          <p className="text-xs text-gray-400">{item.description}</p>
                        </div>
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        ${item.budgetedAmount.toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-gray-900 font-medium">
                        ${item.actualAmount.toLocaleString()}
                      </td>
                      <td className="py-3 text-right">
                        <span className={clsx(
                          'font-medium',
                          item.variance > 0 ? 'text-green-600' :
                          item.variance < 0 ? 'text-red-600' :
                          'text-gray-500',
                        )}>
                          {item.variance > 0 ? '+' : ''}{item.variance.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200">
                  <tr>
                    <td className="pt-3 font-semibold text-gray-900">Total</td>
                    <td className="pt-3 text-right font-semibold text-gray-900">
                      ${data.lineItems.reduce((s, i) => s + i.budgetedAmount, 0).toLocaleString()}
                    </td>
                    <td className="pt-3 text-right font-semibold text-gray-900">
                      ${data.lineItems.reduce((s, i) => s + i.actualAmount, 0).toLocaleString()}
                    </td>
                    <td className="pt-3 text-right font-semibold">
                      <span className="text-green-600">
                        +${data.lineItems.reduce((s, i) => s + i.variance, 0).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.expenseBreakdown}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="amount"
                  nameKey="category"
                >
                  {data.expenseBreakdown.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Legend
                  formatter={(value) => <span style={{ fontSize: 10 }}>{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Expense trend */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Expense Trend (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.expenseTrend} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="budget" name="Budget" stroke="#E8ECF4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="amount" name="Actual" stroke="#0D9E8A" strokeWidth={2.5} dot={{ r: 4, fill: '#0D9E8A' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Connected accounts + recent transactions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Connected Accounts</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setPlaidModalOpen(true)}>
                + Add Account
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.accounts.map(acct => (
                <li key={acct.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{acct.accountName}</p>
                    <p className="text-xs text-gray-500">{acct.institutionName} · {acct.accountType}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Synced {format(new Date(acct.lastSyncedAt), 'MMM d, h:mm a')}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    ${acct.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-gray-50">
              {data.recentTransactions.map(txn => (
                <li key={txn.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{txn.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="default" className="text-xs">{txn.category}</Badge>
                      <span className="text-xs text-gray-400">
                        {format(new Date(txn.date), 'MMM d')}
                      </span>
                    </div>
                  </div>
                  <span className={clsx(
                    'ml-4 text-sm font-semibold tabular-nums',
                    txn.type === 'credit' ? 'text-green-600' : 'text-gray-900',
                  )}>
                    {txn.type === 'credit' ? '+' : '-'}${Math.abs(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Plaid mock modal */}
      <Modal
        isOpen={plaidModalOpen}
        onClose={() => setPlaidModalOpen(false)}
        title="Connect Bank Account"
        size="sm"
      >
        <div className="space-y-4 text-center py-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto">
            <Link className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Plaid Integration</h3>
            <p className="text-sm text-gray-500 mt-1">
              Securely connect your HOA bank account through Plaid to automatically sync transactions and balances.
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 text-left">
            <strong>Phase 0 Note:</strong> Plaid integration is configured but not active in this prototype. Full bank connection will be available in Phase 1.
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setPlaidModalOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => setPlaidModalOpen(false)}>
              Launch Plaid (Coming Soon)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
