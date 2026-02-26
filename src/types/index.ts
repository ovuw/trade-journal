export type Direction = 'long' | 'short'
export type AssetClass = 'stock' | 'option' | 'futures' | 'forex' | 'crypto'
export type MarketCondition = '' | 'trending' | 'choppy' | 'volatile' | 'ranging'

export interface JournalEntry {
  id: string
  date: string           // YYYY-MM-DD
  content: string        // markdown text
  mood: number           // 0 = not set, 1–5
  market_condition: MarketCondition
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Rule {
  id: string
  name: string
  description: string
  category: string
  is_active: boolean
}

export interface ChecklistItem {
  id: string
  label: string
  order_index: number
  is_active: boolean
}

// Form state — all prices as strings for input binding
export interface TradeFormData {
  ticker: string
  direction: Direction
  asset_class: AssetClass
  entry_price: string
  exit_price: string
  stop_price: string
  target_price: string
  quantity: string
  fees: string
  entry_time: string
  exit_time: string
  setup_tag_id: string
  mistake_tag_ids: string[]
  rules_broken_ids: string[]
  emotion_entry: number
  emotion_exit: number
  confidence: number
  notes: string
}

// Stored trade — prices as numbers, computed fields included
export interface Trade {
  id: string
  ticker: string
  direction: Direction
  asset_class: AssetClass
  entry_price: number
  exit_price: number
  stop_price: number | null
  target_price: number | null
  quantity: number
  fees: number
  entry_time: string
  exit_time: string
  setup_tag_id: string
  mistake_tag_ids: string[]
  rules_broken_ids: string[]
  rules_followed_ids: string[]
  emotion_entry: number
  emotion_exit: number
  confidence: number
  notes: string
  pnl: number
  result_pct: number
  planned_rr: number | null
  actual_r: number | null
  screenshot_id: string | null
  created_at: string
  updated_at: string
}

export const DEFAULT_SETUP_TAGS: Tag[] = [
  { id: 'breakout', name: 'Breakout', color: '#58a6ff' },
  { id: 'vwap-reclaim', name: 'VWAP Reclaim', color: '#58a6ff' },
  { id: 'pullback', name: 'Pullback', color: '#d29922' },
  { id: 'trend-continuation', name: 'Trend Continuation', color: '#00c896' },
  { id: 'reversal', name: 'Reversal', color: '#d29922' },
  { id: 'gap-fill', name: 'Gap Fill', color: '#58a6ff' },
  { id: 'momentum', name: 'Momentum', color: '#00c896' },
  { id: 'range-break', name: 'Range Break', color: '#8b5cf6' },
]

export const DEFAULT_MISTAKE_TAGS: Tag[] = [
  { id: 'fomo', name: 'FOMO', color: '#ff4d4d' },
  { id: 'oversize', name: 'Oversize', color: '#ff4d4d' },
  { id: 'early-exit', name: 'Early Exit', color: '#ff8c00' },
  { id: 'late-entry', name: 'Late Entry', color: '#ff8c00' },
  { id: 'revenge-trade', name: 'Revenge Trade', color: '#ff4d4d' },
  { id: 'no-stop', name: 'No Stop', color: '#ff4d4d' },
  { id: 'chased-entry', name: 'Chased Entry', color: '#ff8c00' },
  { id: 'ignored-signal', name: 'Ignored Signal', color: '#d29922' },
]

export const DEFAULT_RULES: Rule[] = [
  { id: 'no-first-15', name: 'No trading first 15 min', description: 'Avoid the volatile open. Wait for price to settle before entering any position.', category: 'Process', is_active: true },
  { id: 'always-stop', name: 'Always set stop before entry', description: 'A stop must be placed before entering. No exceptions. If you can\'t define a stop, don\'t take the trade.', category: 'Risk', is_active: true },
  { id: 'max-3-trades', name: 'Max 3 trades per day', description: 'After 3 trades, close the platform. Overtrading is a major source of losses.', category: 'Risk', is_active: true },
  { id: 'a-plus-only', name: 'A+ setups only', description: 'Only enter trades that meet all your criteria. If you have to talk yourself into a trade, skip it.', category: 'Entry', is_active: true },
  { id: 'no-average-down', name: 'No averaging down', description: 'Adding to a losing position compounds losses. Exit and re-evaluate instead.', category: 'Risk', is_active: true },
  { id: 'follow-plan', name: 'Follow the trading plan', description: 'Stick to the pre-market plan. Do not deviate based on emotion or market noise during the session.', category: 'Process', is_active: true },
]

export const DEFAULT_CHECKLIST_LABELS: string[] = [
  'Check the news',
  'Review trading plan',
  'Analyze the market',
  'Spot entry and exit points',
  'Calculate risk-reward',
  'Set stop loss and take profit',
]
