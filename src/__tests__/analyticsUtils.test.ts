import { describe, it, expect } from 'vitest'
import { calcStreak, calcSetupBreakdown, calcRuleBreakdown } from '../lib/analyticsUtils'
import { Trade, Tag, Rule } from '../types'

// ─── Trade factory ─────────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'test-id',
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
    screenshot_id: null,
    actual_r: null,
    planned_rr: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function win(id: string, date = '2024-01-15', pnl = 100): Trade {
  return makeTrade({ id, pnl, entry_time: `${date}T10:00`, exit_time: `${date}T11:00` })
}

function loss(id: string, date = '2024-01-16', pnl = -100): Trade {
  return makeTrade({ id, pnl, entry_time: `${date}T10:00`, exit_time: `${date}T11:00` })
}

// ─── calcStreak ────────────────────────────────────────────────────────────────

describe('calcStreak', () => {
  it('returns zeros and null type for empty array', () => {
    const result = calcStreak([])
    expect(result).toEqual({ currentStreak: 0, currentStreakType: null, longestWin: 0, longestLoss: 0 })
  })

  it('single win trade', () => {
    const result = calcStreak([win('1')])
    expect(result.currentStreak).toBe(1)
    expect(result.currentStreakType).toBe('win')
    expect(result.longestWin).toBe(1)
    expect(result.longestLoss).toBe(0)
  })

  it('single loss trade', () => {
    const result = calcStreak([loss('1')])
    expect(result.currentStreak).toBe(1)
    expect(result.currentStreakType).toBe('loss')
    expect(result.longestWin).toBe(0)
    expect(result.longestLoss).toBe(1)
  })

  it('all wins — streak equals trade count', () => {
    const trades = [win('1', '2024-01-01'), win('2', '2024-01-02'), win('3', '2024-01-03')]
    const result = calcStreak(trades)
    expect(result.currentStreak).toBe(3)
    expect(result.currentStreakType).toBe('win')
    expect(result.longestWin).toBe(3)
    expect(result.longestLoss).toBe(0)
  })

  it('all losses — streak equals trade count', () => {
    const trades = [loss('1', '2024-01-01'), loss('2', '2024-01-02'), loss('3', '2024-01-03')]
    const result = calcStreak(trades)
    expect(result.currentStreak).toBe(3)
    expect(result.currentStreakType).toBe('loss')
    expect(result.longestWin).toBe(0)
    expect(result.longestLoss).toBe(3)
  })

  it('mixed — win streak at end', () => {
    // loss, loss, win, win → current streak = 2 wins; longestLoss = 2
    const trades = [
      loss('1', '2024-01-01'),
      loss('2', '2024-01-02'),
      win('3', '2024-01-03'),
      win('4', '2024-01-04'),
    ]
    const result = calcStreak(trades)
    expect(result.currentStreak).toBe(2)
    expect(result.currentStreakType).toBe('win')
    expect(result.longestWin).toBe(2)
    expect(result.longestLoss).toBe(2)
  })

  it('mixed — loss streak at end', () => {
    // win, win, win, loss, loss → current = 2 losses; longestWin = 3
    const trades = [
      win('1', '2024-01-01'),
      win('2', '2024-01-02'),
      win('3', '2024-01-03'),
      loss('4', '2024-01-04'),
      loss('5', '2024-01-05'),
    ]
    const result = calcStreak(trades)
    expect(result.currentStreak).toBe(2)
    expect(result.currentStreakType).toBe('loss')
    expect(result.longestWin).toBe(3)
    expect(result.longestLoss).toBe(2)
  })

  it('sorts by entry_time regardless of input order', () => {
    // Providing out-of-order: last chronologically is a win
    const trades = [
      win('3', '2024-01-03'),
      loss('1', '2024-01-01'),
      win('2', '2024-01-02'),
    ]
    const result = calcStreak(trades)
    expect(result.currentStreakType).toBe('win')
    expect(result.currentStreak).toBe(2)
  })
})

// ─── calcSetupBreakdown ────────────────────────────────────────────────────────

const TAG_A: Tag = { id: 'tag-a', name: 'Breakout', color: '#10b981' }
const TAG_B: Tag = { id: 'tag-b', name: 'Pullback', color: '#6366f1' }

function makeTagged(id: string, tagId: string, pnl: number, date = '2024-01-15'): Trade {
  return makeTrade({ id, setup_tag_id: tagId, pnl, entry_time: `${date}T10:00`, exit_time: `${date}T11:00` })
}

