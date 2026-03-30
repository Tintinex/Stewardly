import {
  RDSDataClient,
  ExecuteStatementCommand,
  Field,
  SqlParameter,
} from '@aws-sdk/client-rds-data'

const client = new RDSDataClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN ?? ''
const DB_SECRET_ARN = process.env.DB_SECRET_ARN ?? ''
const DB_NAME = process.env.DB_NAME ?? 'stewardly'

function fieldToValue(field: Field): string | number | boolean | null {
  if (field.stringValue !== undefined) return field.stringValue
  if (field.longValue !== undefined) return field.longValue
  if (field.doubleValue !== undefined) return field.doubleValue
  if (field.booleanValue !== undefined) return field.booleanValue
  if (field.isNull) return null
  if (field.blobValue !== undefined) return Buffer.from(field.blobValue).toString('utf-8')
  return null
}

function mapRowToObject(
  columns: string[],
  fields: Field[],
): Record<string, string | number | boolean | null> {
  const obj: Record<string, string | number | boolean | null> = {}
  columns.forEach((col, i) => {
    obj[col] = fieldToValue(fields[i])
  })
  return obj
}

// Convert camelCase/snake_case DB column to camelCase JS property
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function transformRecord(
  record: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const transformed: Record<string, string | number | boolean | null> = {}
  for (const key of Object.keys(record)) {
    transformed[toCamelCase(key)] = record[key]
  }
  return transformed
}

export async function query<T>(
  sql: string,
  parameters: SqlParameter[] = [],
): Promise<T[]> {
  const command = new ExecuteStatementCommand({
    resourceArn: DB_CLUSTER_ARN,
    secretArn: DB_SECRET_ARN,
    database: DB_NAME,
    sql,
    parameters,
    includeResultMetadata: true,
    formatRecordsAs: 'NONE',
  })

  const result = await client.send(command)

  if (!result.records || !result.columnMetadata) {
    return []
  }

  const columns = result.columnMetadata.map(col => col.name ?? '')
  return result.records.map(row =>
    transformRecord(mapRowToObject(columns, row)) as unknown as T,
  )
}

export async function queryOne<T>(
  sql: string,
  parameters: SqlParameter[] = [],
): Promise<T | null> {
  const results = await query<T>(sql, parameters)
  return results[0] ?? null
}

export async function execute(
  sql: string,
  parameters: SqlParameter[] = [],
): Promise<void> {
  const command = new ExecuteStatementCommand({
    resourceArn: DB_CLUSTER_ARN,
    secretArn: DB_SECRET_ARN,
    database: DB_NAME,
    sql,
    parameters,
  })
  await client.send(command)
}

// Typed parameter helpers
export const param = {
  string: (name: string, value: string): SqlParameter => ({
    name,
    value: { stringValue: value },
  }),
  stringOrNull: (name: string, value: string | null | undefined): SqlParameter => ({
    name,
    value: value != null ? { stringValue: value } : { isNull: true },
  }),
  int: (name: string, value: number): SqlParameter => ({
    name,
    value: { longValue: Math.round(value) },
  }),
  bool: (name: string, value: boolean): SqlParameter => ({
    name,
    value: { booleanValue: value },
  }),
  double: (name: string, value: number): SqlParameter => ({
    name,
    value: { doubleValue: value },
  }),
}
