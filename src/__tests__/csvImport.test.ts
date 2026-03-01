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
})
