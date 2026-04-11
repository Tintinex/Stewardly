import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch'
import type { MonitoringData, LambdaMetric } from './types'

const cw = new CloudWatchClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

// Cache result for 60s to avoid hammering CloudWatch on every page load
let cache: { data: MonitoringData; expiresAt: number } | null = null

const SERVICES = [
  'dashboard-service', 'tasks-service', 'meetings-service',
  'residents-service', 'messaging-service', 'finances-service', 'admin-service',
]

export async function getMonitoringData(stage: string): Promise<MonitoringData> {
  const now = Date.now()
  if (cache && now < cache.expiresAt) return cache.data

  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 60 * 60 * 1000) // last 1 hour

  // Build metric queries for all services
  const queries: MetricDataQuery[] = []

  for (const svc of SERVICES) {
    const fnName = `stewardly-${svc}-${stage}`
    const safe = svc.replace(/-/g, '_')
    queries.push(
      { Id: `${safe}_errors`, MetricStat: { Metric: { Namespace: 'AWS/Lambda', MetricName: 'Errors', Dimensions: [{ Name: 'FunctionName', Value: fnName }] }, Period: 3600, Stat: 'Sum' } },
      { Id: `${safe}_invocations`, MetricStat: { Metric: { Namespace: 'AWS/Lambda', MetricName: 'Invocations', Dimensions: [{ Name: 'FunctionName', Value: fnName }] }, Period: 3600, Stat: 'Sum' } },
      { Id: `${safe}_p95`, MetricStat: { Metric: { Namespace: 'AWS/Lambda', MetricName: 'Duration', Dimensions: [{ Name: 'FunctionName', Value: fnName }] }, Period: 3600, Stat: 'p95' } },
      { Id: `${safe}_throttles`, MetricStat: { Metric: { Namespace: 'AWS/Lambda', MetricName: 'Throttles', Dimensions: [{ Name: 'FunctionName', Value: fnName }] }, Period: 3600, Stat: 'Sum' } },
    )
  }

  // API Gateway + RDS metrics
  queries.push(
    { Id: 'apigw_4xx', MetricStat: { Metric: { Namespace: 'AWS/ApiGateway', MetricName: '4XXError' }, Period: 3600, Stat: 'Sum' } },
    { Id: 'apigw_5xx', MetricStat: { Metric: { Namespace: 'AWS/ApiGateway', MetricName: '5XXError' }, Period: 3600, Stat: 'Sum' } },
    { Id: 'rds_connections', MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: 'DatabaseConnections' }, Period: 3600, Stat: 'Average' } },
    { Id: 'rds_cpu', MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: 'CPUUtilization' }, Period: 3600, Stat: 'Average' } },
  )

  const res = await cw.send(new GetMetricDataCommand({
    MetricDataQueries: queries,
    StartTime: startTime,
    EndTime: endTime,
  }))

  const metricMap = new Map<string, number>()
  for (const r of res.MetricDataResults ?? []) {
    metricMap.set(r.Id ?? '', r.Values?.[0] ?? 0)
  }

  const lambdaMetrics: LambdaMetric[] = SERVICES.map(svc => {
    const safe = svc.replace(/-/g, '_')
    return {
      functionName: svc,
      errors: metricMap.get(`${safe}_errors`) ?? 0,
      invocations: metricMap.get(`${safe}_invocations`) ?? 0,
      p95Duration: Math.round(metricMap.get(`${safe}_p95`) ?? 0),
      throttles: metricMap.get(`${safe}_throttles`) ?? 0,
    }
  })

  const data: MonitoringData = {
    lambdaMetrics,
    apiGateway4xx: metricMap.get('apigw_4xx') ?? 0,
    apiGateway5xx: metricMap.get('apigw_5xx') ?? 0,
    dbConnections: Math.round(metricMap.get('rds_connections') ?? 0),
    dbCpuPercent: Math.round(metricMap.get('rds_cpu') ?? 0),
    collectedAt: new Date().toISOString(),
  }

  cache = { data, expiresAt: now + 60_000 }
  return data
}
