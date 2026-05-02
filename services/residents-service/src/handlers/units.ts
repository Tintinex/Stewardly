import * as r from '../../../shared/response'
import * as repo from '../repository'

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
