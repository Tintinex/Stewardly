'use client'

import { useEffect, useState } from 'react'
import { getPlatformCosts } from '@/lib/admin-api'
import type { PlatformCosts, CostLineItem } from '@/types/admin'
import { AlertTriangle, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`
}

function shortMonth(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

const CATEGORY_ORDER = [
  'Compute', 'Database', 'Storage', 'Networking',
  'Observability', 'Identity', 'Security', 'DNS & CDN', 'Messaging',
  'AI APIs', 'External APIs', 'Hosting', 'Other AWS',
]

const CATEGORY_COLOR: Record<string, string> = {
  Compute:       'bg-blue-500',
  Database:      'bg-violet-500',
  Storage:       'bg-amber-500',
  Networking:    'bg-cyan-500',
  Observability: 'bg-emerald-500',
  Identity:      'bg-orange-500',
  Security:      'bg-rose-500',
  'DNS & CDN':   'bg-sky-500',
  Messaging:     'bg-indigo-500',
  'AI APIs':     'bg-pink-500',
  'External APIs': 'bg-teal-500',
  Hosting:       'bg-lime-500',
  'Other AWS':   'bg-slate-500',
}

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  aws_cost_explorer: { label: 'Live AWS', className: 'bg-blue-900/50 text-blue-400' },
  estimated:         { label: 'Estimate', className: 'bg-amber-900/50 text-amber-400' },
  fixed:             { label: 'Fixed',    className: 'bg-slate-700 text-slate-300' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, trend,
}: { label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'flat' }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-emerald-400' : 'text-slate-500'
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {sub && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${trendColor}`}>
          {trend && <TrendIcon className="h-3 w-3" />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  )
}

