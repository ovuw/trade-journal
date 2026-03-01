import { describe, it, expect } from 'vitest'
import { parseCsv } from '../lib/csvImport'

// ─── IBKR Activity Statement helpers ─────────────────────────────────────────

function makeIbkrCsv(tradeRows: string): string {
  return [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,BrokerName,Interactive Brokers LLC',
    'Statement,Data,Title,Activity Statement',
    'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
    ...tradeRows.trim().split('\n'),
    'Trades,Data,SubTotal,,,,,,,,,,,,,',
    'Trades,Data,Total,,,,,,,,,,,,,',
  ].join('\n')
}

const IBKR_BUY =
  'Trades,Data,Order,Stocks,USD,AAPL,"2024-01-15, 09:32:15",100,150.00,185.50,-15000.00,-1.00,15001.00,0,0,O'
const IBKR_SELL_ORDER =
  'Trades,Data,Order,Stocks,USD,AAPL,"2024-01-20, 10:15:00",-100,155.00,155.00,15500.00,-1.00,15001.00,498.00,0,C'
// Lot rows — cost-basis accounting rows that IBKR appends after a closing Order row.
// They show the original buy fill details (positive qty, opening price) and must NOT
// be treated as real buy transactions.
const IBKR_SELL_LOT1 =
  'Trades,Data,Lot,Stocks,USD,AAPL,"2024-01-15, 09:32:15",50,150.00,155.00,7500.00,-0.50,7500.50,249.50,0,C'
const IBKR_SELL_LOT2 =
  'Trades,Data,Lot,Stocks,USD,AAPL,"2024-01-15, 09:32:15",50,150.00,155.00,7500.00,-0.50,7500.50,249.50,0,C'

// ─── IBKR: basic round-trip (no Lot rows) ─────────────────────────────────────

describe('parseCsv — IBKR format', () => {
  it('detects IBKR format', () => {
    const csv = makeIbkrCsv(`${IBKR_BUY}\n${IBKR_SELL_ORDER}`)
    expect(parseCsv(csv).detectedFormat).toBe('IBKR')
  })

  it('parses a basic closed trade (buy then sell)', () => {
    const csv = makeIbkrCsv(`${IBKR_BUY}\n${IBKR_SELL_ORDER}`)
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    const t = result.trades[0]
    expect(t.ticker).toBe('AAPL')
    expect(t.direction).toBe('long')
    expect(t.exit_price).not.toBeNull()
    expect(result.orphanedSells).toHaveLength(0)
  })

  it('treats a sell with no prior buy as orphaned', () => {
    const csv = makeIbkrCsv(IBKR_SELL_ORDER)
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(0)
    expect(result.orphanedSells).toHaveLength(1)
  })

  // ─── The key regression: Lot rows must NOT create open positions ──────────

  it('ignores Lot rows — trade still closes when DataDiscriminator=Lot rows are present', () => {
    // IBKR appends Lot rows after each closing Order row. Without the fix these
    // would be misread as buy transactions, keeping posQty > 0 and producing an
    // open position instead of a closed trade.
    const csv = makeIbkrCsv(
      [IBKR_BUY, IBKR_SELL_ORDER, IBKR_SELL_LOT1, IBKR_SELL_LOT2].join('\n'),
    )
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exit_price).not.toBeNull()   // closed, not open
    expect(result.orphanedSells).toHaveLength(0)
  })

  it('ignores SubTotal and Total rows', () => {
    // SubTotal/Total rows are always added in makeIbkrCsv; verify they don't
    // appear as extra trades or orphaned sells.
    const csv = makeIbkrCsv(`${IBKR_BUY}\n${IBKR_SELL_ORDER}`)
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.orphanedSells).toHaveLength(0)
  })

  it('handles multiple round trips for the same ticker', () => {
    const buy2 =
      'Trades,Data,Order,Stocks,USD,AAPL,"2024-02-01, 09:35:00",50,160.00,170.00,-8000.00,-0.50,8000.50,0,0,O'
    const sell2 =
      'Trades,Data,Order,Stocks,USD,AAPL,"2024-02-10, 14:20:00",-50,165.00,165.00,8250.00,-0.50,8000.50,249.00,0,C'
    const csv = makeIbkrCsv(
      [IBKR_BUY, IBKR_SELL_ORDER, IBKR_SELL_LOT1, IBKR_SELL_LOT2, buy2, sell2].join('\n'),
    )
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(2)
    expect(result.trades.every(t => t.exit_price !== null)).toBe(true)
  })

  it('handles two different tickers', () => {
    const tslaBuy =
      'Trades,Data,Order,Stocks,USD,TSLA,"2024-01-16, 09:40:00",50,200.00,220.00,-10000.00,-1.00,10001.00,0,0,O'
    const tslaSell =
      'Trades,Data,Order,Stocks,USD,TSLA,"2024-01-25, 10:30:00",-50,210.00,220.00,10500.00,-1.00,10001.00,498.00,0,C'
    const csv = makeIbkrCsv(
      [IBKR_BUY, IBKR_SELL_ORDER, tslaBuy, tslaSell].join('\n'),
    )
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(2)
    expect(result.trades.every(t => t.exit_price !== null)).toBe(true)
  })

  it('returns open position when buy has no matching sell', () => {
    const csv = makeIbkrCsv(IBKR_BUY)
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exit_price).toBeNull()
  })

  it('aggregates buy and sell commissions into total fees', () => {
    // IBKR_BUY has Comm/Fee=-1.00, IBKR_SELL_ORDER has Comm/Fee=-1.00 → total 2.00
    const csv = makeIbkrCsv(`${IBKR_BUY}\n${IBKR_SELL_ORDER}`)
    const result = parseCsv(csv)
    expect(result.trades[0].fees).toBe(2)
  })

  it('populates exit_lots with per-fill qty and price', () => {
    const csv = makeIbkrCsv(`${IBKR_BUY}\n${IBKR_SELL_ORDER}`)
    const result = parseCsv(csv)
    const t = result.trades[0]
    expect(t.exit_lots).toHaveLength(1)
    expect(t.exit_lots![0].qty).toBe(100)
    expect(t.exit_lots![0].price).toBe(155)
  })

  it('accumulates two exit fills into separate exit_lots', () => {
    const sell1 =
      'Trades,Data,Order,Stocks,USD,AAPL,"2024-01-20, 10:15:00",-50,155.00,155.00,7750.00,-0.50,7500.00,249.50,0,C'
    const sell2 =
      'Trades,Data,Order,Stocks,USD,AAPL,"2024-01-20, 14:30:00",-50,160.00,160.00,8000.00,-0.50,7500.00,499.50,0,C'
    const csv = makeIbkrCsv(`${IBKR_BUY}\n${sell1}\n${sell2}`)
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exit_lots).toHaveLength(2)
    expect(result.trades[0].exit_price).not.toBeNull()
  })
})

