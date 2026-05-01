/**
 * Async Lambda invocation helper for the document-processor.
 * Uses InvocationType: 'Event' (fire-and-forget) so the upload response
 * is not delayed by AI processing.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type { ProcessDocumentEvent } from '../../document-processor/src/index'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

export async function invokeDocumentProcessor(event: ProcessDocumentEvent): Promise<void> {
  const functionName = process.env.DOCUMENT_PROCESSOR_FUNCTION_NAME
  if (!functionName) {
    console.warn('[processor-invoke] DOCUMENT_PROCESSOR_FUNCTION_NAME not set — skipping')
    return
  }

  await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // async — no wait for response
      Payload: Buffer.from(JSON.stringify(event)),
    }),
  )
}