describe('calcSetupBreakdown', () => {
  it('returns empty array when no trades', () => {
    expect(calcSetupBreakdown([], [TAG_A])).toEqual([])
  })

  it('returns empty array when no trades have setup tags', () => {
    const trades = [makeTrade({ id: '1', setup_tag_id: '' })]
    expect(calcSetupBreakdown(trades, [TAG_A])).toEqual([])
  })

  it('groups trades by setup tag correctly', () => {
    const trades = [
      makeTagged('1', 'tag-a', 100),
      makeTagged('2', 'tag-a', 200),
      makeTagged('3', 'tag-b', -50),
    ]
    const result = calcSetupBreakdown(trades, [TAG_A, TAG_B])
    expect(result).toHaveLength(2)
    const tagA = result.find(r => r.tagId === 'tag-a')!
    expect(tagA.count).toBe(2)
    expect(tagA.wins).toBe(2)
    expect(tagA.totalPnl).toBe(300)
  })

  it('calculates win rate correctly', () => {
    const trades = [
      makeTagged('1', 'tag-a', 100),
      makeTagged('2', 'tag-a', -50),
      makeTagged('3', 'tag-a', 75),
    ]
    const result = calcSetupBreakdown(trades, [TAG_A])
    expect(result[0].wins).toBe(2)
    expect(result[0].winRate).toBeCloseTo(66.67, 1)
  })

  it('excludes trades without setup tag', () => {
    const trades = [
      makeTagged('1', 'tag-a', 100),
      makeTrade({ id: '2', setup_tag_id: '', pnl: -999 }),
    ]
    const result = calcSetupBreakdown(trades, [TAG_A])
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(1)
  })

  it('excludes tags not present in trades', () => {
    const trades = [makeTagged('1', 'tag-a', 100)]
    const result = calcSetupBreakdown(trades, [TAG_A, TAG_B])
    expect(result).toHaveLength(1)
    expect(result[0].tagId).toBe('tag-a')
  })

  it('sorts by EV descending', () => {
    // TAG_A: 2 wins @ $100 = EV > 0; TAG_B: 2 losses @ $100 = EV < 0
    const trades = [
      makeTagged('1', 'tag-a', 100, '2024-01-01'),
      makeTagged('2', 'tag-a', 100, '2024-01-02'),
      makeTagged('3', 'tag-b', -100, '2024-01-01'),
      makeTagged('4', 'tag-b', -100, '2024-01-02'),
    ]
    const result = calcSetupBreakdown(trades, [TAG_A, TAG_B])
    expect(result[0].tagId).toBe('tag-a')
    expect(result[1].tagId).toBe('tag-b')
  })
})

// ─── calcRuleBreakdown ─────────────────────────────────────────────────────────

const RULE_1: Rule = { id: 'rule-1', name: 'No FOMO', description: '', category: 'entry', is_active: true }
const RULE_2: Rule = { id: 'rule-2', name: 'Cut losses', description: '', category: 'exit', is_active: true }

function makeRuleTrade(id: string, ruleIds: string[], pnl: number, date = '2024-01-15'): Trade {
  return makeTrade({ id, rules_broken_ids: ruleIds, pnl, entry_time: `${date}T10:00` })
}

describe('calcRuleBreakdown', () => {
  it('returns empty array when no rules broken', () => {
    const trades = [makeTrade({ id: '1', rules_broken_ids: [] })]
    expect(calcRuleBreakdown(trades, [RULE_1, RULE_2])).toEqual([])
  })

  it('returns empty array for empty trades', () => {
    expect(calcRuleBreakdown([], [RULE_1])).toEqual([])
  })

  it('groups by rule id correctly', () => {
    const trades = [
      makeRuleTrade('1', ['rule-1'], -100, '2024-01-01'),
      makeRuleTrade('2', ['rule-1'], -200, '2024-01-02'),
      makeRuleTrade('3', ['rule-2'], -50, '2024-01-03'),
    ]
    const result = calcRuleBreakdown(trades, [RULE_1, RULE_2])
    expect(result).toHaveLength(2)
    const r1 = result.find(r => r.ruleId === 'rule-1')!
    expect(r1.count).toBe(2)
    expect(r1.cost).toBe(-300)
    expect(r1.name).toBe('No FOMO')
  })

  it('accumulates cost (sum of pnl) per rule', () => {
    const trades = [
      makeRuleTrade('1', ['rule-1'], -100),
      makeRuleTrade('2', ['rule-1'], -150),
    ]
    const result = calcRuleBreakdown(trades, [RULE_1])
    expect(result[0].cost).toBe(-250)
  })

  it('handles trade breaking multiple rules', () => {
    const trades = [makeRuleTrade('1', ['rule-1', 'rule-2'], -100)]
    const result = calcRuleBreakdown(trades, [RULE_1, RULE_2])
    expect(result).toHaveLength(2)
    expect(result.find(r => r.ruleId === 'rule-1')?.count).toBe(1)
    expect(result.find(r => r.ruleId === 'rule-2')?.count).toBe(1)
  })

  it('sorts by cost ascending (worst violation first)', () => {
    const trades = [
      makeRuleTrade('1', ['rule-2'], -50, '2024-01-01'),
      makeRuleTrade('2', ['rule-1'], -200, '2024-01-02'),
    ]
    const result = calcRuleBreakdown(trades, [RULE_1, RULE_2])
    expect(result[0].ruleId).toBe('rule-1') // more expensive
    expect(result[1].ruleId).toBe('rule-2')
  })

  it('uses rule id as name fallback when rule not found', () => {
    const trades = [makeRuleTrade('1', ['unknown-rule'], -100)]
    const result = calcRuleBreakdown(trades, [RULE_1])
    expect(result[0].name).toBe('unknown-rule')
  })
})