// ─── Generic TJ format ────────────────────────────────────────────────────────

function makeGenericCsv(rows: string[]): string {
  return [
    'ticker,direction,entry_price,exit_price,quantity,entry_time,exit_time,fees,notes',
    ...rows,
  ].join('\n')
}

describe('parseCsv — generic TJ format', () => {
  it('detects generic format', () => {
    const csv = makeGenericCsv(['AAPL,long,150,160,100,2024-01-15T09:30,2024-01-20T10:00,2,'])
    expect(parseCsv(csv).detectedFormat).toBe('Trade Journal')
  })

  it('parses a valid row', () => {
    const csv = makeGenericCsv(['AAPL,long,150,160,100,2024-01-15T09:30,2024-01-20T10:00,2,'])
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.skipped).toBe(0)
    const t = result.trades[0]
    expect(t.ticker).toBe('AAPL')
    expect(t.direction).toBe('long')
    expect(t.entry_price).toBe(150)
    expect(t.exit_price).toBe(160)
    expect(t.quantity).toBe(100)
    expect(t.fees).toBe(2)
  })

  it('skips row with missing ticker', () => {
    const csv = makeGenericCsv([',long,150,160,100,2024-01-15T09:30,2024-01-20T10:00,0,'])
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toMatch(/Missing ticker/)
  })

  it('skips row with invalid direction', () => {
    const csv = makeGenericCsv(['AAPL,sideways,150,160,100,2024-01-15T09:30,2024-01-20T10:00,0,'])
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toMatch(/Invalid direction/)
  })

  it('skips row with invalid entry_price', () => {
    const csv = makeGenericCsv(['AAPL,long,abc,160,100,2024-01-15T09:30,2024-01-20T10:00,0,'])
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toMatch(/Invalid entry_price/)
  })

  it('accepts direction aliases: buy/sell/b/s', () => {
    const rows = [
      'AAPL,buy,150,160,100,2024-01-15T09:30,2024-01-20T10:00,0,',
      'TSLA,sell,200,190,50,2024-01-16T09:30,2024-01-21T10:00,0,',
      'MSFT,b,300,310,10,2024-01-17T09:30,2024-01-22T10:00,0,',
      'NVDA,s,400,390,5,2024-01-18T09:30,2024-01-23T10:00,0,',
    ]
    const result = parseCsv(makeGenericCsv(rows))
    expect(result.trades).toHaveLength(4)
    expect(result.trades.map(t => t.direction)).toEqual(['long', 'short', 'long', 'short'])
  })

  it('handles quoted notes field with embedded comma', () => {
    // Tests parseCsvRow: quoted fields containing commas must not split
    const csv = makeGenericCsv(['AAPL,long,150,160,100,2024-01-15T09:30,2024-01-20T10:00,2,"broke rule, sold early"'])
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].notes).toBe('broke rule, sold early')
  })

  it('handles fees with parentheses negative notation', () => {
    // Tests parseNum: "(2.00)" → -2
    const csv = makeGenericCsv(['AAPL,long,150,160,100,2024-01-15T09:30,2024-01-20T10:00,(2.00),'])
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].fees).toBe(-2)
  })

  it('counts skipped rows separately from valid rows', () => {
    const csv = makeGenericCsv([
      'AAPL,long,150,160,100,2024-01-15T09:30,2024-01-20T10:00,0,',
      ',long,150,160,100,2024-01-15T09:30,2024-01-20T10:00,0,',
    ])
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    expect(result.skipped).toBe(1)
  })
})

