import { describe, it, expect } from 'vitest'
import { calcPnl, calcResultPct, calcPartialPnl, calcRealizedQty, calcWeightedAvgExit, detectSession } from '../lib/tradeUtils'

// ─── P&L calculation ──────────────────────────────────────────────────────────

describe('calcPnl', () => {
  describe('long trades', () => {
    it('wins when price rises', () => {
      expect(calcPnl('long', 100, 110, 10)).toBe(100)
    })

    it('loses when price falls', () => {
      expect(calcPnl('long', 100, 90, 10)).toBe(-100)
    })

    it('breaks even at same price', () => {
      expect(calcPnl('long', 100, 100, 10)).toBe(0)
    })
  })

  describe('short trades', () => {
    it('wins when price falls', () => {
      expect(calcPnl('short', 100, 90, 10)).toBe(100)
    })

    it('loses when price rises', () => {
      expect(calcPnl('short', 100, 110, 10)).toBe(-100)
    })

    it('breaks even at same price', () => {
      expect(calcPnl('short', 100, 100, 10)).toBe(0)
    })
  })

  describe('fees', () => {
    it('subtracts fees from long profit', () => {
      expect(calcPnl('long', 100, 110, 10, 5)).toBe(95)
    })

    it('increases long loss with fees', () => {
      expect(calcPnl('long', 100, 90, 10, 5)).toBe(-105)
    })

    it('subtracts fees from short profit', () => {
      expect(calcPnl('short', 100, 90, 10, 5)).toBe(95)
    })

    it('defaults fees to 0 when not provided', () => {
      expect(calcPnl('long', 100, 110, 10)).toBe(calcPnl('long', 100, 110, 10, 0))
    })
  })

  describe('fractional shares', () => {
    it('handles decimal quantity', () => {
      expect(calcPnl('long', 100, 110, 0.5)).toBeCloseTo(5)
    })

    it('handles fractional prices', () => {
      expect(calcPnl('long', 100.50, 101.50, 100)).toBeCloseTo(100)
    })
  })
})

// ─── Result % ─────────────────────────────────────────────────────────────────

describe('calcResultPct', () => {
  it('returns correct percent for winning long', () => {
    const pnl = calcPnl('long', 100, 110, 10)  // +100
    expect(calcResultPct(pnl, 100, 10)).toBeCloseTo(10)
  })

  it('returns negative percent for losing trade', () => {
    const pnl = calcPnl('long', 100, 90, 10)  // -100
    expect(calcResultPct(pnl, 100, 10)).toBeCloseTo(-10)
  })

  it('returns 0 when entry price is 0 (avoids divide-by-zero)', () => {
    expect(calcResultPct(100, 0, 10)).toBe(0)
  })

  it('returns 0 for breakeven trade', () => {
    const pnl = calcPnl('long', 100, 100, 10)
    expect(calcResultPct(pnl, 100, 10)).toBe(0)
  })
})

// ─── calcPartialPnl ───────────────────────────────────────────────────────────

describe('calcPartialPnl', () => {
  it('matches calcPnl for single full-position lot', () => {
    const lots = [{ qty: 100, price: 110 }]
    expect(calcPartialPnl('long', 100, lots)).toBe(calcPnl('long', 100, 110, 100))
  })

  it('aggregates two exit lots correctly (long)', () => {
    // 50 shares @ 110 = +$500, 50 shares @ 120 = +$1000, total = +$1500
    const lots = [{ qty: 50, price: 110 }, { qty: 50, price: 120 }]
    expect(calcPartialPnl('long', 100, lots)).toBe(1500)
  })

  it('aggregates two exit lots correctly (short)', () => {
    // entry 100, exit 90 × 50 = +$500, exit 80 × 50 = +$1000
    const lots = [{ qty: 50, price: 90 }, { qty: 50, price: 80 }]
    expect(calcPartialPnl('short', 100, lots)).toBe(1500)
  })

  it('deducts fees from aggregate', () => {
    const lots = [{ qty: 100, price: 110 }]
    expect(calcPartialPnl('long', 100, lots, 10)).toBe(990)
  })

  it('returns 0 for empty lots', () => {
    expect(calcPartialPnl('long', 100, [])).toBe(0)
  })

  it('handles partial exit (only some shares sold)', () => {
    // 50 of 100 shares sold @ 110 = +$500
    const lots = [{ qty: 50, price: 110 }]
    expect(calcPartialPnl('long', 100, lots)).toBe(500)
  })
})

// ─── calcRealizedQty ──────────────────────────────────────────────────────────

describe('calcRealizedQty', () => {
  it('sums quantities', () => {
    expect(calcRealizedQty([{ qty: 50 }, { qty: 30 }, { qty: 20 }])).toBe(100)
  })

  it('returns 0 for empty array', () => {
    expect(calcRealizedQty([])).toBe(0)
  })
})

// ─── calcWeightedAvgExit ──────────────────────────────────────────────────────

describe('calcWeightedAvgExit', () => {
  it('returns null for empty array', () => {
    expect(calcWeightedAvgExit([])).toBeNull()
  })

  it('returns price for single lot', () => {
    expect(calcWeightedAvgExit([{ qty: 100, price: 155 }])).toBe(155)
  })

  it('computes weighted average correctly', () => {
    // 50 @ 100 + 50 @ 120 = avg 110
    expect(calcWeightedAvgExit([{ qty: 50, price: 100 }, { qty: 50, price: 120 }])).toBe(110)
  })

  it('weights by qty, not equal weight', () => {
    // 100 @ 100 + 50 @ 130 = (10000 + 6500) / 150 = 110
    expect(calcWeightedAvgExit([{ qty: 100, price: 100 }, { qty: 50, price: 130 }])).toBeCloseTo(110)
  })
})

// ─── Session detection ────────────────────────────────────────────────────────

describe('detectSession', () => {
  it('detects pre-market (04:00)', () => {
    expect(detectSession('2024-01-15T04:00')).toBe('pre-market')
  })

  it('detects pre-market (09:29)', () => {
    expect(detectSession('2024-01-15T09:29')).toBe('pre-market')
  })

  it('detects RTH open (09:30)', () => {
    expect(detectSession('2024-01-15T09:30')).toBe('rth')
  })

  it('detects RTH mid-day (12:00)', () => {
    expect(detectSession('2024-01-15T12:00')).toBe('rth')
  })

  it('detects RTH close (15:59)', () => {
    expect(detectSession('2024-01-15T15:59')).toBe('rth')
  })

  it('detects after-hours (16:00)', () => {
    expect(detectSession('2024-01-15T16:00')).toBe('after-hours')
  })

  it('detects after-hours (20:00)', () => {
    expect(detectSession('2024-01-15T20:00')).toBe('after-hours')
  })

  it('returns undefined before pre-market (03:59)', () => {
    expect(detectSession('2024-01-15T03:59')).toBeUndefined()
  })

  it('returns undefined after after-hours (20:01)', () => {
    expect(detectSession('2024-01-15T20:01')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(detectSession('')).toBeUndefined()
  })

  it('returns undefined for missing time part', () => {
    expect(detectSession('2024-01-15')).toBeUndefined()
  })
})
