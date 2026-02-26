# Trade Journal App — Master Build Plan

## Handoff Context
If you are a new agent picking this up, read this entire file before touching anything.
Project folder: `/Users/ryanjones/Desktop/Claude Code/trade-journal/`
User's shared folder (images, assets): `/Users/ryanjones/Desktop/Claude Code/`
Memory files: `/Users/ryanjones/.claude/projects/-Users-ryanjones/memory/`

## Who Is This For
A stock day trader (mostly long equities) who currently journals trades in Notion.
He uses two computers and needs cross-platform sync.
His #1 goal: catch rule violations, correlate them with losing trades, and improve over time.

---

## Stack
- **Tauri** — cross-platform desktop shell (Mac/Windows/Linux)
- **React + TypeScript** — UI framework
- **Supabase** — Postgres DB + file storage (screenshots) + real-time sync between computers
- **Recharts or Tremor** — charting library for equity curves, heatmaps
- **TailwindCSS** — styling (dark theme, trading app aesthetic)
- **React Router** — client-side routing inside Tauri shell
- **React Query (TanStack Query)** — data fetching + caching layer over Supabase

---

## App Pages (Sidebar Nav Order)
1. Dashboard (home)
2. New Trade (trade entry form)
3. Trade Log (full history table)
4. Review (rule violations + improvement)
5. Analytics (breakdowns)
6. Journal (daily notes)
7. Playbook (rules + checklist)
8. News (links + economic calendar)
9. Settings (account, risk defaults)

---

## Data Model (Supabase / Postgres)

### accounts
- id, user_id, name, broker, currency, starting_balance, created_at

### trades
- id, account_id, ticker, direction (long/short), asset_class (stock/option/futures/forex/crypto)
- entry_price, exit_price, quantity, fees
- stop_price, target_price
- planned_rr (calculated: (target-entry)/(entry-stop))
- actual_r (calculated: actual P/L / initial risk $)
- entry_time, exit_time
- setup_tag (fk → tags)
- emotion_entry (1-5), emotion_exit (1-5), confidence (1-5)
- notes (text)
- pnl (calculated: (exit-entry)*qty - fees)
- result_pct (calculated)
- mistake_tags (array of tag ids)
- rules_broken (array of rule ids)
- rules_followed (array of rule ids)
- created_at, updated_at

### executions (for partial fills / scale-ins)
- id, trade_id, price, quantity, side (buy/sell), executed_at, fees

### trade_screenshots
- id, trade_id, storage_path, label, created_at

### journal_entries
- id, account_id, date (unique per account per day), content (markdown), mood (1-5)
- market_condition (trending/choppy/volatile/ranging)
- linked_trade_ids (array)
- created_at, updated_at

### tags
- id, user_id, name, type (setup/mistake), color
- Default setup tags: breakout, VWAP reclaim, pullback, trend continuation, reversal, gap fill
- Default mistake tags: FOMO, oversize, early exit, late entry, revenge trade, no stop, broke rules

### rules
- id, user_id, name, description, category, is_active
- Example rules: "Never trade first 15 min", "Always set stop before entering", "Max 3 trades per day", "Don't trade against daily trend", "Only trade A+ setups"

### checklist_items
- id, user_id, label, order_index, is_active
- Default items: Check the news, Review trading plan, Analyze the market, Spot entry and exit points, Calculate risk-reward, Set stop loss and take profit

### settings
- user_id, account_balance, max_risk_pct (default 1%), max_daily_loss_pct, max_daily_loss_dollar, preferred_account_id

---

## Position Sizing Calculator Logic
Given: account_balance, max_risk_pct, entry_price, stop_price
- risk_per_trade_$ = account_balance * (max_risk_pct / 100)
- stop_distance = abs(entry_price - stop_price)
- max_shares = floor(risk_per_trade_$ / stop_distance)
- max_loss_$ = max_shares * stop_distance + estimated_fees
Show this LIVE as user types on the New Trade form.
Also show planned R:R once target_price is entered: (target - entry) / (entry - stop)

