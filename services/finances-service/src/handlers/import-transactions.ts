import * as r from '../../../shared/response'
import * as repo from '../repository'

/**
 * POST /api/finances/transactions/import
 * Body: { accountId: string, csv: string }
 * CSV format (header required):
 *   Date,Description,Amount,Type,Category,Vendor,Notes
 *   2025-01-15,City Water Utility,450.00,debit,Utilities,City Water,
 */
export async function handleImportTransactions(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can import transactions')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { accountId?: string; csv?: string }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (!parsed.accountId) return r.badRequest('accountId is required')
  if (!parsed.csv?.trim()) return r.badRequest('csv content is required')

  // Verify account belongs to HOA
  const account = await repo.getAccountById(hoaId, parsed.accountId)
  if (!account) return r.notFound('Account not found')

  const lines = parsed.csv.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return r.badRequest('CSV must have a header and at least one row')

  // Parse header to determine column positions
  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
  const col = (name: string) => header.indexOf(name)

  const dateIdx = col('date')
  const descIdx = col('description') !== -1 ? col('description') : col('memo')
  const amountIdx = col('amount')
  const typeIdx = col('type')
  const categoryIdx = col('category')
  const vendorIdx = col('vendor') !== -1 ? col('vendor') : col('payee')
  const notesIdx = col('notes') !== -1 ? col('notes') : col('note')

  if (dateIdx === -1) return r.badRequest('CSV must have a "Date" column')
  if (amountIdx === -1) return r.badRequest('CSV must have an "Amount" column')
  if (descIdx === -1) return r.badRequest('CSV must have a "Description" or "Memo" column')

  const dataLines = lines.slice(1)
  let imported = 0
  const errors: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const cols = parseCSVRow(dataLines[i])
    const rowNum = i + 2

    const dateStr = cols[dateIdx]?.trim()
    const description = cols[descIdx]?.trim()
    const amountStr = cols[amountIdx]?.trim()

    if (!dateStr || !amountStr) { errors.push(`Row ${rowNum}: missing date or amount`); continue }

    const amount = parseFloat(amountStr.replace(/[$,()-]/g, ''))
    if (isNaN(amount)) { errors.push(`Row ${rowNum}: invalid amount "${amountStr}"`); continue }

    // Determine type: negative amount = debit, positive = credit; or explicit type column
    let type: 'debit' | 'credit' = amount < 0 ? 'debit' : 'credit'
    if (typeIdx !== -1) {
      const t = cols[typeIdx]?.trim().toLowerCase()
      if (t === 'debit' || t === 'dr' || t === 'expense') type = 'debit'
      else if (t === 'credit' || t === 'cr' || t === 'income') type = 'credit'
    }

    const category = (categoryIdx !== -1 ? cols[categoryIdx]?.trim() : undefined) || 'Other'
    const vendor = vendorIdx !== -1 ? cols[vendorIdx]?.trim() || null : null
    const notes = notesIdx !== -1 ? cols[notesIdx]?.trim() || null : null

    // Normalize date
    const date = normalizeDate(dateStr)
    if (!date) { errors.push(`Row ${rowNum}: invalid date "${dateStr}"`); continue }

    try {
      await repo.createTransaction(hoaId, {
        accountId: parsed.accountId!,
        amount: Math.abs(amount),
        description: description || 'Imported transaction',
        vendor: vendor ?? undefined,
        category,
        date,
        type,
        notes: notes ?? undefined,
      })
      imported++
    } catch (err) {
      errors.push(`Row ${rowNum}: ${(err as Error).message}`)
    }
  }

  return r.ok({ imported, errors, total: dataLines.length })
}

function parseCSVRow(row: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { cols.push(current); current = '' }
    else { current += ch }
  }
  cols.push(current)
  return cols
}

function normalizeDate(raw: string): string | null {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // MM/DD/YYYY or M/D/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  }
  // DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  try { return new Date(raw).toISOString().split('T')[0] } catch { return null }
}
