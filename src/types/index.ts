export type Direction = 'long' | 'short'
export type AssetClass = 'stock' | 'option' | 'futures' | 'forex' | 'crypto'
export type MarketCondition = '' | 'trending' | 'choppy' | 'volatile' | 'ranging'
export type TradingSession = 'pre-market' | 'rth' | 'after-hours'

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
  session?: TradingSession
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
  { id: 'market-structure', name: 'Check market structure before every trade', description: 'Check SPY/QQQ before every trade. SPY\'s 10D EMA must be above the 20D SMA, both sloping up. Do not trade breakouts if SPY is in a downtrend or choppy market. If SPY is >11% above the 200SMA, cut position size in half. If SPY is >13% above the 200SMA or extended >6 ATR from the 50SMA, sit in cash — the risk/reward is gone.', category: 'Process', is_active: true },
  { id: 'confirm-volume', name: 'Confirm volume before entry', description: 'Breakouts need 1.5x+ average volume. EPs need average daily volume in the first 15–20 minutes. No volume = no edge. Do not enter without it.', category: 'Entry', is_active: true },
  { id: 'stop-at-lows', name: 'Stop at the day\'s low or closest POI', description: 'Place hard stop at the low of the entry day. If there are multiple points of interest in the same area (daily MA, previous day\'s low, breakout level) the stock tends to respect the lowest one — use that as your stop. Stop width must not exceed 1x ATR from entry. If the stop is too wide, skip the trade.', category: 'Risk', is_active: true },
  { id: 'position-sizing', name: 'Size position so max loss never exceeds 1%', description: 'Size position so max loss never exceeds 1% of account. Typical target is 0.5%. Position size is 10–20% of account — use a larger position when the stop is tight, smaller when it\'s wide. The stop distance drives the size, not conviction. Never risk more than 1% of total account on a single trade.', category: 'Risk', is_active: true },
  { id: 'take-partials', name: 'Sell 25–50% if up 20%+ within first 3–5 days', description: 'Sell 25–50% if up 20%+ within the first 3–5 days. Take more off in choppy or extended markets, less in strong trending markets. Move stop to breakeven on the remainder. If the stock hasn\'t moved after 5–7 days, sell 50% to free up capital.', category: 'Exit', is_active: true },
  { id: 'trail-ma', name: 'Trail remainder with 10/20-day MA', description: 'Trail the remaining position with the 10 or 20-day MA. Use the 10MA for faster movers, 20MA for slower ones (based on ADR). Exit on a daily close below the MA — intraday dips don\'t count. Wait for the second-last 1-minute candle of the day before pulling the trigger. Optionally split the exit: sell 25% at the 10MA and 25% at the 20MA.', category: 'Exit', is_active: true },
  { id: 'no-add-to-loser', name: 'Never add to a losing position', description: 'Adding to a loser compounds the mistake. If the trade is not working, cut it and re-evaluate only after the position is flat. You can add to a winner, but only as a completely separate trade with its own entry, stop, and position size — never average into an existing position.', category: 'Risk', is_active: true },
  { id: 'focus-list-only', name: 'Only trade from the focus list', description: 'Build a list of 0–10 names with clear setups before the open. No impulse trades. If a stock wasn\'t on the list, only consider it if it clearly meets all entry and selection criteria — do the work first, then decide. Never chase.', category: 'Process', is_active: true },
  { id: 'entry-confirmation', name: 'Both entry conditions must be met', description: 'Both conditions must be met before entering. The stock must break over the previous day\'s high AND over the breakout level. If they are at different prices, both must be cleared before entering. One without the other is not a valid entry.', category: 'Entry', is_active: true },
  { id: 'orb-timing', name: 'Use correct ORB timeframe for entry', description: 'Match the ORB timeframe to when the breakout occurs — 1-min if the stock gaps up at the open, 5-min if it breaks within the first 5 minutes, 30-min if it breaks between 9:35–10:00am, 65-min if it breaks later in the morning. Do not chase entries outside the valid ORB window. For entries later in the day, wait for a fresh MACD cross on the 5-min chart (settings: 6, 20, 9) before entering.', category: 'Entry', is_active: true },
  { id: 'chart-off-screen', name: 'Take chart off screen after entry', description: 'Once you have entered the trade and set your hard stop, remove the chart from view. Do not watch it tick. The stop is set — let the trade work without interference.', category: 'Process', is_active: true },
  { id: 'stock-selection', name: 'Only trade stocks that meet all selection criteria', description: 'ADR must be >4% and average daily dollar volume >$50M over the last 20 days. The stock must have made a 30%+ gain in the last 30 days and have a history of making large clean moves while respecting the 10, 20, and 50-day MAs. The chart must show a linear and orderly pullback to the 10 or 20MA, with at least one tight day surfing the MA, a clear daily trend line, and price within ½ ATR of the breakout level.', category: 'Process', is_active: true },
]

export const DEFAULT_CHECKLIST_LABELS: string[] = [
  'Peloton ride by 6:00am (30 min)',
  'Shower and brush teeth — done by 7:00am',
  'Check economic calendar for key events (Fed, CPI, earnings)',
  'Review all watchlists (Flagged, NMS, Focus, Favorites)',
  'Run daily scans',
  'Confirm all Focus list stocks meet selection criteria (ADR >4%, $Vol >$50M, 30%+ gain, MA behavior)',
  'Check if SPY/QQQ is in an uptrend',
  'Draw entry and stop trend lines on each Focus list stock and set price alerts at entry levels',
]
