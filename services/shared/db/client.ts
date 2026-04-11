/**
 * Database client — direct PostgreSQL connections via `pg`.
 * Public interface (query / queryOne / execute / param) is unchanged from
 * the previous RDS Data API version, so all service files work as-is.
 */
import { Pool } from 'pg'
import * as pgTypes from 'pg'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

// ─── Type parsers ─────────────────────────────────────────────────────────────
// pg returns NUMERIC as string and TIMESTAMP as Date by default.
// Override so values match the shapes expected by the services (numbers + strings).
const { types } = pgTypes

// NUMERIC / DECIMAL → JS number
types.setTypeParser(types.builtins.NUMERIC, (v: string) => parseFloat(v))
// TIMESTAMP → ISO string (keep consistent with previous Data API behaviour)
types.setTypeParser(types.builtins.TIMESTAMP, (v: string) => v)
types.setTypeParser(types.builtins.TIMESTAMPTZ, (v: string) => v)
types.setTypeParser(types.builtins.DATE, (v: string) => v)
// INT8 (bigint) → JS number (safe for our row-count values)
types.setTypeParser(types.builtins.INT8, (v: string) => parseInt(v, 10))

// ─── Connection pool ──────────────────────────────────────────────────────────
// Module-scope so the pool is reused across warm Lambda invocations.
let _pool: Pool | null = null

interface DbSecret {
  host: string
  port: number | string
  username: string
  password: string
  dbname: string
}

async function getPool(): Promise<Pool> {
  if (_pool) return _pool

  const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  const result = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN ?? '' }),
  )
  const creds = JSON.parse(result.SecretString ?? '{}') as DbSecret

  _pool = new Pool({
    host: creds.host,
    port: typeof creds.port === 'string' ? parseInt(creds.port, 10) : creds.port,
    user: creds.username,
    password: creds.password,
    database: creds.dbname,
    // RDS uses TLS; disable strict cert validation for private-subnet Lambdas
    ssl: { rejectUnauthorized: false },
    // Lambda: 1 connection per container avoids overwhelming the DB
    max: 1,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

  return _pool
}

// ─── Named → positional parameter conversion ──────────────────────────────────
// The service layer uses RDS Data API–style named params (:paramName).
// pg uses positional params ($1, $2, …).  This function converts between them.
// If the same :name appears multiple times, it always maps to the same $N.

export interface Param {
  name: string
  value: unknown
}

function namedToPositional(
  sql: string,
  params: Param[],
): { text: string; values: unknown[] } {
  const nameToIndex = new Map<string, number>()
  const values: unknown[] = []

  const text = sql.replace(/:([a-zA-Z]\w*)/g, (_, name: string) => {
    if (!nameToIndex.has(name)) {
      const p = params.find(item => item.name === name)
      if (p === undefined) throw new Error(`[db/client] Unknown SQL parameter: :${name}`)
      values.push(p.value)
      nameToIndex.set(name, values.length) // 1-based
    }
    return `$${nameToIndex.get(name)}`
  })

  return { text, values }
}

// ─── camelCase transform ───────────────────────────────────────────────────────
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase())
}

function transformRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    out[toCamelCase(key)] = row[key]
  }
  return out as T
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function query<T>(sql: string, params: Param[] = []): Promise<T[]> {
  const db = await getPool()
  const { text, values } = namedToPositional(sql, params)
  const result = await db.query(text, values)
  return result.rows.map(row => transformRow<T>(row as Record<string, unknown>))
}

export async function queryOne<T>(sql: string, params: Param[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function execute(sql: string, params: Param[] = []): Promise<void> {
  const db = await getPool()
  const { text, values } = namedToPositional(sql, params)
  await db.query(text, values)
}

/**
 * Named parameter helpers.
 * API is identical to the previous RDS Data API version so no service
 * files need changing.
 */
export const param = {
  string:       (name: string, value: string)                    : Param => ({ name, value }),
  stringOrNull: (name: string, value: string | null | undefined) : Param => ({ name, value: value ?? null }),
  int:          (name: string, value: number)                    : Param => ({ name, value }),
  bool:         (name: string, value: boolean)                   : Param => ({ name, value }),
  double:       (name: string, value: number)                    : Param => ({ name, value }),
}
