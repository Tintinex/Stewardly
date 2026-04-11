import * as r from '../../../shared/response'
import { getBillingData } from '../repository'

export async function handleBilling(): Promise<r.ApiResponse> {
  const data = await getBillingData()
  return r.ok(data)
}
