import { Trade, DEFAULT_RULES } from '../types'
import { getSetupTags, getMistakeTags } from './db'

const SETUP_TAGS = getSetupTags()
const MISTAKE_TAGS_LIST = getMistakeTags()

function escapeCell(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportTradesToCsv(trades: Trade[]): string {
  const headers = [
    'ticker', 'direction', 'asset_class', 'entry_time', 'exit_time',
    'quantity', 'entry_price', 'exit_price', 'stop_price', 'target_price',
    'fees', 'pnl', 'result_pct', 'actual_r', 'planned_rr',
    'setup_tag', 'mistake_tags', 'rules_broken',
    'emotion_entry', 'emotion_exit', 'confidence', 'notes',
    'exit_lots',
  ]

  const rows = trades.map(t => {
    const setupTag = SETUP_TAGS.find(s => s.id === t.setup_tag_id)?.name ?? ''
    const mistakeTags = t.mistake_tag_ids
      .map(id => MISTAKE_TAGS_LIST.find(m => m.id === id)?.name ?? id)
      .join('; ')
    const rulesBroken = t.rules_broken_ids
      .map(id => DEFAULT_RULES.find(r => r.id === id)?.name ?? id)
      .join('; ')
    const exitLotsJson = t.exit_lots && t.exit_lots.length > 1
      ? JSON.stringify(t.exit_lots)
      : ''

    return [
      t.ticker, t.direction, t.asset_class, t.entry_time, t.exit_time,
      t.quantity, t.entry_price, t.exit_price, t.stop_price ?? '', t.target_price ?? '',
      t.fees, t.pnl?.toFixed(2) ?? '', t.result_pct?.toFixed(4) ?? '',
      t.actual_r?.toFixed(2) ?? '', t.planned_rr?.toFixed(2) ?? '',
      setupTag, mistakeTags, rulesBroken,
      t.emotion_entry, t.emotion_exit, t.confidence,
      t.notes, exitLotsJson,
    ]
  })

  return [headers, ...rows].map(row => row.map(escapeCell).join(',')).join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const CSV_TEMPLATE_HEADERS = [
  'ticker', 'direction', 'asset_class', 'entry_time', 'exit_time',
  'quantity', 'entry_price', 'exit_price', 'stop_price', 'target_price',
  'fees', 'notes',
].join(',')

export const CSV_TEMPLATE_EXAMPLE =
  CSV_TEMPLATE_HEADERS + '\n' +
  'AAPL,long,stock,2026-02-26T09:35,2026-02-26T10:15,100,150.00,153.50,148.00,156.00,1.00,Breakout off VWAP'
