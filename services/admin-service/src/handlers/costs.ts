import * as r from '../../../shared/response'
import { getCostExplorerData } from '../costs'
import { queryOne } from '../../../shared/db/client'
import type { PlatformCosts, CostLineItem } from '../types'

// ── AWS service name → our display category ──────────────────────────────────
const SERVICE_CATEGORY: Record<string, string> = {
  'AWS Lambda':                               'Compute',
  'Amazon API Gateway':                       'Compute',
  'Amazon Elastic Compute Cloud - Compute':   'Compute',
  'Amazon Relational Database Service':       'Database',
  'Amazon Aurora':                            'Database',
  'Amazon Simple Storage Service':            'Storage',
  'AWS Data Transfer':                        'Networking',
  'Amazon CloudFront':                        'Networking',
  'Amazon Virtual Private Cloud':             'Networking',
  'Amazon CloudWatch':                        'Observability',
  'AWS CloudTrail':                           'Observability',
  'Amazon Cognito':                           'Identity',
  'AWS Key Management Service':               'Security',
  'AWS Secrets Manager':                      'Security',
  'AWS WAF':                                  'Security',
  'Amazon Route 53':                          'DNS & CDN',
  'Amazon Simple Email Service':              'Messaging',
  'Amazon Simple Notification Service':       'Messaging',
  'Amazon Simple Queue Service':              'Messaging',
  'AWS Glue':                                 'ETL',
  'Amazon DynamoDB':                          'Database',
}

function mapCategory(service: string): string {
  if (SERVICE_CATEGORY[service]) return SERVICE_CATEGORY[service]
  if (service.toLowerCase().includes('lambda'))           return 'Compute'
  if (service.toLowerCase().includes('rds') ||
      service.toLowerCase().includes('database') ||
      service.toLowerCase().includes('aurora'))           return 'Database'
  if (service.toLowerCase().includes('s3') ||
      service.toLowerCase().includes('storage'))          return 'Storage'
  if (service.toLowerCase().includes('cloudwatch') ||
      service.toLowerCase().includes('logs'))             return 'Observability'
  if (service.toLowerCase().includes('cognito'))          return 'Identity'
  if (service.toLowerCase().includes('kms') ||
      service.toLowerCase().includes('secrets'))          return 'Security'
  if (service.toLowerCase().includes('gateway'))          return 'Compute'
  if (service.toLowerCase().includes('transfer') ||
      service.toLowerCase().includes('vpc') ||
      service.toLowerCase().includes('nat'))              return 'Networking'
  return 'Other AWS'
}

// ── External / fixed cost definitions ────────────────────────────────────────
// These are monthly estimates — update as actual invoices change.
// Anthropic and Plaid are estimated from usage; Vercel/domain are fixed.

// Anthropic Claude API pricing (approximate, Haiku model for document processing)
const ANTHROPIC_COST_PER_DOC_USD = 0.015   // ~$0.015 per doc processed (~1k tokens)
// Plaid pricing — Development tier: $0.30/connected item/month
const PLAID_COST_PER_ITEM_USD = 0.30
// Rentcast AVM pricing — pay-per-call on the API plan (~$0.10/AVM value call)
const RENTCAST_COST_PER_CALL_USD = 0.10

/**
 * GET /api/admin/costs
 *
 * Returns a breakdown of all platform operating costs:
 * - Live AWS costs via Cost Explorer (24–48h lag)
 * - Estimated external API costs derived from usage data
 * - Fixed hosting/domain costs
 */
