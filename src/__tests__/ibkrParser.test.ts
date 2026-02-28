import { describe, it, expect } from 'vitest'
import { parseDateTime, parseAssetClass, parseLots } from '../lib/ibkr'

// ─── parseDateTime ──────────────────────────────────────────────────────────

describe('parseDateTime', () => {
  it('parses semicolon-separated format', () => {
    expect(parseDateTime('20240115;093045')).toBe('2024-01-15T09:30')
  })

  it('parses space-separated format', () => {
    expect(parseDateTime('20240115 093045')).toBe('2024-01-15T09:30')
  })

  it('parses afternoon times', () => {
    expect(parseDateTime('20240116;153000')).toBe('2024-01-16T15:30')
  })
})

// ─── parseAssetClass ─────────────────────────────────────────────────────────

describe('parseAssetClass', () => {
  it('maps STK to stock', () => expect(parseAssetClass('STK')).toBe('stock'))
  it('maps OPT to option', () => expect(parseAssetClass('OPT')).toBe('option'))
  it('maps FUT to futures', () => expect(parseAssetClass('FUT')).toBe('futures'))
  it('maps CASH to forex', () => expect(parseAssetClass('CASH')).toBe('forex'))
  it('maps CRYPTO to crypto', () => expect(parseAssetClass('CRYPTO')).toBe('crypto'))
  it('defaults unknown category to stock', () => expect(parseAssetClass('BOND')).toBe('stock'))
  it('is case-insensitive', () => expect(parseAssetClass('stk')).toBe('stock'))
})

// ─── parseLots ───────────────────────────────────────────────────────────────

function makeLotXml(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    symbol: 'AAPL',
    assetCategory: 'STK',
    openDateTime: '20240115;093045',
    dateTime: '20240116;103000',
    quantity: '-100',
    costBasisPrice: '150.00',
    tradePrice: '155.00',
    ibCommission: '-1.00',
    fifoPnlRealized: '499.00',
    transactionID: 'TX001',
    buySell: 'SELL',
  }
  const attrs = { ...defaults, ...overrides }
  const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')
  return `<?xml version="1.0"?><FlexQueryResponse><FlexStatements><FlexStatement><ClosedLots><ClosedLot ${attrStr} /></ClosedLots></FlexStatement></FlexStatements></FlexQueryResponse>`
}

describe('parseLots', () => {
  it('returns empty array for empty XML', () => {
    expect(parseLots('<?xml version="1.0"?><root/>')).toEqual([])
  })

  it('parses a single long trade (buySell=SELL)', () => {
    const lots = parseLots(makeLotXml())
    expect(lots).toHaveLength(1)
    const lot = lots[0]
    expect(lot.symbol).toBe('AAPL')
    expect(lot.buySell).toBe('SELL')
    expect(lot.quantity).toBe(100)            // absolute value
    expect(lot.costBasisPrice).toBe(150)
    expect(lot.tradePrice).toBe(155)
    expect(lot.ibCommission).toBe(1)          // absolute value
    expect(lot.transactionID).toBe('TX001')
    expect(lot.assetCategory).toBe('STK')
  })

  it('parses a short trade (buySell=BUY)', () => {
    const lots = parseLots(makeLotXml({ buySell: 'BUY', quantity: '100', costBasisPrice: '200', tradePrice: '190' }))
    expect(lots[0].buySell).toBe('BUY')
    expect(lots[0].quantity).toBe(100)
  })

  it('returns absolute quantity for negative qty', () => {
    const lots = parseLots(makeLotXml({ quantity: '-50' }))
    expect(lots[0].quantity).toBe(50)
  })

  it('returns absolute commission for negative ibCommission', () => {
    const lots = parseLots(makeLotXml({ ibCommission: '-2.50' }))
    expect(lots[0].ibCommission).toBe(2.5)
  })

  it('parses multiple lots', () => {
    const xml = `<?xml version="1.0"?><FlexQueryResponse><FlexStatements><FlexStatement><ClosedLots>
      <ClosedLot symbol="AAPL" assetCategory="STK" openDateTime="20240115;093045" dateTime="20240116;103000" quantity="-100" costBasisPrice="150" tradePrice="155" ibCommission="-1" fifoPnlRealized="499" transactionID="TX001" buySell="SELL" />
      <ClosedLot symbol="TSLA" assetCategory="STK" openDateTime="20240120;093045" dateTime="20240121;103000" quantity="-50" costBasisPrice="200" tradePrice="210" ibCommission="-1" fifoPnlRealized="499" transactionID="TX002" buySell="SELL" />
    </ClosedLots></FlexStatement></FlexStatements></FlexQueryResponse>`
    const lots = parseLots(xml)
    expect(lots).toHaveLength(2)
    expect(lots[0].symbol).toBe('AAPL')
    expect(lots[1].symbol).toBe('TSLA')
  })

  it('parses option asset category', () => {
    const lots = parseLots(makeLotXml({ assetCategory: 'OPT', symbol: 'AAPL 240115C00150000' }))
    expect(lots[0].assetCategory).toBe('OPT')
  })
})
