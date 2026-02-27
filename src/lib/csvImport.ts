import { Direction, AssetClass, DEFAULT_SETUP_TAGS } from '../types'

// ─── Public types ─────────────────────────────────────────────────────────────

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
  detectedFormat: string
}

// ─── Internal transaction type ────────────────────────────────────────────────

interface BrokerTx {
  ticker: string
  datetime: string
  action: 'buy' | 'sell'
  qty: number        // always positive
  price: number
  fees: number
  asset_class: AssetClass
}

// ─── CSV parsing utilities ────────────────────────────────────────────────────

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
  // Handle parentheses as negative: (1.23) → -1.23
  const cleaned = v.replace(/[$,%"]/g, '').replace(/\((.+)\)/, '-$1').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function parseAssetClass(v: string): AssetClass {
  const lower = v.toLowerCase()
  if (lower.includes('option') || lower.includes('opt')) return 'option'
  if (lower.includes('future') || lower.includes('fut')) return 'futures'
  if (lower.includes('forex') || lower.includes('fx')) return 'forex'
  if (lower.includes('crypto')) return 'crypto'
  return 'stock'
}

function toIso(v: string): string {
  if (!v) return new Date().toISOString()

  // Strip timezone offset (keep local time) e.g. 2024-01-15T09:32:15-0600
  const noTz = v.replace(/[+-]\d{2}:?\d{2}$/, '').trim()

  // "YYYY-MM-DD, HH:MM:SS" — IBKR style
  const ibkr = noTz.match(/^(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})$/)
  if (ibkr) {
    const d = new Date(`${ibkr[1]}T${ibkr[2]}`)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }

  // "MM/DD/YYYY [HH:MM:SS]" — TDA style
  const mdy = noTz.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(T|\s+)?(.*)$/)
  if (mdy) {
    const year = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3]
    const dateStr = `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
    const timeStr = mdy[5] ? `T${mdy[5].trim()}` : ''
    const d = new Date(dateStr + timeStr)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }

  // ISO-ish: 2026-02-26T09:35 or 2026-02-26 09:35
  const cleaned = noTz.replace(' ', 'T')
  const d = new Date(cleaned.length === 16 ? cleaned + ':00' : cleaned)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// ─── Format detection ─────────────────────────────────────────────────────────

type BrokerFormat = 'generic' | 'tastytrade' | 'tda' | 'ibkr' | 'unknown'

function detectFormat(firstLine: string, allLines: string[]): BrokerFormat {
  const h = firstLine.toLowerCase()

  // IBKR: multi-section report — look for "Trades,Header" row anywhere
  if (h.startsWith('statement') || allLines.some(l => l.toLowerCase().startsWith('trades,header'))) {
    return 'ibkr'
  }

  // Tastytrade: has "Instrument Type" and "Action" columns
  if (h.includes('instrument type') || (h.includes('action') && h.includes('average price'))) {
    return 'tastytrade'
  }

  // TD Ameritrade: has "TRANSACTION ID" column
  if (h.includes('transaction id') || h.includes('transactionid')) {
    return 'tda'
  }

  // Generic TJ format
  if (h.includes('ticker') && (h.includes('entry_price') || h.includes('entry price'))) {
    return 'generic'
  }

  return 'unknown'
}

// ─── Tastytrade parser ────────────────────────────────────────────────────────

function parseTastytrade(lines: string[]): { txs: BrokerTx[]; errors: string[] } {
  const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase().trim())
  const txs: BrokerTx[] = []
  const errors: string[] = []

  const get = (row: string[], name: string) => {
    const idx = headers.indexOf(name)
    return idx >= 0 ? (row[idx] ?? '') : ''
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i])

    // Only process equity trades
    const type = get(row, 'type').toLowerCase()
    if (type !== 'trade') continue

    const instrumentType = get(row, 'instrument type').toLowerCase()
    if (instrumentType && !instrumentType.includes('equity') && !instrumentType.includes('stock')) continue

    const action = get(row, 'action').toLowerCase()
    const isBuy = action.includes('buy')
    const isSell = action.includes('sell')
    if (!isBuy && !isSell) continue

    const ticker = get(row, 'symbol').toUpperCase()
    if (!ticker) continue

    const qty = parseNum(get(row, 'quantity'))
    const price = parseNum(get(row, 'average price'))
    if (!qty || !price || qty <= 0 || price <= 0) continue

    const commissions = Math.abs(parseNum(get(row, 'commissions')) ?? 0)
    const fees = Math.abs(parseNum(get(row, 'fees')) ?? 0)

    txs.push({
      ticker,
      datetime: toIso(get(row, 'date')),
      action: isBuy ? 'buy' : 'sell',
      qty: Math.abs(qty),
      price,
      fees: commissions + fees,
      asset_class: 'stock',
    })
  }

  return { txs, errors }
}

// ─── TD Ameritrade parser ─────────────────────────────────────────────────────

function parseTDA(lines: string[]): { txs: BrokerTx[]; errors: string[] } {
  // Skip any non-header rows at the top
  let headerIdx = 0
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase()
    if (lower.includes('symbol') || lower.includes('transaction')) {
      headerIdx = i
      break
    }
  }

  const headers = parseCsvRow(lines[headerIdx]).map(h => h.toLowerCase().trim())
  const txs: BrokerTx[] = []
  const errors: string[] = []

  const get = (row: string[], name: string) => {
    const idx = headers.findIndex(h => h.includes(name))
    return idx >= 0 ? (row[idx] ?? '') : ''
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i])
    if (row.length < 4) continue

    const symbol = get(row, 'symbol').toUpperCase().trim()
    if (!symbol) continue

    const description = get(row, 'description').toLowerCase()
    const qtyRaw = parseNum(get(row, 'quantity'))
    if (qtyRaw === null || qtyRaw === 0) continue

    // Determine direction: qty sign or description keywords
    const isBuy = qtyRaw > 0 || description.includes('bought')
    const isSell = qtyRaw < 0 || description.includes('sold')
    if (!isBuy && !isSell) continue

    const price = parseNum(get(row, 'price'))
    if (!price || price <= 0) continue

    const commission = Math.abs(parseNum(get(row, 'commission')) ?? 0)
    const dateStr = get(row, 'date')

    txs.push({
      ticker: symbol,
      datetime: toIso(dateStr),
      action: isBuy ? 'buy' : 'sell',
      qty: Math.abs(qtyRaw),
      price,
      fees: commission,
      asset_class: 'stock',
    })
  }

  return { txs, errors }
}

// ─── IBKR parser ──────────────────────────────────────────────────────────────

function parseIBKR(lines: string[]): { txs: BrokerTx[]; errors: string[] } {
  const txs: BrokerTx[] = []
  const errors: string[] = []
  let tradeHeaders: string[] = []

  for (const line of lines) {
    const row = parseCsvRow(line)
    const section = row[0]?.toLowerCase()
    const rowType = row[1]?.toLowerCase()

    if (section === 'trades' && rowType === 'header') {
      tradeHeaders = row.map(h => h.toLowerCase().trim())
      continue
    }

    if (section === 'trades' && rowType === 'data') {
      if (tradeHeaders.length === 0) continue

      const get = (name: string) => {
        const idx = tradeHeaders.indexOf(name)
        return idx >= 0 ? (row[idx] ?? '') : ''
      }

      const assetCategory = get('asset category').toLowerCase()
      if (!assetCategory.includes('stock') && !assetCategory.includes('equit')) continue

      const symbol = get('symbol').toUpperCase()
      if (!symbol) continue

      const qtyRaw = parseNum(get('quantity'))
      if (qtyRaw === null || qtyRaw === 0) continue

      const price = parseNum(get('t. price'))
      if (!price || price <= 0) continue

      const commFee = parseNum(get('comm/fee')) ?? 0

      txs.push({
        ticker: symbol,
        datetime: toIso(get('date/time')),
        action: qtyRaw > 0 ? 'buy' : 'sell',
        qty: Math.abs(qtyRaw),
        price,
        fees: Math.abs(commFee),
        asset_class: 'stock',
      })
    }
  }

  return { txs, errors }
}

// ─── FIFO grouping: transactions → round-trip trades ─────────────────────────

function buildTrade(
  ticker: string,
  entryTxs: BrokerTx[],
  exitTxs: BrokerTx[],
  direction: Direction,
): ParsedTrade {
  const totalEntryQty = entryTxs.reduce((s, t) => s + t.qty, 0)
  const totalExitQty = exitTxs.reduce((s, t) => s + t.qty, 0)
  const qty = Math.min(totalEntryQty, totalExitQty)

  const avgEntry = entryTxs.reduce((s, t) => s + t.price * t.qty, 0) / totalEntryQty
  const avgExit = exitTxs.reduce((s, t) => s + t.price * t.qty, 0) / totalExitQty
  const totalFees = [...entryTxs, ...exitTxs].reduce((s, t) => s + t.fees, 0)

  return {
    ticker,
    direction,
    asset_class: entryTxs[0].asset_class,
    entry_price: Math.round(avgEntry * 10000) / 10000,
    exit_price: Math.round(avgExit * 10000) / 10000,
    quantity: qty,
    fees: Math.round(totalFees * 100) / 100,
    entry_time: entryTxs[0].datetime,
    exit_time: exitTxs[exitTxs.length - 1].datetime,
    notes: '',
    setup_tag_id: '',
    stop_price: null,
    target_price: null,
    _rowNum: 0,
    _errors: [],
  }
}

function groupIntoTrades(txs: BrokerTx[]): { trades: ParsedTrade[]; errors: string[] } {
  txs.sort((a, b) => a.datetime.localeCompare(b.datetime))

  const byTicker = new Map<string, BrokerTx[]>()
  for (const tx of txs) {
    const arr = byTicker.get(tx.ticker) ?? []
    arr.push(tx)
    byTicker.set(tx.ticker, arr)
  }

  const trades: ParsedTrade[] = []
  const errors: string[] = []

  for (const [ticker, tickerTxs] of byTicker) {
    let posQty = 0
    let posDir: Direction | null = null
    let entryTxs: BrokerTx[] = []
    let exitTxs: BrokerTx[] = []

    for (const tx of tickerTxs) {
      if (posQty === 0) {
        posDir = tx.action === 'buy' ? 'long' : 'short'
        entryTxs = [tx]
        exitTxs = []
        posQty = tx.qty
      } else if (posDir === 'long') {
        if (tx.action === 'buy') {
          // Adding to long (pyramid)
          entryTxs.push(tx)
          posQty += tx.qty
        } else {
          // Closing long
          exitTxs.push(tx)
          posQty -= tx.qty
          if (posQty <= 0) {
            trades.push(buildTrade(ticker, entryTxs, exitTxs, 'long'))
            if (posQty < 0) {
              // Flipped short
              const excess = Math.abs(posQty)
              posDir = 'short'
              entryTxs = [{ ...tx, qty: excess }]
              exitTxs = []
              posQty = excess
            } else {
              posQty = 0; posDir = null; entryTxs = []; exitTxs = []
            }
          }
        }
      } else if (posDir === 'short') {
        if (tx.action === 'sell') {
          // Adding to short
          entryTxs.push(tx)
          posQty += tx.qty
        } else {
          // Covering short
          exitTxs.push(tx)
          posQty -= tx.qty
          if (posQty <= 0) {
            trades.push(buildTrade(ticker, entryTxs, exitTxs, 'short'))
            if (posQty < 0) {
              // Flipped long
              const excess = Math.abs(posQty)
              posDir = 'long'
              entryTxs = [{ ...tx, qty: excess }]
              exitTxs = []
              posQty = excess
            } else {
              posQty = 0; posDir = null; entryTxs = []; exitTxs = []
            }
          }
        }
      }
    }

    if (posQty > 0) {
      errors.push(`${ticker}: ${posQty} shares still open (no matching exit) — skipped`)
    }
  }

  trades.sort((a, b) => b.entry_time.localeCompare(a.entry_time))
  return { trades, errors }
}

// ─── Generic TJ format parser ─────────────────────────────────────────────────

function parseGenericRow(row: Record<string, string>, rowNum: number): ParsedTrade {
  const errors: string[] = []

  const ticker = (row['ticker'] ?? '').toUpperCase()
  if (!ticker) errors.push('Missing ticker')

  const dl = (row['direction'] ?? '').toLowerCase()
  let direction: Direction | null = null
  if (dl === 'long' || dl === 'buy' || dl === 'b') direction = 'long'
  else if (dl === 'short' || dl === 'sell' || dl === 's') direction = 'short'
  if (!direction) errors.push('Invalid direction (use long/short)')

  const entry_price = parseNum(row['entry_price'] ?? '')
  if (entry_price === null) errors.push('Invalid entry_price')

  const exit_price = parseNum(row['exit_price'] ?? '')
  if (exit_price === null) errors.push('Invalid exit_price')

  const quantity = parseNum(row['quantity'] ?? '')
  if (quantity === null) errors.push('Invalid quantity')

  const entry_time = toIso(row['entry_time'] ?? '')
  const exit_time = toIso(row['exit_time'] ?? row['entry_time'] ?? '')

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

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseCsv(text: string): ImportResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return { trades: [], skipped: 0, errors: ['File has no data rows'], detectedFormat: 'Unknown' }
  }

  const format = detectFormat(lines[0], lines)

  // ── Broker formats ──────────────────────────────────────────────────────────
  if (format === 'tastytrade' || format === 'tda' || format === 'ibkr') {
    const formatName = format === 'tastytrade' ? 'Tastytrade'
      : format === 'tda' ? 'TD Ameritrade'
      : 'IBKR'

    const { txs, errors: parseErrors } = format === 'tastytrade' ? parseTastytrade(lines)
      : format === 'tda' ? parseTDA(lines)
      : parseIBKR(lines)

    if (txs.length === 0) {
      return {
        trades: [],
        skipped: 0,
        errors: [`No equity transactions found in ${formatName} export.`, ...parseErrors],
        detectedFormat: formatName,
      }
    }

    const { trades, errors: groupErrors } = groupIntoTrades(txs)
    return {
      trades,
      skipped: groupErrors.length,
      errors: [...parseErrors, ...groupErrors],
      detectedFormat: formatName,
    }
  }

  // ── Generic TJ format ───────────────────────────────────────────────────────
  if (format === 'generic') {
    const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase().trim())
    const trades: ParsedTrade[] = []
    const errors: string[] = []
    let skipped = 0

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvRow(lines[i])
      const row: Record<string, string> = {}
      headers.forEach((h, j) => { row[h] = values[j] ?? '' })

      const parsed = parseGenericRow(row, i + 1)
      if (parsed._errors.length > 0) {
        errors.push(`Row ${i + 1} (${parsed.ticker || '?'}): ${parsed._errors.join(', ')}`)
        skipped++
      } else {
        trades.push(parsed)
      }
    }

    return { trades, skipped, errors, detectedFormat: 'Trade Journal' }
  }

  // ── Unknown ─────────────────────────────────────────────────────────────────
  return {
    trades: [],
    skipped: 0,
    errors: ['Unrecognized format. Supported: Tastytrade, TD Ameritrade, IBKR, or Trade Journal template.'],
    detectedFormat: 'Unknown',
  }
}
