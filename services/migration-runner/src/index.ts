import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { Client } from 'pg'
import { Readable } from 'stream'

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION })
const s3 = new S3Client({ region: process.env.AWS_REGION })

async function getSecret(arn: string): Promise<{ username: string; password: string }> {
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }))
  return JSON.parse(res.SecretString ?? '{}')
}

async function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

async function listMigrationFiles(bucket: string): Promise<string[]> {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'migrations/V' }))
  return (res.Contents ?? [])
    .map(o => o.Key ?? '')
    .filter(k => k.endsWith('.sql'))
    .sort()
}

async function readMigrationFile(bucket: string, key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  return streamToString(res.Body as Readable)
}

export const handler = async (): Promise<{ success: boolean; results: unknown[] }> => {
  const secretArn = process.env.DB_SECRET_ARN ?? ''
  const bucketName = process.env.S3_BUCKET ?? ''
  const dbName = process.env.DB_NAME ?? 'stewardly'

  console.log('Migration runner starting...')

  const secret = await getSecret(secretArn)
  const db = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432'),
    database: dbName,
    user: secret.username,
    password: secret.password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  await db.connect()
  console.log('Connected to database')

  // Ensure migrations tracking table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      filename    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const applied = await db.query('SELECT version FROM schema_migrations ORDER BY version')
  const appliedSet = new Set(applied.rows.map((r: { version: string }) => r.version))
  console.log('Already applied:', [...appliedSet])

  const files = await listMigrationFiles(bucketName)
  console.log('Migration files found:', files)

  const results: unknown[] = []

  for (const key of files) {
    const filename = key.split('/').pop() ?? ''
    const versionMatch = filename.match(/^(V\d+)/)
    if (!versionMatch) { console.log('Skipping:', key); continue }
    const version = versionMatch[1]

    if (appliedSet.has(version)) {
      console.log(`Skipping ${version} — already applied`)
      results.push({ version, status: 'skipped' })
      continue
    }

    console.log(`Applying ${version} (${filename})...`)
    const sql = await readMigrationFile(bucketName, key)

    try {
      await db.query('BEGIN')
      await db.query(sql)
      await db.query(
        'INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)',
        [version, filename],
      )
      await db.query('COMMIT')
      console.log(`✓ Applied ${version}`)
      results.push({ version, status: 'applied', filename })
    } catch (err) {
      await db.query('ROLLBACK')
      console.error(`✗ Failed ${version}:`, (err as Error).message)
      await db.end()
      throw new Error(`Migration ${version} failed: ${(err as Error).message}`)
    }
  }

  await db.end()
  console.log('Migration complete:', results)
  return { success: true, results }
}
