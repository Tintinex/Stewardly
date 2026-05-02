import * as r from '../../../shared/response'
import * as repo from '../repository'
import { extractUnitsFromDocument } from '../../../document-processor/src/claude'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

// ── Rentcast AVM helper ───────────────────────────────────────────────────────

let _rentcastKey: string | null | undefined = undefined  // undefined = not yet loaded

async function getRentcastKey(): Promise<string | null> {
  if (_rentcastKey !== undefined) return _rentcastKey

  const secretArn = process.env.RENTCAST_SECRET_ARN
  if (!secretArn) { _rentcastKey = null; return null }

  try {
    const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
    const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }))
    const value = res.SecretString?.trim()
    _rentcastKey = (!value || value === 'REPLACE_ME') ? null : value
    return _rentcastKey
  } catch (err) {
    console.error('[units] Failed to load Rentcast key:', err)
    _rentcastKey = null
    return null
  }
}

interface AvmResult {
  price: number
  low: number
  high: number
}

async function fetchRentcastEstimate(address: string): Promise<AvmResult | null> {
  const key = await getRentcastKey()
  if (!key) return null

  try {
    const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}&propertyType=Condo`
    const resp = await fetch(url, { headers: { 'X-Api-Key': key, Accept: 'application/json' } })
    if (!resp.ok) {
      console.error(`[units] Rentcast AVM error ${resp.status}:`, await resp.text().catch(() => ''))
      return null
    }
    const data = await resp.json() as { price?: number; priceRangeLow?: number; priceRangeHigh?: number }
    if (!data.price) return null
    return { price: data.price, low: data.priceRangeLow ?? data.price, high: data.priceRangeHigh ?? data.price }
  } catch (err) {
    console.error('[units] Rentcast fetch failed:', err)
    return null
  }
}

/** GET /api/units — list all units with owner info */
export async function handleListUnits(hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can view all units')
  }
  const units = await repo.listUnits(hoaId)
  return r.ok(units)
}

/** POST /api/units — create a unit */
export async function handleCreateUnit(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can create units')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: {
    unitNumber?: string
    address?: string
    sqft?: number
    bedrooms?: number
    bathrooms?: number
    ownershipPercent?: number
  }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (!parsed.unitNumber?.trim()) return r.badRequest('unitNumber is required')

  const unit = await repo.createUnit(hoaId, {
    unitNumber: parsed.unitNumber.trim(),
    address: parsed.address?.trim(),
    sqft: parsed.sqft,
    bedrooms: parsed.bedrooms,
    bathrooms: parsed.bathrooms,
    ownershipPercent: parsed.ownershipPercent,
  })
  return r.created(unit)
}

/** PATCH /api/units/:unitId — update a unit */
export async function handleUpdateUnit(body: string | null, hoaId: string, unitId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can update units')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: {
    unitNumber?: string
    address?: string
    sqft?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    ownershipPercent?: number | null
  }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  const unit = await repo.updateUnit(hoaId, unitId, parsed)
  if (!unit) return r.notFound('Unit not found')
  return r.ok(unit)
}

/** DELETE /api/units/:unitId — delete a unit (board_admin only) */
export async function handleDeleteUnit(hoaId: string, unitId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin') {
    return r.forbidden('Only board admins can delete units')
  }

  await repo.deleteUnit(hoaId, unitId)
  return r.ok({ deleted: true })
}

/** POST /api/units/import — bulk import units from CSV or JSON array */
export async function handleImportUnits(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can import units')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: {
    csv?: string
    units?: Array<Record<string, string | number>>
  }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  type UnitRow = {
    unitNumber: string
    address?: string
    sqft?: number
    bedrooms?: number
    bathrooms?: number
    ownershipPercent?: number
  }

  let rows: UnitRow[] = []

  if (parsed.csv) {
    // Parse CSV text
    const lines = parsed.csv.trim().split(/\r?\n/)
    if (lines.length < 2) return r.badRequest('CSV must have a header row and at least one data row')

    const headers = lines[0].split(',').map(h =>
      h.trim().toLowerCase().replace(/[^a-z_]/g, '').replace(/\s+/g, '_'),
    )

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })

      // Accept multiple common column names
      const unitNumber =
        row['unitnumber'] || row['unit_number'] || row['unit'] || row['unit#'] || ''
      if (!unitNumber) continue

      const percent = row['ownershippercent'] || row['ownership_percent'] || row['percent'] || row['ownership'] || ''

      rows.push({
        unitNumber,
        address: row['address'] || undefined,
        sqft: row['sqft'] ? parseInt(row['sqft']) : undefined,
        bedrooms: row['bedrooms'] || row['beds'] ? parseInt(row['bedrooms'] || row['beds']) : undefined,
        bathrooms: row['bathrooms'] || row['baths'] ? parseFloat(row['bathrooms'] || row['baths']) : undefined,
        ownershipPercent: percent ? parseFloat(percent) : undefined,
      })
    }
  } else if (parsed.units && Array.isArray(parsed.units)) {
    rows = parsed.units.map(u => ({
      unitNumber: String(u['unitNumber'] || u['unit_number'] || u['unit'] || ''),
      address: u['address'] != null ? String(u['address']) : undefined,
      sqft: u['sqft'] != null ? Number(u['sqft']) : undefined,
      bedrooms: u['bedrooms'] != null ? Number(u['bedrooms']) : undefined,
      bathrooms: u['bathrooms'] != null ? Number(u['bathrooms']) : undefined,
      ownershipPercent: u['ownershipPercent'] != null ? Number(u['ownershipPercent']) : undefined,
    })).filter(u => u.unitNumber)
  }

  if (rows.length === 0) return r.badRequest('No valid units found in import data')

  const result = await repo.importUnits(hoaId, rows)
  return r.created(result)
}

/** GET /api/units/documents — list documents available for scanning */
export async function handleListDocumentsForScan(hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can scan documents')
  }
  const docs = await repo.listDocumentSummaries(hoaId)
  return r.ok(docs)
}

/** POST /api/units/scan-document — extract unit/resident data from an uploaded document */
export async function handleScanDocument(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can scan documents')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { documentId?: string }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }
  if (!parsed.documentId) return r.badRequest('documentId is required')

  const doc = await repo.getDocumentExtractedText(hoaId, parsed.documentId)
  if (!doc) return r.notFound('Document not found')
  if (!doc.extractedText?.trim()) {
    return r.badRequest(
      'This document has no extracted text. Only PDFs and plain-text files can be scanned. ' +
      'Try uploading a PDF version of the document.',
    )
  }

  const units = await extractUnitsFromDocument(doc.extractedText)
  return r.ok({ documentTitle: doc.title, unitCount: units.length, units })
}

// ── POST /api/units/:unitId/refresh-estimate ──────────────────────────────────

export async function handleRefreshUnitEstimate(
  hoaId: string,
  unitId: string,
  role: string,
): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can refresh estimates')
  }

  const unit = await repo.getUnitById(hoaId, unitId)
  if (!unit) return r.notFound('Unit not found')

  // Build the best available address string
  const address = unit.address?.trim()
  if (!address) {
    return r.badRequest('Unit has no address set — add an address before fetching an estimate.')
  }

  // Check if Rentcast is configured
  const key = await getRentcastKey()
  if (!key) {
    return r.ok({
      notConfigured: true,
      zillowUrl: `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/`,
      message: 'Rentcast API key not configured. Add RENTCAST_SECRET_ARN to the Lambda environment.',
    })
  }

  const estimate = await fetchRentcastEstimate(address)
  if (!estimate) {
    return r.ok({
      notFound: true,
      zillowUrl: `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/`,
      message: 'No estimate found for this address. The property may not be in the Rentcast database.',
    })
  }

  // Persist to DB
  await repo.updateUnitEstimate(unitId, hoaId, estimate.price, estimate.low, estimate.high)

  return r.ok({
    zestimate:    estimate.price,
    zestimateLow: estimate.low,
    zestimateHigh: estimate.high,
    zestimateAt:  new Date().toISOString(),
    zillowUrl:    `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/`,
  })
}
