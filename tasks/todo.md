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
- [x] Phase 12: COMPLETE — All 16 polish/hardening tasks done (see tracker below). App is daily-use ready.
- [x] Auto-updater: COMPLETE — Signing key pair generated, tauri.conf.json configured (pubkey + GitHub endpoint), GitHub Actions release.yml triggers on v* tags, builds macOS + Windows, signs and publishes. UpdaterDialog.tsx auto-checks on launch. Settings page has manual check. v0.3.0 released. To ship next version: bump version in tauri.conf.json + Cargo.toml, commit, push tag v0.X.X.

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
- **Design system (Pro Terminal)**: Inter font, accent=#6366f1 (indigo), profit=#10b981, loss=#ef4444, bg-primary=#0d0f14. All colors via Tailwind tokens — never hardcode hex in components.
- Supabase for sync instead of S3/R2 (simpler, all-in-one)
- Tauri over Electron (lighter, ~5MB vs 150MB)
- P&L Dashboard is the home page (not rule violations)
- Rule violations/review is a dedicated page one click away in sidebar
- Position sizing calculator is live/inline on the New Trade form (not buried in settings)
- localStorage namespace: all keys prefixed `tj_*`
- Tag system: setup tags (`tj_setup_tags`) and mistake tags (`tj_mistake_tags`) are user-editable in Playbook, seeded from `DEFAULT_SETUP_TAGS`/`DEFAULT_MISTAKE_TAGS` in `src/types/index.ts` on first run
- Trade session auto-detected from entry_time: pre-market 4:00–9:29, RTH 9:30–15:59, AH 16:00–20:00
- Screenshot compression: images compressed to max 1280px JPEG 0.75 quality via `src/lib/imageUtils.ts` before localStorage storage
- Keyboard shortcuts: N=new trade, L=trade log, D=dashboard, Cmd+S=save trade, Esc=blur (guards against input focus)

## Notes for Next Agent
- User trades stocks, long only, using Kullamägi (Qullamaggie) methodology
- When you start a session, read this file + `tasks/lessons.md` + check `memory/MEMORY.md` if it exists
- 12 custom trading rules + 8-step morning checklist are in `src/types/index.ts` → `DEFAULT_RULES` and `DEFAULT_CHECKLIST_LABELS`
- "Reset Rules & Checklist" button in Settings keeps these up to date without wiping trade data
- Dashboard checklist reads from `getChecklistItems()` in db.ts — NOT a hardcoded constant
- GitHub repo: `ovuw/trade-journal` — secrets `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` already set
- To release a new version: bump `version` in `src-tauri/tauri.conf.json` AND `src-tauri/Cargo.toml`, commit, `git tag vX.Y.Z && git push origin main --tags`
- Current version: 0.3.0 (released 2026-02-27)

## Pending Work
- **None.** All planned work is complete. See Phase 12 progress tracker below.

---

## Phase 12 — Polish & Hardening (Daily-Use Readiness)

> **Context for new agents:** All phases 1–11 are complete. The app is functional but needs hardening
> before daily use. Tasks below are ordered by priority — complete them in order.
> After each task: run `npx tsc --noEmit` (must pass), test the feature manually, commit.
> Project root: `/Users/ryanjones/projects/trade-journal/`
> Design system: `tailwind.config.js` — accent=#6366f1, profit=#10b981, loss=#ef4444, bg-primary=#0d0f14

---

### P12-01 — Fix hardcoded old colors in Analytics and Review [x]
**Status:** DONE
**What:** Analytics.tsx and Review.tsx (and NewTrade.tsx rules color) still reference the old color palette via hardcoded hex values: `#00c896` (old profit), `#ff4d4d` (old loss), `#21262d`/`#30363d` (old borders), `#484f58` (old text-muted), `#d29922` (old warning). These need updating to the new palette.
**Note:** The audit incorrectly said these were duplicates — they are distinct pages. Review = fix your mistakes. Analytics = find your edge.
**Files:** `src/pages/Analytics.tsx`, `src/pages/Review.tsx`, `src/pages/NewTrade.tsx`
**Acceptance:** No old hex values remain in any page file. Charts use new palette colors.

