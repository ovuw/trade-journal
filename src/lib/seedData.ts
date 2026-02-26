/**
 * Sample trade and journal data for UI development / demo purposes.
 * Based on Kristjan Kullamägi (Qullamaggie) methodology.
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

  // Breakout — NVDA surged 60% over 6 weeks, tight consolidation, range expansion
  trade('seed-01', 'NVDA', 'long', 485.00, 492.50, 100, '2025-12-03T09:45', '2025-12-03T11:20', 'breakout',
    { stop: 480.00, target: 510.00, fees: 1.50, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Breakout from 3-week tight consolidation above the 10-day MA. Volume confirmed in first 20 min. Took half off at +$7, trailing remainder.' }),

  // EP — AAPL earnings gap, entered too early before ORH confirmed
  trade('seed-02', 'AAPL', 'long', 243.50, 239.80, 50, '2025-12-05T10:15', '2025-12-05T10:48', 'episodic-pivot',
    { stop: 241.00, target: 258.00, fees: 1.00, mistakes: ['entered-too-early'], rulesBroken: ['confirm-volume'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'EP on earnings beat. Bought before the opening range high formed — volume hadn\'t confirmed yet. Got shaken out. Should have waited for 5-min ORH.' }),

  // Breakout — TSLA, held for 5 days trailing 10-day MA
  trade('seed-03', 'TSLA', 'long', 378.00, 402.50, 25, '2025-12-09T09:55', '2025-12-09T14:30', 'breakout',
    { stop: 370.00, target: 420.00, fees: 1.00, emotionEntry: 4, emotionExit: 5, confidence: 4,
      notes: 'Clean range expansion from 6-week base. High ADR name. Took first partial at +6%, trailing rest with 10-day MA. Stock never gave a reason to exit early.' }),

  // Pullback to 20MA — SPY, working setup
  trade('seed-04', 'SPY', 'long', 589.20, 596.80, 20, '2025-12-12T10:05', '2025-12-12T12:45', 'pullback-20ma',
    { stop: 586.00, target: 600.00, fees: 1.00, emotionEntry: 3, emotionExit: 4, confidence: 4,
      notes: 'Orderly pullback to rising 20-day MA on low volume. Bounced on touch. Volume picked up on the move higher. Textbook re-entry.' }),

  // HTF — AMD, entered on weak volume (mistake)
  trade('seed-05', 'AMD', 'long', 128.40, 124.90, 60, '2025-12-16T09:50', '2025-12-16T10:30', 'high-tight-flag',
    { stop: 126.00, target: 145.00, fees: 1.50, mistakes: ['ignored-volume'], rulesBroken: ['confirm-volume'],
      emotionEntry: 3, emotionExit: 2, confidence: 2,
      notes: 'HTF pattern looked right but volume was weak on the breakout — only 0.8x average. Should have skipped. Exited when it rolled over.' }),

  // EP — META, earnings surprise, held multi-day
  trade('seed-06', 'META', 'long', 582.00, 607.80, 15, '2025-12-19T10:20', '2025-12-19T15:00', 'episodic-pivot',
    { stop: 572.00, target: 630.00, fees: 1.00, emotionEntry: 4, emotionExit: 5, confidence: 5,
      notes: 'Perfect EP setup — gap 12% on earnings, triple-digit revenue growth, stock neglected for 4 months prior. Volume 3x ADV in first 20 min. Best trade of December.' }),

  // Breakout — QQQ, traded wrong market (market was pulling back)
  trade('seed-07', 'QQQ', 'long', 510.50, 505.20, 30, '2025-12-23T09:35', '2025-12-23T09:55', 'breakout',
    { stop: 508.00, target: 525.00, fees: 1.00, mistakes: ['wrong-market'], rulesBroken: ['market-structure'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'Forced a breakout trade in holiday-thinned tape with SPY in a short-term downtrend. Market structure check would have kept me out. Classic mistake.' }),

  // ── January 2026 ───────────────────────────────────────────────────────────

  // Futures pre-market breakout — /ES (covers 8am + futures + Monday)
  trade('seed-31', '/ES', 'long', 6050.00, 6065.50, 50, '2026-01-12T08:45', '2026-01-12T10:00', 'breakout',
    { assetClass: 'futures', stop: 6044.00, target: 6080.00, fees: 4.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Pre-market breakout above overnight high. Market structure strong. Took full size at ORH on the open.' }),

  // Pullback to 10MA — AAPL re-entry after prior breakout
  trade('seed-08', 'AAPL', 'long', 248.20, 255.60, 50, '2026-01-07T10:10', '2026-01-07T13:20', 'pullback-10ma',
    { stop: 244.00, target: 262.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Stock pulled back to rising 10-day MA after prior EP move. Low volume pullback, bounced cleanly. Re-entered with full size.' }),

  // EP — NVDA, earnings gap, held all day (big winner)
  trade('seed-09', 'NVDA', 'long', 140.50, 157.80, 40, '2026-01-09T09:48', '2026-01-09T15:50', 'episodic-pivot',
    { stop: 136.00, target: 165.00, fees: 1.50, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'NVDA EP — gapped 14% on blowout earnings. Volume hit ADV in first 10 minutes. Bought 1-min ORH, held all day. Took half at +12%, trailed rest. +$688 net. Best EP of the year so far.' }),

  // Revenge trade — TSLA, bought after loss, wrong setup
  trade('seed-10', 'TSLA', 'long', 362.00, 354.50, 20, '2026-01-13T10:30', '2026-01-13T11:15', 'breakout',
    { stop: 358.00, target: 380.00, fees: 1.00, mistakes: ['revenge-trade', 'wrong-market'], rulesBroken: ['market-structure', 'focus-list-only'],
      emotionEntry: 2, emotionExit: 1, confidence: 1,
      notes: 'Revenge trade after morning loss. TSLA wasn\'t on the focus list. Market was choppy. Impulse entry — broke two core rules at once.' }),

  // Pullback to 20MA — SPY swing
  trade('seed-11', 'SPY', 'long', 591.40, 597.20, 25, '2026-01-16T10:00', '2026-01-16T12:30', 'pullback-20ma',
    { stop: 588.00, target: 602.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Clean pullback to 20-day MA. Third test — held each time. Market structure still bullish. Bought the bounce.' }),

  // Midday pullback to 10MA — MSFT (covers 11am)
  trade('seed-27', 'MSFT', 'long', 412.50, 424.80, 20, '2026-01-14T11:15', '2026-01-14T14:00', 'pullback-10ma',
    { stop: 407.00, target: 435.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'MSFT pulled back to 10-day MA mid-morning after a strong open. Tight range, low volume pullback. Bought when it reclaimed the 10-day with volume.' }),

  // Sold too early — META, exited before it ran (covers 1pm)
  trade('seed-29', 'META', 'long', 624.00, 628.50, 12, '2026-01-14T13:45', '2026-01-14T15:00', 'breakout',
    { stop: 616.00, target: 660.00, fees: 1.00, mistakes: ['sold-too-early'], rulesBroken: ['trail-ma'],
      emotionEntry: 3, emotionExit: 2, confidence: 3,
      notes: 'Sold at +$4.50 because I was nervous. Stock ran to $645 the next day. Should have trailed the 10-day MA instead of exiting emotionally.' }),

  // EP — SPY options at lunch (covers 12pm + options)
  trade('seed-28', 'SPY', 'long', 4.20, 7.35, 200, '2026-01-15T12:30', '2026-01-15T15:00', 'episodic-pivot',
    { assetClass: 'option', stop: 2.80, target: 9.00, fees: 2.00, emotionEntry: 4, emotionExit: 5, confidence: 4,
      notes: 'SPY calls on a gap-up EP follow-through day. Bought the midday flag breakout. Volume confirmed. Options gave good leverage on the move.' }),

  // Breakout — MSFT multi-day swing
  trade('seed-12', 'MSFT', 'long', 418.50, 433.00, 20, '2026-01-21T09:52', '2026-01-21T14:45', 'breakout',
    { stop: 413.00, target: 445.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Range expansion from tight 2-week base. Volume 2x average on breakout. Took first partial at +3.5%, trailing rest with 10-day MA.' }),

  // HTF — TSLA gap fill (covers morning)
  trade('seed-34', 'TSLA', 'long', 368.00, 381.50, 22, '2026-01-22T09:40', '2026-01-22T11:30', 'high-tight-flag',
    { stop: 362.00, target: 395.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'HTF — stock up 95% in 3 weeks, tight 18% flag consolidation on low volume. Broke out on 2.5x volume. Took half off at +3.5%.' }),

  // Added to loser — AMD (mistake)
  trade('seed-13', 'AMD', 'long', 120.80, 117.60, 50, '2026-01-23T10:25', '2026-01-23T11:05', 'breakout',
    { stop: 118.00, target: 130.00, fees: 1.50, mistakes: ['added-to-loser', 'entered-too-early'], rulesBroken: ['no-add-to-loser'],
      emotionEntry: 2, emotionExit: 2, confidence: 2,
      notes: 'Bought the breakout, stock faded back. Added more size hoping it would recover. Compounded the mistake. Should have cut at the stop.' }),

  // Monday breakout — AAPL (covers Monday)
  trade('seed-25', 'AAPL', 'long', 236.20, 242.80, 40, '2026-01-26T09:52', '2026-01-26T12:15', 'breakout',
    { stop: 232.00, target: 252.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Monday breakout from prior week\'s tight consolidation. Market structure strong. Waited for the 5-min ORH, volume confirmed. Clean entry.' }),

  // EP — META perfect setup
  trade('seed-14', 'META', 'long', 612.00, 641.50, 15, '2026-01-27T09:55', '2026-01-27T15:30', 'episodic-pivot',
    { stop: 600.00, target: 660.00, fees: 1.00, emotionEntry: 4, emotionExit: 5, confidence: 5,
      notes: 'EP — 11% gap on massive earnings beat. Stock had been flat for 5 months prior. Volume 4x ADV in first 15 min. Bought 1-min ORH. Held all day. Took half at +5%, trailed rest. +$441 net.' }),

  // Breakout — NVDA multi-day hold
  trade('seed-15', 'NVDA', 'long', 135.20, 152.60, 30, '2026-01-30T10:05', '2026-01-30T15:45', 'breakout',
    { stop: 130.00, target: 160.00, fees: 1.50, emotionEntry: 4, emotionExit: 5, confidence: 4,
      notes: 'Breakout from 5-week base. High tight pattern before this. Volume strong. Held for 5 days before taking first partial. Remainder trailing 10-day MA.' }),

  // ── February 2026 ──────────────────────────────────────────────────────────

  // Wrong market — QQQ breakout on weak market
  trade('seed-16', 'QQQ', 'long', 518.40, 510.20, 25, '2026-02-03T09:58', '2026-02-03T10:45', 'breakout',
    { stop: 514.00, target: 530.00, fees: 1.00, mistakes: ['wrong-market', 'oversize'], rulesBroken: ['market-structure'],
      emotionEntry: 3, emotionExit: 1, confidence: 3,
      notes: 'Forced a breakout trade when SPY was below its 20-day MA. Oversized. Market was not in the right structure for breakouts.' }),

  // Afternoon pullback-20MA — NVDA short (covers 2pm)
  trade('seed-30', 'NVDA', 'long', 134.00, 141.80, 35, '2026-02-04T14:30', '2026-02-04T15:50', 'pullback-20ma',
    { stop: 130.50, target: 148.00, fees: 1.50, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Afternoon pullback to rising 20-day MA. Stock had been surfing the MA for weeks. Bought the third touch. Held into next day.' }),

  // Pullback to 10MA — AAPL re-entry
  trade('seed-17', 'AAPL', 'long', 232.80, 241.60, 40, '2026-02-05T10:12', '2026-02-05T13:55', 'pullback-10ma',
    { stop: 228.00, target: 248.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Three-day pullback to 10-day MA on low volume. Stock held the MA cleanly. Bounced with expanding volume.' }),

  // EP — TSLA news gap (big winner)
  trade('seed-18', 'TSLA', 'long', 350.50, 374.20, 20, '2026-02-10T09:50', '2026-02-10T15:20', 'episodic-pivot',
    { stop: 342.00, target: 390.00, fees: 1.00, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'EP on major contract announcement. Gap 11%, volume hit ADV in 12 minutes. Stock had been sideways 4 months. Textbook. Held all day. +$472 net.' }),

  // Power hour breakout — SPY (covers 3pm)
  trade('seed-32', 'SPY', 'long', 598.40, 602.80, 30, '2026-02-11T15:15', '2026-02-11T15:55', 'breakout',
    { stop: 596.00, target: 607.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'Power hour range expansion. Market trended up all day, continued into the close.' }),

  // No stop — SPY, broke the core rule
  trade('seed-19', 'SPY', 'long', 602.50, 597.30, 30, '2026-02-12T10:20', '2026-02-12T10:55', 'pullback-20ma',
    { stop: 599.00, target: 610.00, fees: 1.00, mistakes: ['no-stop', 'entered-too-early'], rulesBroken: ['stop-at-lows'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'Bought the 20-day MA pullback but didn\'t set a hard stop before entering. When it faded I froze. Broke the one rule I can\'t break.' }),

  // Breakout — MSFT swing hold
  trade('seed-20', 'MSFT', 'long', 406.20, 425.40, 15, '2026-02-17T10:08', '2026-02-17T14:30', 'breakout',
    { stop: 399.00, target: 438.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 5,
      notes: 'Range expansion from tight 3-week base. Took first partial at +4.5% on day 4. Trailing remainder with 10-day MA.' }),

  // EP — NVDA (second big winner)
  trade('seed-21', 'NVDA', 'long', 128.60, 141.80, 50, '2026-02-19T09:52', '2026-02-19T15:50', 'episodic-pivot',
    { stop: 124.00, target: 150.00, fees: 1.50, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'Second NVDA EP this month on analyst upgrade + guidance raise. Volume 3.5x ADV. Stock had been consolidating 6 weeks. +$658 net. Followed the plan exactly.' }),

  // Held below MA — AMD (mistake, Friday)
  trade('seed-22', 'AMD', 'long', 118.40, 114.40, 40, '2026-02-20T10:15', '2026-02-20T11:00', 'pullback-10ma',
    { stop: 115.50, target: 126.00, fees: 1.50, mistakes: ['held-below-ma'], rulesBroken: ['trail-ma'],
      emotionEntry: 3, emotionExit: 2, confidence: 2,
      notes: 'Stock closed below the 10-day MA two days ago and I didn\'t exit. Hoped it would recover. It didn\'t. Rule is clear: close below the MA = exit.' }),

  // Monday reversal — QQQ wrong call (covers Monday)
  trade('seed-26', 'QQQ', 'long', 512.00, 507.60, 25, '2026-02-23T10:10', '2026-02-23T10:50', 'pullback-20ma',
    { stop: 509.50, target: 522.00, fees: 1.00, mistakes: ['wrong-market', 'entered-too-early'], rulesBroken: ['market-structure'],
      emotionEntry: 2, emotionExit: 1, confidence: 2,
      notes: 'Bought 20-day MA pullback but QQQ was already in a short-term downtrend. Market structure was wrong. Stopped out.' }),

  // HTF — AAPL (covers Tuesday)
  trade('seed-23', 'AAPL', 'long', 240.50, 251.80, 35, '2026-02-24T09:55', '2026-02-24T14:15', 'high-tight-flag',
    { stop: 235.00, target: 265.00, fees: 1.00, emotionEntry: 4, emotionExit: 4, confidence: 4,
      notes: 'HTF — AAPL up 80% in 5 weeks, tight 20% flag consolidation. Broke out with 2x volume. First partial at +4.5%, trailing rest.' }),

  // EP — META all-time high breakout
  trade('seed-24', 'META', 'long', 660.00, 691.50, 12, '2026-02-25T10:05', '2026-02-25T15:45', 'episodic-pivot',
    { stop: 648.00, target: 720.00, fees: 1.00, emotionEntry: 5, emotionExit: 5, confidence: 5,
      notes: 'META EP on massive beat and guidance raise. ATH breakout on 4x volume. Stock had been building a base 5 months. Bought 1-min ORH. Held all day. Best trade of the month.' }),
]

const SAMPLE_JOURNAL_ENTRIES = [
  { date: '2025-12-03', mood: 4, market_condition: 'trending', content: '## Pre-Market Plan\n\nMarket in strong uptrend. Focus list has 3 names with tight setups. NVDA has been building a base above the 10-day MA for 3 weeks — looks ready for range expansion.\n\n## Review\n\nNVDA breakout played out cleanly. Volume confirmed in the first 20 minutes. Took first half off at +$7, trailing rest. +$748 net. Followed the process — patience paid off.' },
  { date: '2025-12-05', mood: 2, market_condition: 'choppy', content: '## Notes\n\nBad day. Bought the AAPL EP before the opening range high was confirmed — volume hadn\'t printed yet. Got shaken out.\n\nThe rule is clear: **wait for the ORH to form, then buy the break with volume**. I skipped the wait because I was afraid of missing the move.\n\nWhat I need to do differently:\n- Let the 1-min candle close before entering\n- Volume must hit ADV in the first 15-20 min for an EP\n- If I miss the entry, I miss it — there will be other setups' },
  { date: '2025-12-09', mood: 5, market_condition: 'trending', content: '## TSLA Breakout\n\nClean range expansion from a 6-week base. ADR is high on this name, which is exactly what I want. Stock surfed the 10-day MA throughout the consolidation.\n\nHeld through two small pullbacks because the 10-day MA held each time. That\'s the plan — exit only on a close below the MA.\n\nThis is what patience looks like.' },
  { date: '2025-12-19', mood: 5, market_condition: 'trending', content: '## META EP — Best Trade of December\n\nMETA had been flat for 4+ months. Then a 12% earnings gap on triple-digit revenue growth. Volume was 3x ADV in the first 20 minutes.\n\nThis is the ideal EP setup:\n- Stock neglected for 3-6 months ✓\n- Gap 10%+ on major catalyst ✓\n- Volume confirms immediately ✓\n- Strong fundamental numbers ✓\n\n+$386 net. Held overnight and took rest off next morning when it stalled.' },
  { date: '2026-01-09', mood: 5, market_condition: 'volatile', content: '## NVDA EP — Biggest Trade of the Year So Far\n\nNVDA gapped 14% on blowout earnings. ADV hit in the first 10 minutes. I bought the 1-minute ORH and held all day.\n\n+$688 net.\n\nKey things I did right:\n1. NVDA was on the focus list pre-market — I was ready\n2. Waited for volume confirmation before entering\n3. Took first half off at +12%, let the rest run\n4. Exited near HOD when momentum faded\n\nThis is what Kullamägi means by episodic pivot. A neglected stock, a major catalyst, and institutional volume flooding in.' },
  { date: '2026-01-12', mood: 4, market_condition: 'trending', content: '## Pre-Market Futures Trade\n\nTraded /ES pre-market. Overnight range was tight, clear breakout level above the previous day\'s high.\n\nMarket structure check first thing — SPY and QQQ both above the 20-day MA and trending. Green light.\n\nGot the ORH entry and held through the open. Good clean trade.' },
  { date: '2026-01-13', mood: 1, market_condition: 'choppy', content: '## Revenge Trade — Broke Two Rules at Once\n\nTook a loss in the morning, then immediately jumped into TSLA which wasn\'t on my focus list. Market was choppy. Lost money.\n\nThis is exactly what I\'m trying to eliminate. **Two rules broken:**\n1. Market structure wasn\'t right for breakouts\n2. TSLA wasn\'t on the focus list — it was an impulse trade\n\nProcess: after any loss, step away for 10 minutes before even looking at the screen again. Only re-enter if there\'s a pre-planned setup triggering.' },
  { date: '2026-01-27', mood: 5, market_condition: 'trending', content: '## META EP — Perfect Execution\n\nThis is what a textbook episodic pivot looks like:\n- META flat for 5 months before this\n- Gapped 11% on massive earnings beat\n- Volume was 4x ADV in the first 15 minutes\n- Bought 1-min ORH, held all day\n- Took half at +5%, trailed rest with 10-day MA\n\n+$441 net. The plan was written pre-market. I just executed it.' },
  { date: '2026-02-10', mood: 5, market_condition: 'trending', content: '## TSLA EP\n\nMajor contract news. Gap 11%, stock had been sideways 4 months. Volume print in 12 minutes.\n\nTwo things I did well:\n1. Waited for the ORH to form before entering — didn\'t jump the gun\n2. Set stop at the day\'s low before entry — hard stop, no exceptions\n\nHeld all day. Took first partial at +6%, exited rest near the close. +$472 net.' },
  { date: '2026-02-12', mood: 2, market_condition: 'volatile', content: '## Broke the Stop Rule\n\nBought a 20-day MA pullback and didn\'t set a hard stop before entering. When it started fading I froze instead of cutting.\n\n**The stop goes in before the order, every single time.** This is not optional. It\'s the one rule I absolutely cannot break.\n\nLoss was $155 — avoidable.' },
  { date: '2026-02-19', mood: 5, market_condition: 'trending', content: '## NVDA EP Again\n\nSecond NVDA EP this month. Analyst upgrade + guidance raise. 6-week base before the move. Volume 3.5x ADV.\n\n+$658 net.\n\nI\'m getting much better at holding winners. The process is:\n1. Take first partial at 20%+ or after 3-5 days\n2. Move stop to breakeven on the remainder\n3. Trail with 10-day MA\n4. Only exit on a close below the MA\n\nWhen the stock gives you no reason to sell, you don\'t sell.' },
  { date: '2026-02-25', mood: 5, market_condition: 'trending', content: '## META EP — All-Time High\n\nMETA EP on a massive beat and guidance raise. Stock had been building a 5-month base. Gapped to all-time highs on 4x volume.\n\nBought the 1-min ORH. Held all day. Best trade of February.\n\nThe process is working. The focus list discipline keeps me in only the best setups. Quality over quantity — that\'s the edge.' },
]

export function loadSampleData(): void {
  const sorted = [...SAMPLE_TRADES].sort((a, b) =>
    b.entry_time.localeCompare(a.entry_time)
  )
  replaceTrades(sorted)

  for (const entry of SAMPLE_JOURNAL_ENTRIES) {
    upsertJournalEntry(entry)
  }
}
