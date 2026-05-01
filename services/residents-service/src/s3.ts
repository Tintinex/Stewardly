import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = process.env.S3_BUCKET!
const REGION = process.env.AWS_REGION ?? 'us-east-1'
const KMS_KEY = process.env.KMS_KEY_ARN

const s3 = new S3Client({ region: REGION })

/** Generate a presigned PUT URL the browser can use to upload directly to S3.
 *  Expires in 5 minutes — just long enough for the user to submit. */
export async function generateUploadUrl(s3Key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: contentType,
    ...(KMS_KEY ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: KMS_KEY } : {}),
  })
  return getSignedUrl(s3, cmd, { expiresIn: 300 })
}

/** Generate a presigned GET URL for downloading a private S3 object.
 *  Default TTL is 7 days — safe to return in list responses. */
export async function generateDownloadUrl(s3Key: string, fileName: string, expiresIn = 604800): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
  })
  return getSignedUrl(s3, cmd, { expiresIn })
}

/** Upload a buffer directly to S3 (used for Drive imports and email attachments). */
export async function uploadBuffer(
  s3Key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType,
    ...(KMS_KEY ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: KMS_KEY } : {}),
  }))
}

/** Upload by fetching from a remote URL (Google Drive, public links). */
export async function uploadFromUrl(
  sourceUrl: string,
  s3Key: string,
  contentType: string,
): Promise<{ sizeBytes: number }> {
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Stewardly-Document-Importer/1.0' },
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch file: HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await uploadBuffer(s3Key, buffer, contentType)
  return { sizeBytes: buffer.length }
}

/** Permanently delete an S3 object (called when a document is deleted). */
export async function deleteObject(s3Key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }))
}

/** Build a canonical S3 key for a new document upload. */
export function makeDocumentKey(hoaId: string, docId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return `documents/${hoaId}/${docId}/${safe}`
}
