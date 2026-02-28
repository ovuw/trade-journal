import { describe, it, expect, beforeEach } from 'vitest'
import {
  getTrades,
  saveTrade,
  updateTrade,
  deleteTrade,
  getCalcSettings,
  saveCalcSettings,
  getAccountSettings,
} from '../lib/db'

// Clear all tj_* localStorage keys before each test
beforeEach(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('tj_'))
  keys.forEach(k => localStorage.removeItem(k))
})

// ─── getTrades ─────────────────────────────────────────────────────────────────

describe('getTrades', () => {
  it('returns empty array when nothing stored', () => {
    expect(getTrades()).toEqual([])
  })

  it('returns empty array on corrupt JSON', () => {
    localStorage.setItem('tj_trades', 'not-json')
    expect(getTrades()).toEqual([])
  })
})

// ─── saveTrade / updateTrade / deleteTrade ─────────────────────────────────────

describe('saveTrade', () => {
  it('saves and retrieves a trade', () => {
    saveTrade({
      ticker: 'AAPL',
      direction: 'long',
      asset_class: 'stock',
      entry_price: 100,
      exit_price: 110,
      stop_price: null,
      target_price: null,
      quantity: 10,
      fees: 0,
      entry_time: '2024-01-15T10:00',
      exit_time: '2024-01-15T11:00',
      setup_tag_id: '',
      mistake_tag_ids: [],
      rules_broken_ids: [],
      rules_followed_ids: [],
      emotion_entry: 0,
      emotion_exit: 0,
      confidence: 0,
      notes: '',
      pnl: 100,
      result_pct: 10,
      planned_rr: null,
      actual_r: null,
      screenshot_id: null,
    })
    const trades = getTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0].ticker).toBe('AAPL')
    expect(trades[0].id).toBeTruthy()
    expect(trades[0].created_at).toBeTruthy()
  })

  it('assigns a unique id to each trade', () => {
    const stub = {
      ticker: 'TSLA', direction: 'long' as const, asset_class: 'stock' as const,
      entry_price: 200, exit_price: 210, stop_price: null, target_price: null,
      quantity: 5, fees: 0, entry_time: '2024-01-15T10:00', exit_time: '2024-01-15T11:00',
      setup_tag_id: '', mistake_tag_ids: [], rules_broken_ids: [], rules_followed_ids: [],
      emotion_entry: 0, emotion_exit: 0, confidence: 0, notes: '', pnl: 50, result_pct: 5,
      planned_rr: null, actual_r: null, screenshot_id: null,
    }
    saveTrade(stub)
    saveTrade(stub)
    const trades = getTrades()
    expect(trades[0].id).not.toBe(trades[1].id)
  })
})

describe('updateTrade', () => {
  it('updates targeted field without clobbering others', () => {
    const trade = saveTrade({
      ticker: 'NVDA', direction: 'long', asset_class: 'stock',
      entry_price: 500, exit_price: 520, stop_price: null, target_price: null,
      quantity: 2, fees: 0, entry_time: '2024-01-15T10:00', exit_time: '2024-01-15T11:00',
      setup_tag_id: '', mistake_tag_ids: [], rules_broken_ids: [], rules_followed_ids: [],
      emotion_entry: 0, emotion_exit: 0, confidence: 0, notes: 'original',
      pnl: 40, result_pct: 4, planned_rr: null, actual_r: null, screenshot_id: null,
    } as const)

    const updated = updateTrade(trade.id, { notes: 'updated' })
    expect(updated?.notes).toBe('updated')
    expect(updated?.id).toBe(trade.id)       // id preserved
    expect(updated?.ticker).toBe('NVDA')      // other fields untouched
    expect(updated?.pnl).toBe(40)
  })

  it('returns null for non-existent id', () => {
    expect(updateTrade('does-not-exist', { notes: 'x' })).toBeNull()
  })
})

describe('deleteTrade', () => {
  it('removes trade by id', () => {
    const trade = saveTrade({
      ticker: 'META', direction: 'long', asset_class: 'stock',
      entry_price: 300, exit_price: 310, stop_price: null, target_price: null,
      quantity: 3, fees: 0, entry_time: '2024-01-15T10:00', exit_time: '2024-01-15T11:00',
      setup_tag_id: '', mistake_tag_ids: [], rules_broken_ids: [], rules_followed_ids: [],
      emotion_entry: 0, emotion_exit: 0, confidence: 0, notes: '',
      pnl: 30, result_pct: 3, planned_rr: null, actual_r: null, screenshot_id: null,
    } as const)

    deleteTrade(trade.id)
    expect(getTrades()).toHaveLength(0)
  })
})

// ─── Settings defaults / safe parsing ─────────────────────────────────────────

describe('getCalcSettings', () => {
  it('returns defaults when nothing stored', () => {
    const s = getCalcSettings()
    expect(s.accountBalance).toBe(10000)
    expect(s.maxRiskPct).toBe(1)
  })

  it('returns defaults on corrupt JSON', () => {
    localStorage.setItem('tj_calc_settings', '{bad json}')
    const s = getCalcSettings()
    expect(s.accountBalance).toBe(10000)
    expect(s.maxRiskPct).toBe(1)
  })

  it('returns stored values', () => {
    saveCalcSettings({ accountBalance: 50000, maxRiskPct: 2 })
    const s = getCalcSettings()
    expect(s.accountBalance).toBe(50000)
    expect(s.maxRiskPct).toBe(2)
  })
})

describe('getAccountSettings', () => {
  it('returns defaults when nothing stored', () => {
    const s = getAccountSettings()
    expect(s.startingBalance).toBe(10000)
    expect(s.maxRiskPct).toBe(1)
    expect(s.maxDailyLossPct).toBe(3)
  })

  it('returns defaults on corrupt JSON', () => {
    localStorage.setItem('tj_account_settings', 'oops')
    const s = getAccountSettings()
    expect(s.startingBalance).toBe(10000)
  })
})
