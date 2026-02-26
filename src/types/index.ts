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
  { id: 'episodic-pivot', name: 'Episodic Pivot (EP)', color: '#00c896' },
  { id: 'high-tight-flag', name: 'High Tight Flag (HTF)', color: '#8b5cf6' },
  { id: 'pullback-10ma', name: 'Pullback to 10-day MA', color: '#d29922' },
  { id: 'pullback-20ma', name: 'Pullback to 20-day MA', color: '#f0883e' },
]

export const DEFAULT_MISTAKE_TAGS: Tag[] = [
  { id: 'weak-gap', name: 'Weak Gap (no volume)', color: '#ff4d4d' },
  { id: 'ignored-volume', name: 'Ignored Volume', color: '#ff4d4d' },
  { id: 'held-below-ma', name: 'Held Below MA', color: '#ff8c00' },
  { id: 'entered-too-early', name: 'Entered Too Early', color: '#ff8c00' },
  { id: 'added-to-loser', name: 'Added to Loser', color: '#ff4d4d' },
  { id: 'sold-too-early', name: 'Sold Too Early', color: '#ff8c00' },
  { id: 'wrong-market', name: 'Wrong Market', color: '#ff4d4d' },
  { id: 'revenge-trade', name: 'Revenge Trade', color: '#ff4d4d' },
  { id: 'oversize', name: 'Oversize', color: '#ff4d4d' },
  { id: 'no-stop', name: 'No Stop', color: '#ff4d4d' },
]

export const DEFAULT_RULES: Rule[] = [
  { id: 'market-structure', name: 'Check market structure first', description: 'Breakouts only work in uptrending markets. If SPY/QQQ are in a downtrend, reduce size or sit in cash. Do not trade breakouts in falling markets.', category: 'Process', is_active: true },
  { id: 'confirm-volume', name: 'Confirm volume before entry', description: 'Breakouts need 1.5x+ average volume. EPs need average daily volume in the first 15–20 minutes. No volume = no edge. Do not enter without it.', category: 'Entry', is_active: true },
  { id: 'stop-at-lows', name: 'Stop at the day\'s low (max 1.5x ATR)', description: 'Stop loss goes at the low of the entry day. Width must not exceed 1–1.5x the average daily range. If the stop is too wide, skip the trade.', category: 'Risk', is_active: true },
  { id: 'max-risk-1pct', name: 'Risk max 1% of account per trade', description: 'Typically risk 0.25–0.5% per trade, never more than 1%. Position size is determined by stop distance, not conviction. Size down on wider stops.', category: 'Risk', is_active: true },
  { id: 'take-partials', name: 'Sell ⅓–½ after 20% gain or 3–5 days', description: 'After a 20%+ gain or 3–5 days of holding, sell one third to one half of the position. Move stop to breakeven on the remainder.', category: 'Exit', is_active: true },
  { id: 'trail-ma', name: 'Trail remainder with 10/20-day MA', description: 'After taking partials, trail the remaining position with the 10-day or 20-day MA. Exit on the first close below it. Never let a winner turn into a loser.', category: 'Exit', is_active: true },
  { id: 'no-add-to-loser', name: 'Never add to a losing position', description: 'Adding to a loser compounds the mistake. If the trade is not working, cut it. Re-evaluate only after the position is flat.', category: 'Risk', is_active: true },
  { id: 'focus-list-only', name: 'Only trade from the focus list', description: 'Trade only pre-planned setups from your focus list of 0–10 names. No impulse trades. If it wasn\'t on the list before the open, don\'t take it.', category: 'Process', is_active: true },
]

export const DEFAULT_CHECKLIST_LABELS: string[] = [
  'Check market structure — is SPY/QQQ trending up?',
  'Review focus list (0–10 names with clear setups)',
  'Identify opening range high for each focus name',
  'Confirm volume vs ADR (1.5x+ for breakouts)',
  'Calculate position size (risk 0.25–1% of account)',
  'Set stop loss at day\'s low before entering',
  'Define partial exit level (20% gain or 3–5 days)',
]
