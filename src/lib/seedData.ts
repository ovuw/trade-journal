/**
 * Sample trade and journal data for UI development / demo purposes.
 * Loaded via the "Load Sample Data" button in Settings.
 */
import { replaceTrades } from './db'
import { upsertJournalEntry } from './db'
import type { Trade, AssetClass } from '../types'

function trade(
  id: string,
  ticker: string,
  direction: 'long' | 'short',
  entry: number,
  exit: number,
  qty: number,
  entryTime: string,
  exitTime: string,
  setupTagId: string,
  opts: {
    assetClass?: AssetClass
    stop?: number
    target?: number
    fees?: number
    mistakes?: string[]
    rulesBroken?: string[]
    rulesFollowed?: string[]
    emotionEntry?: number
    emotionExit?: number
    confidence?: number
    notes?: string
  } = {},
): Trade {
  const fees = opts.fees ?? 1.0
  const pnl = (direction === 'long' ? (exit - entry) * qty : (entry - exit) * qty) - fees
  const result_pct = (pnl / (entry * qty)) * 100
  const stopDist = opts.stop ? Math.abs(entry - opts.stop) : null
  const planned_rr = stopDist && opts.target ? Math.abs(opts.target - entry) / stopDist : null
  const initial_risk = stopDist ? stopDist * qty : null
  const actual_r = initial_risk && initial_risk > 0 ? pnl / initial_risk : null
  const now = new Date().toISOString()
  return {
    id,
    ticker,
    direction,
    asset_class: opts.assetClass ?? 'stock',
    entry_price: entry,
    exit_price: exit,
    quantity: qty,
    fees,
    stop_price: opts.stop ?? null,
    target_price: opts.target ?? null,
    planned_rr,
    actual_r,
    entry_time: entryTime,
    exit_time: exitTime,
    setup_tag_id: setupTagId,
    mistake_tag_ids: opts.mistakes ?? [],
    rules_broken_ids: opts.rulesBroken ?? [],
    rules_followed_ids: opts.rulesFollowed ?? [],
    emotion_entry: opts.emotionEntry ?? 3,
    emotion_exit: opts.emotionExit ?? 3,
    confidence: opts.confidence ?? 3,
    notes: opts.notes ?? '',
    pnl,
    result_pct,
    screenshot_id: null,
    created_at: now,
    updated_at: now,
  }
}