---

### P12-02 — Fix UpdaterDialog theme [ ]
**Status:** TODO
**What:** `src/components/UpdaterDialog.tsx` uses hardcoded Tailwind colors (`gray-900`, `gray-800`, `gray-700`, `gray-600`, `emerald-600`, `emerald-500`) instead of the app's design system (`bg-bg-card`, `border-border`, `text-text-primary`, `accent`, `profit`, etc.). It visually clashes with the rest of the app.
**Why:** When an update is available this dialog appears over the entire app. It looking completely different breaks immersion and looks like a bug.
**Files:** `src/components/UpdaterDialog.tsx`
**Approach:** Replace all hardcoded color classes with the app's Tailwind tokens. Also add a manual "Check for updates" button to the Settings page (see P12-10) while you're in the file.
**Acceptance:** Dialog uses `bg-bg-card border-border text-text-primary accent profit` etc. No `gray-*` or `emerald-*` classes remain.

---

### P12-03 — Customizable setup tags and mistake tags [ ]
**Status:** TODO
**What:** `DEFAULT_SETUP_TAGS` and `DEFAULT_MISTAKE_TAGS` in `src/types/index.ts` are hardcoded constants — users can't add, edit, or delete their own setups or mistake categories. These are referenced in the New Trade form, Trade Log filters, and Analytics.
**Why:** Setup tags are the most-used journaling feature (tagged on every trade). A trader using Qullamaggie methodology has specific setups (EP, Stage 2 breakout, etc.) that don't match the defaults. This feels broken in daily use.
**Approach:**
- Add `getSetupTags()` and `saveTags()` functions to `src/lib/db.ts` — store in localStorage key `tj_tags`, seed with DEFAULT_SETUP_TAGS on first run
- Add `getMistakeTags()` (similar) seeded from DEFAULT_MISTAKE_TAGS
- Add a "Tags" section in `src/pages/Playbook.tsx` (or Settings) with add/edit/delete UI for both setup and mistake tags
- Update `src/pages/NewTrade.tsx` to call `getSetupTags()` / `getMistakeTags()` instead of importing the constants
- Update `src/pages/TradeLog.tsx` filter to use `getSetupTags()`
- Update `src/pages/Dashboard.tsx` and `src/pages/Review.tsx` references similarly
**Files:** `src/lib/db.ts`, `src/types/index.ts`, `src/pages/Playbook.tsx`, `src/pages/NewTrade.tsx`, `src/pages/TradeLog.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Review.tsx`
**Acceptance:** User can add/edit/delete setup tags and mistake tags from the Playbook page. New tags appear in the trade form and filters immediately. `tsc --noEmit` passes.

---

### P12-04 — Playbook strategy notes auto-save [ ]
**Status:** TODO
**What:** The strategy notes textarea in `src/pages/Playbook.tsx` requires the user to click "Save Notes" explicitly. Everything else in the app auto-saves. This inconsistency is jarring.
**Why:** Users don't expect to lose notes — a "Save" button implies they could. Inconsistent with the Journal page which auto-saves every 700ms.
**Files:** `src/pages/Playbook.tsx`
**Approach:** Add a `useEffect` with a 700ms debounce (same pattern as Journal.tsx) that calls `savePlaybookNotes()` whenever the notes content changes. Remove the explicit Save button (or keep it but make it secondary). Show a subtle "Saved" flash indicator.
**Acceptance:** Notes save automatically on change with no button click required. No data loss on navigate away.

---

### P12-05 — Pre-market reminder: prevent duplicate fires [ ]
**Status:** TODO
**What:** `src/hooks/usePreMarketReminder.ts` polls every 60 seconds and fires a notification when the current time matches the configured hour:minute. Since a minute is 60 seconds long and the poll is every 60s, it can fire up to 60 times in one minute if the app runs continuously.
**Why:** Multiple identical notifications in a row is a bad experience that makes users distrust or disable the feature.
**Files:** `src/hooks/usePreMarketReminder.ts`
**Approach:** The hook already stores a `lastFiredDate` string (date only). Change it to store `lastFiredDateTime` as `YYYY-MM-DDTHH:MM` — include the hour and minute. Check that the current `HH:MM` doesn't match `lastFiredDateTime` before firing.
**Acceptance:** Notification fires exactly once per configured time per day even if the app runs continuously through that minute.