function CategoryBar({ items, total }: { items: CostLineItem[]; total: number }) {
  const byCategory: Record<string, number> = {}
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + item.amountUsd
  }

  const sorted = CATEGORY_ORDER
    .filter(c => byCategory[c])
    .map(c => ({ category: c, amount: byCategory[c] }))

  const other = items
    .filter(i => !CATEGORY_ORDER.includes(i.category))
    .reduce((s, i) => s + i.amountUsd, 0)
  if (other > 0) sorted.push({ category: 'Other AWS', amount: other })

  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {sorted.map(({ category, amount }) => {
          const pct = total > 0 ? (amount / total) * 100 : 0
          if (pct < 0.5) return null
          return (
            <div
              key={category}
              className={`${CATEGORY_COLOR[category] ?? 'bg-slate-500'} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${category}: ${usd(amount)}`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map(({ category, amount }) => (
          <div key={category} className="flex items-center gap-1.5 text-xs text-slate-300">
            <div className={`w-2.5 h-2.5 rounded-sm ${CATEGORY_COLOR[category] ?? 'bg-slate-500'}`} />
            <span>{category}</span>
            <span className="text-slate-500">{usd(amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendChart({ trend }: { trend: Array<{ month: string; awsCost: number }> }) {
  if (!trend.length) return <div className="text-slate-500 text-sm">No trend data available.</div>

  const max = Math.max(...trend.map(t => t.awsCost), 1)
  const currentMonth = trend[trend.length - 1]
  const prevMonth    = trend[trend.length - 2]

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-32">
        {trend.map((t, i) => {
          const pct = (t.awsCost / max) * 100
          const isCurrent = i === trend.length - 1
          return (
            <div key={t.month} className="flex-1 flex flex-col items-center gap-1" title={`${shortMonth(t.month)}: ${usd(t.awsCost)}`}>
              <div
                className={`w-full rounded-t transition-all ${isCurrent ? 'bg-teal-500' : 'bg-slate-600'}`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
              <span className="text-[10px] text-slate-500 truncate">{shortMonth(t.month)}</span>
            </div>
          )
        })}
      </div>
      {prevMonth && currentMonth && (
        <div className="text-xs text-slate-400">
          Current month <span className="text-white font-medium">{usd(currentMonth.awsCost)}</span>
          {' vs last month '}
          <span className="text-slate-300">{usd(prevMonth.awsCost)}</span>
          {currentMonth.awsCost > prevMonth.awsCost ? (
            <span className="text-red-400 ml-1">▲ {usd(currentMonth.awsCost - prevMonth.awsCost)}</span>
          ) : currentMonth.awsCost < prevMonth.awsCost ? (
            <span className="text-emerald-400 ml-1">▼ {usd(prevMonth.awsCost - currentMonth.awsCost)}</span>
          ) : (
            <span className="text-slate-500 ml-1">—</span>
          )}
        </div>
      )}
    </div>
  )
}

function CostTable({ items }: { items: CostLineItem[] }) {
  // Group by category, preserving CATEGORY_ORDER
  const groups: Record<string, CostLineItem[]> = {}
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = []
    groups[item.category].push(item)
  }

  const orderedCategories = [
    ...CATEGORY_ORDER.filter(c => groups[c]),
    ...Object.keys(groups).filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm text-slate-300">
        <thead>
          <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
            <th className="px-4 py-3 text-left">Service / Line Item</th>
            <th className="px-4 py-3 text-left">Category</th>
            <th className="px-4 py-3 text-left">Source</th>
            <th className="px-4 py-3 text-left">Note</th>
            <th className="px-4 py-3 text-right">This Month</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {orderedCategories.map(category => {
            const catItems = groups[category] ?? []
            const catTotal = catItems.reduce((s, i) => s + i.amountUsd, 0)
            return [
              // Category subtotal row
              <tr key={`__cat_${category}`} className="bg-slate-900/50">
                <td colSpan={4} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-sm ${CATEGORY_COLOR[category] ?? 'bg-slate-500'}`} />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">{category}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right text-xs font-semibold text-slate-300">
                  {usd(catTotal)}
                </td>
              </tr>,
              ...catItems.map(item => {
                const badge = SOURCE_BADGE[item.source]
                return (
                  <tr key={item.name} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 pl-8 font-medium text-white text-sm">{item.name}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{item.category}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[280px]">
                      {item.note ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-white">
                      {usd(item.amountUsd)}
                    </td>
                  </tr>
                )
              }),
            ]
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-800 border-t border-slate-600">
            <td colSpan={4} className="px-4 py-3 font-bold text-white">Total</td>
            <td className="px-4 py-3 text-right font-bold text-white font-mono">
              {usd(items.reduce((s, i) => s + i.amountUsd, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CostsPage() {
  const [data, setData]       = useState<PlatformCosts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    getPlatformCosts()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-slate-400">Loading cost data…</div>
  if (error)   return <div className="p-8 text-red-400">Error: {error}</div>
  if (!data)   return null

  const { currentMonth, byService, monthlyTrend, unitEconomics } = data

  // Compute MoM for the summary
  const trend = monthlyTrend
  const prevAws = trend.length >= 2 ? trend[trend.length - 2].awsCost : null
  const momDir  = prevAws === null
    ? undefined
    : currentMonth.awsTotal > prevAws ? 'up' : currentMonth.awsTotal < prevAws ? 'down' : 'flat'
  const momText = prevAws !== null
    ? `${momDir === 'up' ? '+' : momDir === 'down' ? '-' : ''}${usd(Math.abs(currentMonth.awsTotal - prevAws))} vs last month`
    : undefined

  return (
    <div className="p-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Financial Portal</h1>
        <p className="text-slate-400 text-sm mt-1">
          All platform operating costs — AWS infrastructure, external APIs, and fixed expenses.
          {data.awsCostExplorerAvailable
            ? <> AWS data via Cost Explorer (24–48h lag). Last collected {new Date(data.collectedAt).toLocaleString()}.</>
            : <> <span className="text-amber-400">AWS Cost Explorer unavailable</span> — showing estimates only.</>
          }
        </p>
      </div>

      {/* IAM warning if Cost Explorer not available */}
      {!data.awsCostExplorerAvailable && (
        <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>AWS Cost Explorer access required.</strong>{' '}
            Grant <code className="bg-amber-900/40 px-1 rounded">ce:GetCostAndUsage</code> to the admin Lambda&apos;s IAM role
            and redeploy, or enable Cost Explorer in the AWS Billing Console.
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="AWS Total (this month)"
          value={usd(currentMonth.awsTotal)}
          sub={momText}
          trend={momDir}
        />
        <SummaryCard
          label="External & APIs"
          value={usd(currentMonth.externalTotal)}
          sub="Anthropic · Plaid · Vercel · Domain"
        />
        <SummaryCard
          label="All-In Monthly Cost"
          value={usd(currentMonth.total)}
          sub={`${unitEconomics.activeHoas} active communities`}
        />
        <SummaryCard
          label="Cost per HOA"
          value={usd(unitEconomics.costPerHoa)}
          sub={`$${unitEconomics.costPerUser.toFixed(2)}/user · ${unitEconomics.totalUsers} users`}
        />
      </div>

      {/* Cost breakdown bar + trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Category breakdown */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <h2 className="text-base font-semibold text-white">Cost by Category</h2>
          <CategoryBar items={byService} total={currentMonth.total} />
        </div>

        {/* Monthly trend */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
          <h2 className="text-base font-semibold text-white">AWS Spend Trend (6 months)</h2>
          <TrendChart trend={monthlyTrend} />
        </div>
      </div>

      {/* Unit economics */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-4">Unit Economics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider">Cost / HOA</div>
            <div className="text-2xl font-bold text-white mt-1">{usd(unitEconomics.costPerHoa)}</div>
            <div className="text-xs text-slate-500">{unitEconomics.activeHoas} active HOAs</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider">Cost / User</div>
            <div className="text-2xl font-bold text-white mt-1">{usd(unitEconomics.costPerUser)}</div>
            <div className="text-xs text-slate-500">{unitEconomics.totalUsers} total users</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider">AWS Share</div>
            <div className="text-2xl font-bold text-white mt-1">
              {currentMonth.total > 0
                ? `${Math.round((currentMonth.awsTotal / currentMonth.total) * 100)}%`
                : '—'}
            </div>
            <div className="text-xs text-slate-500">of total spend</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider">External Share</div>
            <div className="text-2xl font-bold text-white mt-1">
              {currentMonth.total > 0
                ? `${Math.round((currentMonth.externalTotal / currentMonth.total) * 100)}%`
                : '—'}
            </div>
            <div className="text-xs text-slate-500">APIs + Hosting</div>
          </div>
        </div>
      </div>

      {/* Full cost table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">All Line Items</h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5" />
            AWS costs have a 24–48h reporting delay. Estimates are based on usage data.
          </div>
        </div>
        <CostTable items={byService} />
      </div>

    </div>
  )
}
