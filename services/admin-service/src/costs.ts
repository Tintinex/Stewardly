import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from '@aws-sdk/client-cost-explorer'

// Cost Explorer is a global service — endpoint only available in us-east-1
const ce = new CostExplorerClient({ region: 'us-east-1' })

export interface CostExplorerData {
  /** Current month costs broken down by AWS service */
  currentMonth: Array<{ service: string; amountUsd: number }>
  /** Last 6 full months + current partial month, total AWS spend per month */
  monthlyTrend: Array<{ month: string; amountUsd: number }>
}

let cache: { data: CostExplorerData; expiresAt: number } | null = null

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getCostExplorerData(): Promise<CostExplorerData> {
  const now = Date.now()
  if (cache && now < cache.expiresAt) return cache.data

  const today = new Date()
  // Cost Explorer requires end date to be the day AFTER the last day you want
  // For current month, use today as end (it queries up-to-but-not-including end)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  // 6 months ago (start of that month)
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1)
  // Tomorrow for the end boundary
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [currentMonthRes, trendRes] = await Promise.all([
    ce.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: fmt(startOfMonth), End: fmt(tomorrow) },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    })),
    ce.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: fmt(sixMonthsAgo), End: fmt(tomorrow) },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
    })),
  ])

  const currentMonth: Array<{ service: string; amountUsd: number }> = []
  for (const result of currentMonthRes.ResultsByTime ?? []) {
    for (const group of result.Groups ?? []) {
      const service = group.Keys?.[0] ?? 'Unknown'
      const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount ?? '0')
      if (amount >= 0.001) currentMonth.push({ service, amountUsd: Math.round(amount * 100) / 100 })
    }
  }
  currentMonth.sort((a, b) => b.amountUsd - a.amountUsd)

  const monthlyTrend: Array<{ month: string; amountUsd: number }> = []
  for (const result of trendRes.ResultsByTime ?? []) {
    const month = result.TimePeriod?.Start ?? ''
    const amount = parseFloat(result.Total?.UnblendedCost?.Amount ?? '0')
    monthlyTrend.push({ month, amountUsd: Math.round(amount * 100) / 100 })
  }

  const data: CostExplorerData = { currentMonth, monthlyTrend }
  // Cache for 1 hour — Cost Explorer data has 24h latency anyway
  cache = { data, expiresAt: now + 3_600_000 }
  return data
}