export async function handleGetCosts(): Promise<r.ApiResponse> {
  const [awsData, usageMetrics] = await Promise.all([
    getCostExplorerData().catch(() => null),
    getUsageMetrics(),
  ])

  // ── AWS cost line items ───────────────────────────────────────────────────
  const awsItems: CostLineItem[] = (awsData?.currentMonth ?? []).map(item => ({
    name:       item.service,
    category:   mapCategory(item.service),
    amountUsd:  item.amountUsd,
    source:     'aws_cost_explorer' as const,
    note:       '24–48h lag from AWS billing',
  }))

  const awsTotal = awsItems.reduce((s, i) => s + i.amountUsd, 0)

  // ── External API cost estimates ───────────────────────────────────────────
  const anthropicCost  = Math.round(usageMetrics.docsProcessedThisMonth * ANTHROPIC_COST_PER_DOC_USD * 100) / 100
  const plaidCost      = Math.round(usageMetrics.plaidItemCount * PLAID_COST_PER_ITEM_USD * 100) / 100
  const rentcastCost   = Math.round(usageMetrics.rentcastCallsThisMonth * RENTCAST_COST_PER_CALL_USD * 100) / 100

  const externalItems: CostLineItem[] = [
    {
      name:      'Anthropic Claude API',
      category:  'AI APIs',
      amountUsd: anthropicCost,
      source:    'estimated',
      note:      `${usageMetrics.docsProcessedThisMonth} docs × $${ANTHROPIC_COST_PER_DOC_USD}/doc this month`,
    },
    {
      name:      'Rentcast AVM',
      category:  'External APIs',
      amountUsd: rentcastCost,
      source:    'estimated',
      note:      `${usageMetrics.rentcastCallsThisMonth} estimate refresh${usageMetrics.rentcastCallsThisMonth !== 1 ? 'es' : ''} this month × $${RENTCAST_COST_PER_CALL_USD}/call`,
    },
    {
      name:      'Plaid (bank connectivity)',
      category:  'External APIs',
      amountUsd: plaidCost,
      source:    'estimated',
      note:      `${usageMetrics.plaidItemCount} linked institutions × $${PLAID_COST_PER_ITEM_USD}/month`,
    },
    {
      name:      'Vercel (frontend hosting)',
      category:  'Hosting',
      amountUsd: 20,          // Pro plan = $20/month per member; adjust as needed
      source:    'fixed',
      note:      'Vercel Pro plan (estimate)',
    },
    {
      name:      'Domain registration',
      category:  'Hosting',
      amountUsd: 1.25,        // ~$15/year
      source:    'fixed',
      note:      '~$15/year amortized',
    },
  ]

  const externalTotal = externalItems.reduce((s, i) => s + i.amountUsd, 0)
  const grandTotal    = Math.round((awsTotal + externalTotal) * 100) / 100

  // ── Unit economics ────────────────────────────────────────────────────────
  const activeHoas  = usageMetrics.activeHoas
  const totalUsers  = usageMetrics.totalUsers

  const result: PlatformCosts = {
    currentMonth: {
      awsTotal:      Math.round(awsTotal * 100) / 100,
      externalTotal: Math.round(externalTotal * 100) / 100,
      total:         grandTotal,
    },
    byService: [...awsItems, ...externalItems],
    monthlyTrend: (awsData?.monthlyTrend ?? []).map(t => ({
      month:     t.month,
      awsCost:   t.amountUsd,
    })),
    unitEconomics: {
      costPerHoa:  activeHoas > 0 ? Math.round((grandTotal / activeHoas) * 100) / 100 : 0,
      costPerUser: totalUsers > 0 ? Math.round((grandTotal / totalUsers) * 100) / 100 : 0,
      activeHoas,
      totalUsers,
    },
    awsCostExplorerAvailable: awsData !== null,
    collectedAt: new Date().toISOString(),
  }

  return r.ok(result)
}

// ── DB usage metrics ──────────────────────────────────────────────────────────

interface UsageMetrics {
  docsProcessedThisMonth: number
  plaidItemCount: number
  rentcastCallsThisMonth: number
  activeHoas: number
  totalUsers: number
}

async function getUsageMetrics(): Promise<UsageMetrics> {
  const [docsRow, plaidRow, rentcastRow, hoasRow, usersRow] = await Promise.all([
    // Documents processed (created) this calendar month as a proxy for AI usage
    queryOne<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM documents
      WHERE created_at >= DATE_TRUNC('month', NOW())
        AND source IN ('upload', 'google_drive', 'email')
    `),
    // Plaid items still connected (not deleted)
    queryOne<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM plaid_items
      WHERE status = 'active'
    `).catch(() => ({ count: 0 })),
    // Rentcast AVM calls: units whose estimate was refreshed this calendar month
    queryOne<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM units
      WHERE zestimate_at >= DATE_TRUNC('month', NOW())
    `).catch(() => ({ count: 0 })),
    // Active HOAs (paying or trialing)
    queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT hoa_id)::int AS count FROM subscriptions
      WHERE status IN ('active','trialing','trial')
    `),
    // Total owners/users
    queryOne<{ count: number }>(`SELECT COUNT(*)::int AS count FROM owners`),
  ])

  return {
    docsProcessedThisMonth: docsRow?.count ?? 0,
    plaidItemCount:         (plaidRow as { count: number } | null)?.count ?? 0,
    rentcastCallsThisMonth: (rentcastRow as { count: number } | null)?.count ?? 0,
    activeHoas:             hoasRow?.count ?? 0,
    totalUsers:             usersRow?.count ?? 0,
  }
}
