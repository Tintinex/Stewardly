'use client'

import { useEffect, useState } from 'react'
import { getMonitoringMetrics } from '@/lib/admin-api'
import type { MonitoringData, LambdaMetric } from '@/types/admin'

function MetricBadge({ value, warn, danger, unit = '' }: { value: number; warn: number; danger: number; unit?: string }) {
  const color = value >= danger ? 'text-red-400' : value >= warn ? 'text-amber-400' : 'text-emerald-400'
  return <span className={`font-mono font-semibold ${color}`}>{value}{unit}</span>
}

function LambdaRow({ m }: { m: LambdaMetric }) {
  const errorRate = m.invocations > 0 ? ((m.errors / m.invocations) * 100).toFixed(1) : '0.0'
  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/40">
      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{m.functionName}</td>
      <td className="px-4 py-3 text-right text-slate-400">{m.invocations.toLocaleString()}</td>
      <td className="px-4 py-3 text-right"><MetricBadge value={m.errors} warn={1} danger={10} /></td>
      <td className="px-4 py-3 text-right">
        <MetricBadge value={parseFloat(errorRate)} warn={1} danger={5} unit="%" />
      </td>
      <td className="px-4 py-3 text-right"><MetricBadge value={m.p95Duration} warn={3000} danger={10000} unit="ms" /></td>
      <td className="px-4 py-3 text-right"><MetricBadge value={m.throttles} warn={1} danger={10} /></td>
    </tr>
  )
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    getMonitoringMetrics()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="p-8 text-slate-400">Loading CloudWatch metrics…</div>
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>
  if (!data) return null

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Infrastructure Monitoring</h1>
          <p className="text-slate-400 text-sm mt-1">
            Last hour · Collected {new Date(data.collectedAt).toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* System-level cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">API 4xx Errors</div>
          <MetricBadge value={data.apiGateway4xx} warn={10} danger={50} />
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">API 5xx Errors</div>
          <MetricBadge value={data.apiGateway5xx} warn={1} danger={10} />
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">DB Connections</div>
          <MetricBadge value={data.dbConnections} warn={50} danger={80} />
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">DB CPU</div>
          <MetricBadge value={data.dbCpuPercent} warn={60} danger={85} unit="%" />
        </div>
      </div>

      {/* Lambda table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white">Lambda Functions — Last Hour</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            <span className="text-emerald-400">●</span> healthy &nbsp;
            <span className="text-amber-400">●</span> warning &nbsp;
            <span className="text-red-400">●</span> critical
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Function</th>
              <th className="px-4 py-3 text-right">Invocations</th>
              <th className="px-4 py-3 text-right">Errors</th>
              <th className="px-4 py-3 text-right">Error Rate</th>
              <th className="px-4 py-3 text-right">P95 Duration</th>
              <th className="px-4 py-3 text-right">Throttles</th>
            </tr>
          </thead>
          <tbody>
            {data.lambdaMetrics.map(m => <LambdaRow key={m.functionName} m={m} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