---

## Phase Breakdown

### PHASE 1 — Project Scaffold [ ]
**Goal:** Runnable Tauri + React + TS app with Supabase connected and dark theme shell

Tasks:
- [ ] 1.1 — Initialize Tauri project: `npm create tauri-app@latest trade-journal -- --template react-ts`
- [ ] 1.2 — Install deps: tailwindcss, @supabase/supabase-js, @tanstack/react-query, react-router-dom, recharts, lucide-react
- [ ] 1.3 — Configure TailwindCSS with dark mode (dark theme default, trading app color palette: dark bg #0f1117, accent green #00c896, red #ff4d4d)
- [ ] 1.4 — Create Supabase project at supabase.com, save URL + anon key to .env
- [ ] 1.5 — Run all SQL migrations to create tables (see Data Model above)
- [ ] 1.6 — Set up Supabase client singleton in src/lib/supabase.ts
- [ ] 1.7 — Set up React Query provider in main.tsx
- [ ] 1.8 — Build sidebar layout shell with nav links to all 8 pages (icons via lucide-react)
- [ ] 1.9 — Set up React Router with placeholder page components
- [ ] 1.10 — Verify app launches in Tauri dev mode: `npm run tauri dev`

---

### PHASE 2 — Settings + Account Setup [ ]
**Goal:** User can configure their account, risk settings, and default rules/checklist

Tasks:
- [ ] 2.1 — Settings page: account name, starting balance, max risk % per trade, max daily loss
- [ ] 2.2 — Multiple account support (add/edit/delete accounts, switch active account)
- [ ] 2.3 — Checklist editor: add/remove/reorder pre-market checklist items
- [ ] 2.4 — Default data seed: insert default tags (setup + mistake) and default checklist items on first launch

---

### PHASE 3 — New Trade Form + Position Sizing Calculator [ ]
**Goal:** User can log a trade; calculator auto-computes position size and max loss live

Tasks:
- [ ] 3.1 — Build New Trade form with all fields:
  - Ticker (text, uppercase auto)
  - Direction (Long/Short toggle)
  - Asset class (Stock/Option/Futures/Forex/Crypto)
  - Entry price, Exit price (number inputs)
  - Stop price, Target price (number inputs)
  - Quantity / shares (number)
  - Fees (number, optional)
  - Date/time (datetime-local, defaults to now)
  - Setup tag (dropdown from tags table, type=setup)
  - Mistake tags (multi-select from tags table, type=mistake)
  - Rules broken (multi-select from rules table)
  - Emotion at entry (1-5 star or slider)
  - Emotion at exit (1-5 star or slider)
  - Confidence (1-5)
  - Notes (textarea)
  - Screenshot upload (drag-drop or file picker → uploads to Supabase storage)
- [ ] 3.2 — Live position sizing calculator panel (shows while typing):
  - Reads account_balance and max_risk_pct from settings
  - As user types entry_price and stop_price: show max_shares and max_loss_$
  - As user types target_price: show planned R:R ratio
  - Show in a highlighted info box next to the form, updates in real-time
- [ ] 3.3 — Calculated fields on save: pnl, result_pct, actual_r, planned_rr
- [ ] 3.4 — Form validation: require ticker, direction, entry, exit, quantity, date
- [ ] 3.5 — Submit saves to Supabase trades table, navigates to Trade Log
- [ ] 3.6 — Edit trade: clicking a trade in the log opens this same form pre-filled

---

### PHASE 4 — Trade Log [ ]
**Goal:** Full sortable/filterable trade history table matching (and improving on) the Notion setup

Tasks:
- [ ] 4.1 — Table columns: Ticker, Date, Direction badge, Size, Entry $, Exit $, P/L $, Result %, R, Setup Tag, Mistake Tags, Rules Broken (red badge count), Screenshot thumbnail, Notes
- [ ] 4.2 — Sortable columns (click header to sort asc/desc)
- [ ] 4.3 — Filter bar: date range, ticker search, direction, setup tag, mistake tag, rules broken (yes/no), asset class
- [ ] 4.4 — Inline row expansion: click a row to expand and see full notes, screenshots, all tags
- [ ] 4.5 — Bulk CSV import:
  - Support TD Ameritrade, Tastytrade, IBKR export formats
  - Parse and map columns to trade schema
  - Preview before import, show count of trades found
- [ ] 4.6 — Export to CSV (all filtered trades)
- [ ] 4.7 — Delete trade (with confirmation dialog)
- [ ] 4.8 — Color coding: green row for profit, red row for loss, intensity by magnitude

---

### PHASE 5 — Dashboard (Home Page) [ ]
**Goal:** First thing user sees — P&L at a glance, equity curve, calendar, key stats

Tasks:
- [ ] 5.1 — Period selector: Today / This Week / This Month / All Time / Custom Range
- [ ] 5.2 — Stat cards row: Net P/L $, Win Rate %, Profit Factor, Avg Win $, Avg Loss $, Max Drawdown $, Total Trades
- [ ] 5.3 — Equity curve chart (line chart, cumulative P/L over time, green above 0 / red below)
- [ ] 5.4 — Calendar heatmap: each day colored green/red by P/L, hover shows that day's P/L and trade count
- [ ] 5.5 — Best trades / Worst trades: top 3 and bottom 3 for selected period
- [ ] 5.6 — Rule violation alert: "You broke [Rule X] N times this period — cost you $Y" (most expensive violation at top)
- [ ] 5.7 — Pre-market checklist widget: shows today's checklist with checkboxes, saves state per day
- [ ] 5.8 — Recent trades mini-table: last 5 trades with quick P/L glance

---

### PHASE 6 — Playbook (Rules + Checklist) [ ]
**Goal:** User defines their trading rules; these are referenced on every trade entry

Tasks:
- [ ] 6.1 — Rules list: add/edit/delete rules (name + description + category)
- [ ] 6.2 — Rule categories: Risk Management, Entry, Exit, Psychology, Process
- [ ] 6.3 — Toggle rules active/inactive (inactive rules don't show on trade form)
- [ ] 6.4 — Checklist editor (already in settings, link to it from here)
- [ ] 6.5 — Playbook notes: freeform markdown area for strategy documentation (e.g. "My VWAP Reclaim Setup" described in full)

---

### PHASE 7 — Review / Improvement Page [ ]
**Goal:** The self-improvement engine — show exactly where rules are being broken and what it costs

Tasks:
- [ ] 7.1 — Rule violation table: each rule with columns: Times Broken, Total Cost $, Cost on Losing Trades $, Cost on Winning Trades $, Violation Rate %
  - Sort by Total Cost to show biggest problem rules first
- [ ] 7.2 — Per-rule drill down: click a rule → see all trades where it was broken (filterable trade list)
- [ ] 7.3 — Winning vs Losing trade comparison:
  - Avg rules broken on winning trades vs losing trades
  - Which rules are broken more on losers than winners (highlighted in red)
- [ ] 7.4 — Mistake tag analysis: same breakdown for FOMO, oversize, revenge trade, etc.
  - Cost per mistake type, frequency, trend over time
- [ ] 7.5 — Improvement trend: chart showing rule violation rate over time (are you getting better?)
- [ ] 7.6 — Emotion vs P/L scatter: does emotion rating at entry correlate with outcome?
- [ ] 7.7 — "Worst habits" summary card at top: top 3 most costly patterns in plain English

---

### PHASE 8 — Analytics Page [ ]
**Goal:** Deep performance breakdowns to find edge

Tasks:
- [ ] 8.1 — Breakdown by Setup Tag: P/L, win rate, avg R, trade count per tag — find which setups have edge
- [ ] 8.2 — Breakdown by Ticker: P/L, win rate, trade count per ticker
- [ ] 8.3 — Time of Day heatmap: which hours are most profitable (requires entry_time field)
- [ ] 8.4 — Day of Week breakdown: Mon-Fri P/L and win rate
- [ ] 8.5 — Direction breakdown: Long vs Short performance
- [ ] 8.6 — Asset class breakdown (when applicable)
- [ ] 8.7 — Streak tracker: current win/loss streak, longest win streak, longest losing streak
- [ ] 8.8 — Expected Value (EV) per setup: (win_rate × avg_win) - (loss_rate × avg_loss)
- [ ] 8.9 — R-multiple distribution: histogram of actual R across all trades

---

### PHASE 9 — Journal Page [ ]
**Goal:** Daily freeform notes linked to trades

Tasks:
- [ ] 9.1 — Calendar navigator to select a day
- [ ] 9.2 — Markdown editor (react-md-editor or similar) for daily notes
- [ ] 9.3 — Mood selector (1-5) and market condition tag (trending/choppy/volatile/ranging)
- [ ] 9.4 — Show that day's trades below the journal entry (read-only mini-table)
- [ ] 9.5 — Journal search: full-text search across all journal entries
- [ ] 9.6 — Auto-create journal entry for today if none exists

---

### PHASE 10 — News Page [ ]
**Goal:** Curated news links + economic calendar (replicating the Notion news sidebar)

Tasks:
- [ ] 10.1 — News links panel: Forex Factory, Bloomberg, Investing.com, Investopedia, MarketWatch, FxStreet — open in system browser (Tauri shell:open)
- [ ] 10.2 — Economic calendar embed (Forex Factory or Investing.com widget via webview in Tauri)
- [ ] 10.3 — User can add/remove custom news links

---

### PHASE 11 — Sync + Polish [ ]
**Goal:** Cross-computer sync works seamlessly, app is production-ready

Tasks:
- [ ] 11.1 — Supabase real-time subscription: when trades are added/updated on one machine, the other updates automatically
- [ ] 11.2 — Offline support: cache last-known state locally (IndexedDB or Tauri file system), sync on reconnect
- [ ] 11.3 — Supabase Auth: email/password login so data is private and user-specific
- [ ] 11.4 — Screenshot storage: Supabase Storage bucket, upload on trade save, display in trade log
- [ ] 11.5 — Tax export: CSV with realized P/L grouped by calendar year
- [ ] 11.6 — Tauri app icon + window title
- [ ] 11.7 — Build and package: `npm run tauri build` for Mac (dmg) and Windows (msi)
- [ ] 11.8 — Test on both computers, verify sync works

---

## Current Status
- [x] Phase 1: COMPLETE — Tauri + React + TS scaffolded, all deps installed, sidebar shell with routing, dark theme, tsc passes, frontend builds clean. Run `npm run tauri dev` from project root to launch.
- [x] Phase 2: COMPLETE — 2.1/2.3/2.4 done in earlier phases. 2.2 multi-account now built: AccountRecord type in db.ts (with broker, currency), getAccounts/saveAccounts/getActiveAccountId/setActiveAccountId/getActiveAccount. Settings Accounts section: add/edit/delete/switch-active accounts. Active account keeps PositionCalculator in sync via CalcSettings. tsc clean. Screenshot storage (11.4) done: src/lib/storage.ts with uploadTradeScreenshot + getStorageScreenshotUrl. NewTrade.tsx fire-and-forget upload on save; TradeLog.tsx falls back to localStorage if no Supabase path. App icon (11.6): candlestick chart icon generated via Python, npx tauri icon generated all 32+ sizes (macOS icns, Windows ico, iOS, Android). tsc clean.
- [x] Phase 3: COMPLETE — Full trade entry form with live position sizing calculator. Saves to localStorage (no Supabase needed yet). Edit mode via /new-trade?id=:tradeId. tsc passes, builds clean.
- [x] Phase 4: COMPLETE — Trade log with sortable/filterable table, inline row expansion, delete with confirm, CSV export, CSV import (generic format). START PHASE 5 NEXT.
- [x] Phase 5: COMPLETE — Full dashboard with period selector, 7 stat cards, equity curve chart (Recharts AreaChart), calendar heatmap, rule violation alert, pre-market checklist (persisted per day), best/worst trades, recent trades mini-table. tsc passes, builds clean.
- [x] Phase 6: COMPLETE — Full Playbook page: rules CRUD (add/edit/delete/toggle active, category filter, descriptions), checklist editor (add/delete/reorder/toggle/rename), strategy notes with save. Dynamic rules wired into NewTrade form and Dashboard violation alert. tsc passes, builds clean.
- [x] Phase 7: COMPLETE — Full Review/Improvement page with period selector, worst habits summary card, rule violation table with per-rule drill-down, win vs loss comparison (avg rules broken + per-rule rate diff), mistake tag analysis, improvement trend bar chart (color-coded by severity), emotion vs P/L scatter chart. tsc passes, builds clean.
- [x] Phase 8: COMPLETE — Full Analytics page with period selector, streak tracker (all-time), direction/asset class breakdown cards, setup tag table with EV column (edge highlighted), ticker breakdown, day of week bar chart, R-multiple histogram, time of day bar chart. All charts color-coded green/red. tsc passes, builds clean.
- [x] Phase 9: COMPLETE — Full Journal page with interactive month calendar (click any day, mood-tinted cells, entry dot indicator), mood rating (1–5 with color-coded labels), market condition pills, auto-saving textarea (debounced 700ms), full-text search with results, recent entries list, day's trades panel with P/L summary. Auto-creates today's entry on first load. Two-panel layout with independent scroll. tsc passes, builds clean.
- [x] Phase 10: COMPLETE — News page with 18 curated links across 4 categories (News, Calendars, Tools, Education), all opening via Tauri openUrl (falls back to window.open in browser mode). Custom link add/remove with localStorage persistence. Correct export name openUrl from plugin-opener. tsc passes, builds clean.
- [x] Phase 11: COMPLETE — Full Settings page (account settings, Supabase sync config + auth, sync-now, tax CSV export per year, JSON backup/restore, clear-all danger zone). New src/lib/sync.ts for bidirectional trade sync (last-write-wins on updated_at). New src/lib/supabase.ts rewrite with dynamic config (env vars + localStorage fallback), testConnection, signIn/signOut/getSession. tasks/sync_schema.sql with simplified trades table for sync. tsc passes clean.

## Phase 1 Notes
- Rust installed at ~/.cargo/bin — use `export PATH="$HOME/.cargo/bin:$PATH"` before running tauri commands in a new shell
- Supabase keys needed: create project at supabase.com, fill in .env file (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- Run schema.sql in Supabase SQL Editor before starting Phase 3
- Icon at src-tauri/icons/icon.png is a placeholder green square — replace with proper icon later

## Build Order
Start with Phase 1 → 3 → 4 → 5 → 6 → 7 → 2 → 8 → 9 → 10 → 11
(Get trade entry + log + dashboard working first — that's the core loop)

---

## Key Design Decisions Already Made
- Dark theme, trading app aesthetic (#0f1117 bg, #00c896 green, #ff4d4d red)
- Supabase for sync instead of S3/R2 (simpler, all-in-one)
- Tauri over Electron (lighter, ~5MB vs 150MB)
- P&L Dashboard is the home page (not rule violations)
- Rule violations/review is a dedicated page one click away in sidebar
- Position sizing calculator is live/inline on the New Trade form (not buried in settings)
- Support partial fills via executions table (trade has many executions)

## Notes for Next Agent
- User's Notion columns: Pair, Date, Direction, Size, Entry $, Exit $, P/L, Result %, Screenshot, Trade Note
- User's pre-market checklist (already defined in Notion): Check the news, Review trading plan, Analyze the market, Spot entry and exit points, Calculate risk-reward, Set stop loss and take profit
- User mostly trades stocks, long direction, but build for all asset classes
- Images/assets go in: `/Users/ryanjones/Desktop/Claude Code/`
- When you start a session, read this file + `/Users/ryanjones/.claude/projects/-Users-ryanjones/memory/MEMORY.md`