// ─── parseCsv — edge cases ────────────────────────────────────────────────────

describe('parseCsv — edge cases', () => {
  it('returns error for empty string', () => {
    const result = parseCsv('')
    expect(result.trades).toHaveLength(0)
    expect(result.errors[0]).toMatch(/no data/i)
  })

  it('returns error for single header line (no data rows)', () => {
    const result = parseCsv('ticker,direction,entry_price,exit_price,quantity')
    expect(result.trades).toHaveLength(0)
    expect(result.errors[0]).toMatch(/no data/i)
  })

  it('returns Unknown format for unrecognized CSV structure', () => {
    const result = parseCsv('date,symbol,price\n2024-01-15,AAPL,150')
    expect(result.detectedFormat).toBe('Unknown')
    expect(result.errors[0]).toMatch(/Unrecognized format/)
  })
})

// ─── Tastytrade format ────────────────────────────────────────────────────────

describe('parseCsv — Tastytrade format', () => {
  const TT_HEADER = 'Date,Type,Action,Symbol,Instrument Type,Quantity,Average Price,Commissions,Fees'
  const TT_BUY = '2024-01-15,Trade,Buy to Open,AAPL,Equity,100,150.00,-1.00,-0.10'
  const TT_SELL = '2024-01-20,Trade,Sell to Close,AAPL,Equity,100,160.00,-1.00,-0.10'

  it('detects Tastytrade format via Instrument Type column', () => {
    const csv = [TT_HEADER, TT_BUY, TT_SELL].join('\n')
    expect(parseCsv(csv).detectedFormat).toBe('Tastytrade')
  })

  it('parses a Tastytrade buy-sell round trip', () => {
    const csv = [TT_HEADER, TT_BUY, TT_SELL].join('\n')
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
    const t = result.trades[0]
    expect(t.ticker).toBe('AAPL')
    expect(t.direction).toBe('long')
    expect(t.entry_price).toBe(150)
    expect(t.exit_price).toBe(160)
  })

  it('skips non-Trade rows', () => {
    const dividend = '2024-01-16,Dividend,,,Equity,,,,'
    const csv = [TT_HEADER, TT_BUY, dividend, TT_SELL].join('\n')
    const result = parseCsv(csv)
    expect(result.trades).toHaveLength(1)
  })
})

// ─── TD Ameritrade format ─────────────────────────────────────────────────────

describe('parseCsv — TD Ameritrade format', () => {
  it('detects TDA format via TRANSACTION ID column', () => {
    const csv = [
      'DATE,TRANSACTION ID,DESCRIPTION,QUANTITY,SYMBOL,PRICE,COMMISSION',
      '01/15/2024,123456789,Bought 100 AAPL @ 150.00,100,AAPL,150.00,-1.00',
    ].join('\n')
    expect(parseCsv(csv).detectedFormat).toBe('TD Ameritrade')
  })

  it('parses a TDA buy-sell round trip', () => {
    const header = 'DATE,TRANSACTION ID,DESCRIPTION,QUANTITY,SYMBOL,PRICE,COMMISSION'
    const buy = '01/15/2024,111,Bought 100 AAPL @ 150.00,100,AAPL,150.00,-1.00'
    const sell = '01/20/2024,222,Sold 100 AAPL @ 160.00,-100,AAPL,160.00,-1.00'
    const result = parseCsv([header, buy, sell].join('\n'))
    expect(result.trades).toHaveLength(1)
    const t = result.trades[0]
    expect(t.ticker).toBe('AAPL')
    expect(t.direction).toBe('long')
    expect(t.entry_price).toBe(150)
    expect(t.exit_price).toBe(160)
  })
})
