import { Direction, AssetClass, DEFAULT_SETUP_TAGS } from '../types'

export interface ParsedTrade {
  ticker: string
  direction: Direction
  asset_class: AssetClass
  entry_price: number
  exit_price: number
  quantity: number
  fees: number
  entry_time: string
  exit_time: string
  notes: string
  setup_tag_id: string
  stop_price: number | null
  target_price: number | null
  _rowNum: number
  _errors: string[]
}

export interface ImportResult {
  trades: ParsedTrade[]
  skipped: number
  errors: string[]
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur.trim()); cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

function parseNum(v: string): number | null {
  const n = parseFloat(v.replace(/[$,%]/g, ''))
  return isNaN(n) ? null : n
}

function parseDirection(v: string): Direction | null {
  const lower = v.toLowerCase()
  if (lower === 'long' || lower === 'buy' || lower === 'b') return 'long'
  if (lower === 'short' || lower === 'sell' || lower === 's') return 'short'
  return null
}

function parseAssetClass(v: string): AssetClass {
  const lower = v.toLowerCase()
  if (lower === 'option' || lower === 'options' || lower === 'opt') return 'option'
  if (lower === 'futures' || lower === 'future' || lower === 'fut') return 'futures'
  if (lower === 'forex' || lower === 'fx') return 'forex'
  if (lower === 'crypto' || lower === 'cryptocurrency') return 'crypto'
  return 'stock'
}

function normalizeDateTime(v: string): string {
  if (!v) return new Date().toISOString()
  // Already ISO-ish: 2026-02-26T09:35 or 2026-02-26 09:35
  const cleaned = v.replace(' ', 'T')
  // Add seconds if missing
  const d = new Date(cleaned.length === 16 ? cleaned + ':00' : cleaned)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function mapGenericRow(row: Record<string, string>, rowNum: number): ParsedTrade {
  const errors: string[] = []

  const ticker = (row['ticker'] ?? '').toUpperCase()
  if (!ticker) errors.push('Missing ticker')

  const direction = parseDirection(row['direction'] ?? '')
  if (!direction) errors.push('Invalid direction (use long/short)')

  const entry_price = parseNum(row['entry_price'] ?? '')
  if (entry_price === null) errors.push('Invalid entry_price')

  const exit_price = parseNum(row['exit_price'] ?? '')
  if (exit_price === null) errors.push('Invalid exit_price')

  const quantity = parseNum(row['quantity'] ?? '')
  if (quantity === null) errors.push('Invalid quantity')

  const entry_time = normalizeDateTime(row['entry_time'] ?? '')
  const exit_time = normalizeDateTime(row['exit_time'] ?? row['entry_time'] ?? '')

  const setupName = (row['setup_tag'] ?? '').toLowerCase()
  const setup_tag_id = DEFAULT_SETUP_TAGS.find(t => t.name.toLowerCase() === setupName)?.id ?? ''

  return {
    ticker,
    direction: direction ?? 'long',
    asset_class: parseAssetClass(row['asset_class'] ?? ''),
    entry_price: entry_price ?? 0,
    exit_price: exit_price ?? 0,
    quantity: quantity ?? 0,
    fees: parseNum(row['fees'] ?? '') ?? 0,
    entry_time,
    exit_time,
    notes: row['notes'] ?? '',
    setup_tag_id,
    stop_price: parseNum(row['stop_price'] ?? ''),
    target_price: parseNum(row['target_price'] ?? ''),
    _rowNum: rowNum,
    _errors: errors,
  }
}

export function parseCsv(text: string): ImportResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return { trades: [], skipped: 0, errors: ['File has no data rows'] }
  }

  const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase().trim())
  const isGenericTJ = headers.includes('ticker') && headers.includes('entry_price')

  if (!isGenericTJ) {
    return {
      trades: [],
      skipped: 0,
      errors: [
        'Unrecognized CSV format. Download the template from this dialog and use it to format your data.',
      ],
    }
  }

  const trades: ParsedTrade[] = []
  const errors: string[] = []
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, j) => { row[h] = values[j] ?? '' })

    const parsed = mapGenericRow(row, i + 1)

    if (parsed._errors.length > 0) {
      errors.push(`Row ${i + 1} (${parsed.ticker || '?'}): ${parsed._errors.join(', ')}`)
      skipped++
    } else {
      trades.push(parsed)
    }
  }

  return { trades, skipped, errors }
}
