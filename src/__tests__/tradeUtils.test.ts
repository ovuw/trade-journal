import { describe, it, expect } from 'vitest'
import { calcPnl, calcResultPct, detectSession } from '../lib/tradeUtils'

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
