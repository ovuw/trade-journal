import { describe, it, expect } from 'vitest'
import { mergeTrades } from '../lib/sync'
import type { Trade } from '../types'

function makeTrade(id: string, updatedAt: string, extra?: Partial<Trade>): Trade {
  return {
    id,
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
    created_at: '2024-01-15T10:00:00Z',
    updated_at: updatedAt,
    ...extra,
  }
}

describe('mergeTrades', () => {
  it('returns local trade when only on local', () => {
    const local = [makeTrade('a', '2024-01-15T10:00:00Z')]
    const { merged, toPush, pulled } = mergeTrades(local, [])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a')
    expect(toPush).toHaveLength(1)
    expect(pulled).toBe(0)
  })

  it('returns remote trade when only on remote', () => {
    const remote = [makeTrade('b', '2024-01-15T10:00:00Z')]
    const { merged, toPush, pulled } = mergeTrades([], remote)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('b')
    expect(toPush).toHaveLength(0)
    expect(pulled).toBe(1)
  })

  it('picks remote when remote is newer (last-write-wins)', () => {
    const local = [makeTrade('c', '2024-01-15T10:00:00Z', { notes: 'local' })]
    const remote = [makeTrade('c', '2024-01-15T11:00:00Z', { notes: 'remote' })]
    const { merged, pulled } = mergeTrades(local, remote)
    expect(merged[0].notes).toBe('remote')
    expect(pulled).toBe(1)
  })

  it('picks local when local is newer (last-write-wins)', () => {
    const local = [makeTrade('d', '2024-01-15T11:00:00Z', { notes: 'local' })]
    const remote = [makeTrade('d', '2024-01-15T10:00:00Z', { notes: 'remote' })]
    const { merged, toPush, pulled } = mergeTrades(local, remote)
    expect(merged[0].notes).toBe('local')
    expect(toPush).toHaveLength(0) // existing on remote — no need to push
    expect(pulled).toBe(0)
  })

  it('picks local when timestamps are equal', () => {
    const ts = '2024-01-15T10:00:00Z'
    const local = [makeTrade('e', ts, { notes: 'local' })]
    const remote = [makeTrade('e', ts, { notes: 'remote' })]
    const { merged } = mergeTrades(local, remote)
    expect(merged[0].notes).toBe('local')
  })

  it('merges trades from both sides correctly', () => {
    const local = [
      makeTrade('local-only', '2024-01-15T10:00:00Z'),
      makeTrade('shared', '2024-01-15T10:00:00Z', { notes: 'local' }),
    ]
    const remote = [
      makeTrade('remote-only', '2024-01-15T10:00:00Z'),
      makeTrade('shared', '2024-01-15T11:00:00Z', { notes: 'remote' }),
    ]
    const { merged, toPush, pulled } = mergeTrades(local, remote)
    expect(merged).toHaveLength(3)
    expect(toPush.map(t => t.id)).toEqual(['local-only'])
    expect(pulled).toBe(2) // remote-only + newer shared
  })

  it('returns empty arrays for empty inputs', () => {
    const { merged, toPush, pulled } = mergeTrades([], [])
    expect(merged).toHaveLength(0)
    expect(toPush).toHaveLength(0)
    expect(pulled).toBe(0)
  })

  it('sorts result newest created_at first', () => {
    const local = [
      makeTrade('old', '2024-01-15T10:00:00Z', { created_at: '2024-01-01T00:00:00Z' }),
    ]
    const remote = [
      makeTrade('new', '2024-01-15T10:00:00Z', { created_at: '2024-01-10T00:00:00Z' }),
    ]
    const { merged } = mergeTrades(local, remote)
    expect(merged[0].id).toBe('new')
    expect(merged[1].id).toBe('old')
  })
})