const SAMPLE_TRADES: Trade[] = [
  // ── December 2025 ──────────────────────────────────────────────────────────
  trade('seed-01', 'NVDA', 'long', 485.00, 492.50, 100, '2025-12-03T09:45', '2025-12-03T11:20', 'breakout',
    { stop: 480.00, target: 498.00, fees: 1.50, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Clean breakout above $485 resistance on strong volume. Held well through midday consolidation.' }),

  trade('seed-02', 'AAPL', 'long', 243.50, 239.80, 50, '2025-12-05T10:15', '2025-12-05T10:48', 'pullback',
    { stop: 241.00, target: 250.00, fees: 1.00, mistakes: ['fomo'], rulesBroken: ['no-first-15'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'FOMO\'d in too early, didn\'t wait for confirmation. Stopped out quickly. Broke the first-15-min rule.' }),

  trade('seed-03', 'TSLA', 'long', 378.00, 402.50, 25, '2025-12-09T09:55', '2025-12-09T14:30', 'momentum',
    { stop: 370.00, target: 410.00, fees: 1.00, emotionEntry: 4, emotionExit: 5, confidence: 4,
      notes: 'Strong momentum day. Let winners run — held through two pullbacks to the 8EMA.' }),

  trade('seed-04', 'SPY', 'long', 589.20, 596.80, 20, '2025-12-12T10:05', '2025-12-12T12:45', 'vwap-reclaim',
    { stop: 586.00, target: 598.00, fees: 1.00, emotionEntry: 3, emotionExit: 4, confidence: 4 }),

  trade('seed-05', 'AMD', 'long', 128.40, 124.90, 60, '2025-12-16T09:50', '2025-12-16T10:30', 'breakout',
    { stop: 126.00, target: 136.00, fees: 1.50, mistakes: ['early-exit'], rulesBroken: ['a-plus-only'],
      emotionEntry: 3, emotionExit: 2, confidence: 2,
      notes: 'Setup wasn\'t clean — entered anyway. Panicked out at first red candle instead of holding to stop.' }),

  trade('seed-06', 'META', 'long', 582.00, 607.80, 15, '2025-12-19T10:20', '2025-12-19T15:00', 'trend-continuation',
    { stop: 572.00, target: 615.00, fees: 1.00, emotionEntry: 4, emotionExit: 5, confidence: 5,
      notes: 'Textbook trend continuation. Held through lunch chop. Best trade of the month.' }),

  trade('seed-07', 'QQQ', 'short', 510.50, 515.20, 30, '2025-12-23T09:35', '2025-12-23T09:55', 'reversal',
    { stop: 513.00, target: 504.00, fees: 1.00, rulesBroken: ['no-first-15'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'Traded first 15 min, got chopped out. Classic mistake in holiday-thinned tape.' }),

  // ── January 2026 ───────────────────────────────────────────────────────────

  // Mon Jan 12 — futures pre-market (covers 8am + futures + Monday)
  trade('seed-31', '/ES', 'long', 6050.00, 6065.50, 50, '2026-01-12T08:45', '2026-01-12T10:00', 'breakout',
    { assetClass: 'futures', stop: 6044.00, target: 6075.00, fees: 4.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Pre-market futures breakout above overnight highs. Held through the open. Stopped scaling out too early but still a solid trade.' }),

  trade('seed-08', 'AAPL', 'long', 248.20, 255.60, 50, '2026-01-07T10:10', '2026-01-07T13:20', 'pullback',
    { stop: 244.00, target: 258.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4 }),

  trade('seed-09', 'NVDA', 'long', 140.50, 157.80, 40, '2026-01-09T09:48', '2026-01-09T15:50', 'breakout',
    { stop: 136.00, target: 162.00, fees: 1.50, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'Earnings-driven breakout. Held all day. Booked near HOD. +$688 best single trade in months.' }),

  trade('seed-10', 'TSLA', 'short', 362.00, 374.50, 20, '2026-01-13T10:30', '2026-01-13T11:15', 'reversal',
    { stop: 368.00, target: 348.00, fees: 1.00, mistakes: ['revenge-trade'], rulesBroken: ['a-plus-only'],
      emotionEntry: 2, emotionExit: 1, confidence: 1,
      notes: 'Revenge trade after morning loss. Shorted into clear uptrend. Should never have taken this.' }),

  // Wed Jan 14 — midday trades (covers 11am + 1pm)
  trade('seed-27', 'MSFT', 'long', 412.50, 424.80, 20, '2026-01-14T11:15', '2026-01-14T14:00', 'vwap-reclaim',
    { stop: 407.00, target: 430.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Midday VWAP reclaim after morning sell-off. Let the morning volatility settle before entering. Clean setup.' }),

  trade('seed-29', 'META', 'long', 624.00, 618.50, 12, '2026-01-14T13:45', '2026-01-14T14:30', 'trend-continuation',
    { stop: 616.00, target: 645.00, fees: 1.00, mistakes: ['ignored-signal'], rulesBroken: ['follow-plan'],
      emotionEntry: 3, emotionExit: 2, confidence: 3,
      notes: 'Ignored the exit signal at 1pm when the setup invalidated. Held hoping for recovery. Broke the rule of following the plan.' }),

  // Thu Jan 15 — options at lunch (covers 12pm + options)
  trade('seed-28', 'SPY', 'long', 4.20, 7.35, 200, '2026-01-15T12:30', '2026-01-15T15:00', 'gap-fill',
    { assetClass: 'option', stop: 2.80, target: 9.00, fees: 2.00, emotionEntry: 4, emotionExit: 5, confidence: 4,
      notes: 'SPY call options on a gap fill setup. Morning gap down filled by lunch. Options leverage made this a big winner.' }),

  trade('seed-11', 'SPY', 'long', 591.40, 597.20, 25, '2026-01-16T10:00', '2026-01-16T12:30', 'momentum',
    { stop: 588.00, target: 600.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4 }),

  trade('seed-12', 'MSFT', 'long', 418.50, 433.00, 20, '2026-01-21T09:52', '2026-01-21T14:45', 'vwap-reclaim',
    { stop: 413.00, target: 438.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Clean VWAP reclaim after morning sell-off. Patient entry paid off.' }),

  // Thu Jan 22 — afternoon range-break with averaging down mistake
  trade('seed-34', 'TSLA', 'long', 368.00, 381.50, 22, '2026-01-22T09:40', '2026-01-22T11:30', 'gap-fill',
    { stop: 362.00, target: 385.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Gap fill setup after overnight news. Clean entry on the open, held to target.' }),

  trade('seed-13', 'AMD', 'long', 120.80, 117.60, 50, '2026-01-23T10:25', '2026-01-23T11:05', 'breakout',
    { stop: 118.00, target: 128.00, fees: 1.50, mistakes: ['chased-entry'], rulesBroken: ['a-plus-only'],
      emotionEntry: 2, emotionExit: 2, confidence: 2,
      notes: 'Chased the breakout 3% above ideal entry. No edge at that price.' }),

  // Mon Jan 26 — Monday coverage
  trade('seed-25', 'AAPL', 'long', 236.20, 242.80, 40, '2026-01-26T09:52', '2026-01-26T12:15', 'breakout',
    { stop: 232.00, target: 248.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Clean Monday morning breakout setup. Waited for the opening range to form before entering.' }),

  trade('seed-14', 'META', 'long', 612.00, 641.50, 15, '2026-01-27T09:55', '2026-01-27T15:30', 'pullback',
    { stop: 600.00, target: 648.00, fees: 1.00, emotionEntry: 4, emotionExit: 5, confidence: 5,
      notes: 'Perfect pullback to 20EMA. Held full position. Clean trade, no adjustments needed.' }),

  trade('seed-15', 'NVDA', 'long', 135.20, 152.60, 30, '2026-01-30T10:05', '2026-01-30T15:45', 'momentum',
    { stop: 130.00, target: 158.00, fees: 1.50, emotionEntry: 4, emotionExit: 5, confidence: 4 }),

  // ── February 2026 ──────────────────────────────────────────────────────────
  trade('seed-16', 'QQQ', 'long', 518.40, 510.20, 25, '2026-02-03T09:58', '2026-02-03T10:45', 'trend-continuation',
    { stop: 514.00, target: 528.00, fees: 1.00, mistakes: ['oversize'], rulesBroken: ['max-3-trades'],
      emotionEntry: 3, emotionExit: 1, confidence: 3,
      notes: 'Oversized relative to account. Was the 4th trade of the day — broke daily max rule.' }),

  // Wed Feb 4 — afternoon range-break short with averaging down (covers 2pm)
  trade('seed-30', 'NVDA', 'short', 134.00, 139.20, 35, '2026-02-04T14:30', '2026-02-04T15:20', 'range-break',
    { stop: 136.50, target: 128.00, fees: 1.50, rulesBroken: ['no-average-down'],
      emotionEntry: 3, emotionExit: 1, confidence: 3,
      notes: 'Shorted NVDA in the afternoon, then averaged into the short as it moved against me. Compounded the loss instead of cutting it.' }),

  trade('seed-17', 'AAPL', 'long', 232.80, 241.60, 40, '2026-02-05T10:12', '2026-02-05T13:55', 'vwap-reclaim',
    { stop: 228.00, target: 245.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4 }),

  trade('seed-18', 'TSLA', 'long', 350.50, 374.20, 20, '2026-02-10T09:50', '2026-02-10T15:20', 'breakout',
    { stop: 342.00, target: 380.00, fees: 1.00, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'Breakout from 3-week base. Held all day. Strong close near HOD.' }),

  // Wed Feb 11 — power hour (covers 3pm)
  trade('seed-32', 'SPY', 'long', 598.40, 602.80, 30, '2026-02-11T15:15', '2026-02-11T15:55', 'momentum',
    { stop: 596.00, target: 605.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Power hour momentum push. Market had been trending up all day and continued into the close. Clean 3pm setup.' }),

  trade('seed-19', 'SPY', 'short', 602.50, 607.30, 30, '2026-02-12T10:20', '2026-02-12T10:55', 'reversal',
    { stop: 605.00, target: 595.00, fees: 1.00, mistakes: ['fomo', 'no-stop'], rulesBroken: ['always-stop'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'Entered without defined stop. Got squeezed immediately. Broke a core rule — unacceptable.' }),

  trade('seed-20', 'MSFT', 'long', 406.20, 425.40, 15, '2026-02-17T10:08', '2026-02-17T14:30', 'pullback',
    { stop: 399.00, target: 430.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 5 }),

  trade('seed-21', 'NVDA', 'long', 128.60, 141.80, 50, '2026-02-19T09:52', '2026-02-19T15:50', 'breakout',
    { stop: 124.00, target: 148.00, fees: 1.50, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'Second big NVDA breakout this month. +$658. High conviction, proper size.' }),

  // Fri Feb 20 (was incorrectly Feb 21 — Saturday)
  trade('seed-22', 'AMD', 'long', 118.40, 114.40, 40, '2026-02-20T10:15', '2026-02-20T11:00', 'momentum',
    { stop: 115.50, target: 126.00, fees: 1.50, mistakes: ['late-entry'],
      emotionEntry: 3, emotionExit: 2, confidence: 2,
      notes: 'Late entry — by the time I entered the momentum was fading.' }),

  // Mon Feb 23 — Monday coverage
  trade('seed-26', 'QQQ', 'short', 512.00, 516.40, 25, '2026-02-23T10:10', '2026-02-23T10:50', 'reversal',
    { stop: 514.50, target: 504.00, fees: 1.00, mistakes: ['fomo'], rulesBroken: ['a-plus-only'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'Shorted into strength on a Monday — market was still trending up and I fought it. Classic mistake.' }),

  trade('seed-23', 'AAPL', 'long', 240.50, 251.80, 35, '2026-02-24T09:55', '2026-02-24T14:15', 'trend-continuation',
    { stop: 235.00, target: 255.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4 }),

  trade('seed-24', 'META', 'long', 660.00, 691.50, 12, '2026-02-25T10:05', '2026-02-25T15:45', 'breakout',
    { stop: 648.00, target: 700.00, fees: 1.00, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'All-time high breakout on heavy volume. Textbook setup, clean execution.' }),
]

const SAMPLE_JOURNAL_ENTRIES = [
  { date: '2025-12-03', mood: 4, market_condition: 'trending', content: '## Pre-Market Plan\n\nMarket looking strong this morning. NVDA holding above key level overnight. Plan to watch for breakout confirmation above $485 with volume.\n\n## Review\n\nGood day. NVDA trade played out exactly as planned. Held my patience and waited for the right entry. +$748 net. Feeling confident in the process.' },
  { date: '2025-12-05', mood: 2, market_condition: 'choppy', content: '## Notes\n\nBad day mentally. FOMO\'d into AAPL before the setup was ready. Market was choppy and I was forcing trades. Need to remember: **no trade is also a valid trade.**\n\nReview the rules tonight. Specifically:\n- Wait for 15-min candle close before entering\n- Only take A+ setups' },
  { date: '2025-12-09', mood: 5, market_condition: 'trending', content: '## TSLA Momentum Play\n\nBeautiful trending day. TSLA held the 8EMA on every pullback. I did a good job staying patient and not selling too early. Let it ride to $402.\n\nKey lesson reinforced: trust the process when the setup is right. Don\'t micromanage winners.' },
  { date: '2025-12-19', mood: 5, market_condition: 'trending', content: '## Best Trade of the Month\n\nMETA trend continuation was the cleanest trade I\'ve taken in weeks. Full size, proper stop, held all day. +$386 net.\n\nThis is what it looks like when I follow the plan. No hesitation, no second-guessing.' },
  { date: '2026-01-09', mood: 5, market_condition: 'volatile', content: '## NVDA Earnings Breakout\n\nBig day. NVDA gapped up pre-market and consolidated for 15 mins before breaking out. I waited, got the entry right, and held all day.\n\n+$688 — biggest single trade of the year so far.\n\nVolatile tape but the setup was clear. High volatility can work in your favor when you\'re on the right side.' },
  { date: '2026-01-12', mood: 4, market_condition: 'trending', content: '## Futures Monday\n\nTraded /ES pre-market for the first time in a while. Overnight setup was clear — breakout above the key resistance level.\n\nLike trading futures for early morning setups when the stock market hasn\'t opened yet. More disciplined entry — no noise from individual stocks.' },
  { date: '2026-01-13', mood: 1, market_condition: 'choppy', content: '## Revenge Trade — TSLA Short\n\nMade a mistake this morning. Took a loss on SPY, then immediately revenge-traded TSLA short into an uptrend. Lost $251.\n\nThis is exactly the behavior I\'m trying to eliminate. When I take a loss, I need to:\n1. Step away for 10 minutes\n2. Review the rules\n3. Only re-enter if there\'s a genuine A+ setup\n\n**Never trade out of emotion.**' },
  { date: '2026-01-27', mood: 5, market_condition: 'trending', content: '## META Pullback — Perfect Execution\n\nPatient entry on the pullback to the 20EMA. Held through two shakeouts. Let the position work.\n\nThis is the version of myself I want to show up every day. Clear head, clear plan, clean execution.' },
  { date: '2026-02-10', mood: 5, market_condition: 'trending', content: '## TSLA Breakout\n\nThree-week base breakout. Held through the midday dip. Strong close.\n\nTwo good things I did today:\n1. Waited for the opening range to settle before entering\n2. Kept my stop wide enough to avoid being shaken out' },
  { date: '2026-02-12', mood: 2, market_condition: 'volatile', content: '## Broke the Stop Rule\n\nEntered SPY short without a defined stop. This is the one rule I said I\'d never break again.\n\nI need to hard-code this: **no position without a stop, ever.** The market can go against me 100% of the time if I\'m not managing risk properly.\n\nTook a $145 loss that was entirely avoidable.' },
  { date: '2026-02-19', mood: 5, market_condition: 'trending', content: '## NVDA Again\n\nSecond big NVDA trade this month. +$658. The stock keeps setting up.\n\nI\'m getting better at holding winners. A few months ago I would have sold at +$200. Today I held to +$658 because the chart told me to.' },
  { date: '2026-02-25', mood: 5, market_condition: 'trending', content: '## META All-Time High Breakout\n\nEnded the week strong. META broke to all-time highs on volume. Clean entry, held all day.\n\nBest week of the year. Starting to feel the consistency building. The rules are working — I just need to follow them every day.' },
]

export function loadSampleData(): void {
  // Sort newest first (matches convention)
  const sorted = [...SAMPLE_TRADES].sort((a, b) =>
    b.entry_time.localeCompare(a.entry_time)
  )
  replaceTrades(sorted)

  for (const entry of SAMPLE_JOURNAL_ENTRIES) {
    upsertJournalEntry(entry)
  }
}