---

### P12-06 — Silent sync/storage failures: surface errors [ ]
**Status:** TODO
**What:** Supabase sync errors, screenshot upload failures, and connection issues all fail silently — no feedback to the user. If sync breaks, the user has no idea their data isn't backed up.
**Why:** For a daily-use app handling real trade data, silent data loss risk is unacceptable.
**Files:** `src/pages/Settings.tsx`, `src/hooks/useAutoSync.ts`
**Approach:**
- In `useAutoSync.ts`: if sync fails, dispatch a `tj:sync-error` custom event with the error message
- In `Settings.tsx`: listen for `tj:synced` and `tj:sync-error` events and show a non-blocking toast/banner (e.g. "Sync failed: [reason]" in loss-red, auto-dismisses after 5s)
- Add a sync status indicator to the Settings page header (green dot = synced, red dot = error, gray = local only)
**Acceptance:** When Supabase is unreachable, user sees a visible error message within 5 seconds of the sync attempt.

---

### P12-07 — Danger zone: show trade count before confirming delete [ ]
**Status:** TODO
**What:** The "Clear All Trades" button in `src/pages/Settings.tsx` shows a generic confirmation modal with no information about how much data will be deleted.
**Why:** "Delete all trades" is irreversible. Showing "This will permanently delete 247 trades" gives the user a chance to realize if something is wrong (e.g. they're on the wrong account).
**Files:** `src/pages/Settings.tsx`
**Approach:** Before showing the confirmation dialog, call `getTrades().length` and include the count in the confirmation text: `"This will permanently delete ${count} trade${count !== 1 ? 's' : ''} and all associated data."`. Do the same for "Clear All Data".
**Acceptance:** Confirmation dialog shows the exact trade count. No other behavior changes.

---

### P12-08 — Trade Log: polish empty state [ ]
**Status:** TODO
**What:** When the Trade Log has no trades, or no trades match the active filters, the empty state is functional but bare. New users see a blank table area with just a small text message.
**Why:** Empty states are high-visibility moments. A first-time user's first impression of the Trade Log is this empty state. It should communicate the value of the feature and guide next steps.
**Files:** `src/pages/TradeLog.tsx`
**Approach:** Improve the existing empty state divs (already present at line ~502):
- No trades at all: larger icon, headline "Your trade history lives here", subtext "Log your first trade to start tracking performance", primary CTA button "Log a Trade"
- Filters active but no matches: icon, "No trades match your filters", subtext "Try adjusting or clearing your filters", secondary CTA "Clear Filters"
**Acceptance:** Both empty states look polished and match the app's design system (rounded-xl cards, correct colors).

---

### P12-09 — Journal: filter by mood and market condition [ ]
**Status:** TODO
**What:** `src/pages/Journal.tsx` has a "Recent Entries" list on the right panel but no way to filter it by mood (1-5) or market condition (trending/choppy/volatile/ranging). Users can search text but not search by state.
**Why:** A trader might want to review "all the days I was feeling overconfident (mood 5) and lost" or "all choppy market days". This is a core journaling insight.
**Files:** `src/pages/Journal.tsx`
**Approach:** Add two small filter controls above the recent entries list: a mood filter (dropdown: All moods, 1★–5★) and a market condition filter (dropdown: All conditions, Trending, Choppy, Volatile, Ranging). Filter the `recentEntries` array before rendering.
**Acceptance:** Filtering by mood and/or market condition narrows the recent entries list correctly. Clearing filters restores all entries.

---

### P12-10 — Settings: manual "Check for updates" button [ ]
**Status:** TODO
**What:** There is no way for users to manually trigger an update check. The `UpdaterDialog.tsx` only runs automatically on launch after a 1500ms delay.
**Why:** Users often want to check "is there a new version?" without restarting the app. Standard UX pattern for desktop apps.
**Files:** `src/pages/Settings.tsx`, `src/components/UpdaterDialog.tsx`
**Approach:**
- Extract the update check logic from `UpdaterDialog.tsx` into a shared util or expose a trigger function
- Add a "Check for Updates" button in the Settings page (About/App section or top of page) that manually triggers the check and shows inline feedback ("Up to date" / "v0.2.1 available — install now")
**Acceptance:** Settings page has a working "Check for Updates" button with visible feedback. Auto-check on launch still works.

---

### P12-11 — AI Analysis: save and browse previous analyses [ ]
**Status:** TODO
**What:** `src/pages/AIAnalysis.tsx` streams Claude's analysis to the screen but the result is lost when the user navigates away. Every analysis must be re-generated.
**Why:** AI analyses take 20-30 seconds to generate and cost API credits. Users want to refer back to insights from a previous analysis without regenerating. Also useful to compare "last month's analysis" vs "this month's".
**Files:** `src/pages/AIAnalysis.tsx`, `src/lib/db.ts`
**Approach:**
- Add `saveAnalysis(analysis: { date: string; period: string; content: string })` and `getAnalyses(): Analysis[]` to `db.ts` (localStorage key `tj_ai_analyses`, keep last 10)
- After a stream completes, auto-save the result with today's date + selected period
- Add a "Previous Analyses" dropdown or sidebar list on the AI Analysis page to browse saved results
- Show saved analyses in read-only markdown view
**Acceptance:** Analysis is auto-saved after completion. User can view up to 10 previous analyses without re-generating.

---

### P12-12 — Bulk delete in Trade Log [ ]
**Status:** TODO
**What:** Users can only delete one trade at a time via the expanded row. There's no way to select and delete multiple trades.
**Why:** After importing from a broker CSV, users often need to delete duplicates or bad rows. Deleting 50 trades one-by-one is unusable.
**Files:** `src/pages/TradeLog.tsx`, `src/lib/db.ts`
**Approach:**
- Add a checkbox column (leftmost) in the Trade Log table
- "Select all" checkbox in the header selects/deselects all visible (paginated) rows
- When ≥1 row is selected, show a bulk-action bar above the table: "X selected — Delete selected" (red, with confirm dialog showing count) and "Clear selection"
- Add `deleteTrades(ids: string[])` to `db.ts`
**Acceptance:** User can select multiple trades and delete them in one action with a count confirmation.

---

### P12-13 — Trade session tagging (pre-market / RTH / after-hours) [ ]
**Status:** TODO
**What:** There is no way to tag which market session a trade was taken in (pre-market, regular trading hours 9:30–16:00, after-hours). This is important pattern analysis data.
**Why:** Many traders perform differently in different sessions. Pre-market trades often have different risk profiles. Knowing "I lose money in pre-market" is a high-value insight.
**Files:** `src/types/index.ts`, `src/lib/db.ts`, `src/pages/NewTrade.tsx`, `src/pages/TradeLog.tsx`, `src/pages/Review.tsx`
**Approach:**
- Add `session?: 'pre-market' | 'rth' | 'after-hours'` field to the `Trade` type
- Auto-detect session from `entry_time` on the New Trade form (pre-fill the field, but let user override)
  - Pre-market: 4:00–9:29 ET
  - RTH: 9:30–15:59 ET
  - After-hours: 16:00–20:00 ET
- Add session display to Trade Log (small badge, similar to direction badge)
- Add session breakdown to Review page stats
**Acceptance:** Session field auto-fills on New Trade. Shows in Trade Log. tsc passes.

---

### P12-14 — Trade notes template [ ]
**Status:** TODO
**What:** The "Notes" textarea on the New Trade form is blank. There's no structure to guide what to write.
**Why:** Without a template, most notes end up as vague or inconsistent ("good trade", "got stopped out"). A structured template prompts for thesis, execution quality, and lesson learned — which is the whole point of journaling.
**Files:** `src/pages/NewTrade.tsx`, `src/pages/Playbook.tsx`, `src/lib/db.ts`
**Approach:**
- Add a `getNoteTemplate()` / `saveNoteTemplate()` to `db.ts` (single string, localStorage)
- Add a "Note Template" section to Playbook page where user can edit their template
- Default template:
  ```
  Thesis:

  Execution:

  What went well:

  What to improve:
  ```
- In NewTrade.tsx, pre-fill the notes textarea with the template when form is empty (not when editing an existing trade)
- Show a small "Apply template" button if notes are already filled
**Acceptance:** Notes field pre-fills with template on new trade. Template is editable in Playbook. Editing an existing trade does not overwrite notes.

---

### P12-15 — Keyboard shortcuts [ ]
**Status:** TODO
**What:** No keyboard shortcuts exist. Every action requires mouse navigation.
**Why:** Daily users of a trading journal want speed. Opening the trade form, jumping to the log, and saving a trade should all be single keystrokes. Standard for productivity tools.
**Files:** `src/App.tsx` (or a new `src/hooks/useKeyboardShortcuts.ts`), `src/components/Layout.tsx`
**Shortcuts to implement:**
- `N` → navigate to `/new-trade` (only when not in an input/textarea)
- `L` → navigate to `/trade-log`
- `D` → navigate to `/` (dashboard)
- `Escape` → close any open modal/dialog
- `Cmd/Ctrl + S` → submit the trade form if on `/new-trade`
**Approach:** Add a `useKeyboardShortcuts` hook that registers `keydown` listeners with proper input-focus guards (`document.activeElement.tagName !== 'INPUT'` etc.). Mount it in `App.tsx`.
**Acceptance:** All 5 shortcuts work. No shortcuts fire when user is typing in an input/textarea/select.

---

### P12-16 — Supabase: delete orphaned screenshots on trade delete [ ]
**Status:** TODO
**What:** When a trade is deleted from the Trade Log, its screenshot file in Supabase Storage is NOT deleted. Over time this accumulates orphaned files that cost storage.
**Why:** Data hygiene. Screenshots can be large (even compressed). A user deleting old/test trades should not keep paying for the storage.
**Files:** `src/lib/storage.ts`, `src/lib/db.ts`, `src/pages/TradeLog.tsx`
**Approach:**
- Add `deleteStorageScreenshot(path: string)` to `storage.ts` using the Supabase storage remove API
- In `TradeLog.tsx` `handleDelete()`, after calling `deleteTrade()` and `deleteScreenshots()`, also call `deleteStorageScreenshot(trade.screenshot_id)` if `trade.screenshot_id` is set (fire-and-forget, don't block UI)
**Acceptance:** Deleting a trade with a Supabase screenshot path also removes the file from Supabase Storage. Silent failure is acceptable (same as upload).

---

## Phase 12 Progress Tracker
| Task | Description | Status |
|------|-------------|--------|
| P12-01 | Fix hardcoded old colors in Analytics/Review/NewTrade | [x] DONE |
| P12-02 | Fix UpdaterDialog theme | [x] DONE |
| P12-03 | Customizable setup + mistake tags | [x] DONE |
| P12-04 | Playbook notes auto-save | [x] DONE |
| P12-05 | Pre-market reminder duplicate fix | [x] DONE |
| P12-06 | Surface sync/storage errors | [x] DONE |
| P12-07 | Danger zone shows trade count | [x] DONE |
| P12-08 | Trade Log empty state polish | [x] DONE |
| P12-09 | Journal mood/condition filter | [x] DONE |
| P12-10 | Settings: manual update check | [x] DONE |
| P12-11 | AI Analysis save/history | [x] DONE |
| P12-12 | Bulk delete in Trade Log | [x] DONE |
| P12-13 | Session tagging (pre-market/RTH/AH) | [x] DONE |
| P12-14 | Trade notes template | [x] DONE |
| P12-15 | Keyboard shortcuts | [x] DONE |
| P12-16 | Delete orphaned Supabase screenshots | [x] DONE |
