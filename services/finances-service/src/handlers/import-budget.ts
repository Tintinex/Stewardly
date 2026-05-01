import * as r from '../../../shared/response'
import * as repo from '../repository'

/**
 * POST /api/finances/budget/import
 * Accepts a CSV string in body:
 *   { fiscalYear: number, csv: string }
 * CSV format:
 *   Category,Description,Budgeted Amount
 *   Landscaping,Monthly lawn care,12000
 *   Utilities,Water and electricity,8500
 */
export async function handleImportBudget(body: string | null, hoaId: string, role: string): Promise<r.ApiResponse> {
  if (role !== 'board_admin' && role !== 'board_member') {
    return r.forbidden('Only board members can import budgets')
  }
  if (!body) return r.badRequest('Request body is required')

  let parsed: { fiscalYear?: number; csv?: string }
  try {
    parsed = JSON.parse(body)
  } catch {
    return r.badRequest('Invalid JSON')
  }

  if (!parsed.fiscalYear) return r.badRequest('fiscalYear is required')
  if (!parsed.csv?.trim()) return r.badRequest('csv content is required')

  const lines = parsed.csv.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return r.badRequest('CSV must have a header row and at least one data row')

  // Skip header row
  const dataLines = lines[0].toLowerCase().includes('category') ? lines.slice(1) : lines

  const lineItems: Array<{ category: string; description: string; budgetedAmount: number }> = []
  const errors: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const row = dataLines[i]
    // Handle quoted fields
    const cols = parseCSVRow(row)
    if (cols.length < 2) { errors.push(`Row ${i + 2}: not enough columns`); continue }

    const category = cols[0]?.trim()
    const descOrAmount = cols[1]?.trim()
    const maybeAmount = cols[2]?.trim()

    // Support 2-column (category, amount) or 3-column (category, description, amount)
    let description = ''
    let amountStr = ''

    if (maybeAmount !== undefined) {
      description = descOrAmount
      amountStr = maybeAmount
    } else {
      amountStr = descOrAmount
    }

    const amount = parseFloat(amountStr.replace(/[$,]/g, ''))
    if (!category) { errors.push(`Row ${i + 2}: category is empty`); continue }
    if (isNaN(amount) || amount < 0) { errors.push(`Row ${i + 2}: invalid amount "${amountStr}"`); continue }

    lineItems.push({ category, description, budgetedAmount: amount })
  }

  if (errors.length > 0 && lineItems.length === 0) {
    return r.badRequest(`CSV parsing failed: ${errors.join('; ')}`)
  }

  const budget = await repo.upsertBudgetWithLineItems(hoaId, {
    fiscalYear: parsed.fiscalYear,
    lineItems,
  })

  return r.ok({ budget, importedRows: lineItems.length, errors })
}

function parseCSVRow(row: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cols.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cols.push(current)
  return cols
}
