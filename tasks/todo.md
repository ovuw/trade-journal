# Trade Journal — Session Handoff

## If you are a new agent, read this first
- Project root: `/Users/ryanjones/projects/trade-journal/`
- Full memory: `/Users/ryanjones/.claude/projects/-Users-ryanjones/memory/MEMORY.md`
- Past mistakes + rules: `tasks/lessons.md` — read this before touching anything
- Full original build spec (archived): `tasks/build-plan-archive.md`

## Current State
- **Version:** 0.4.0 (released 2026-02-28)
- **Status:** All 12 phases + full audit pass complete. App is in daily use.
- Stack: Tauri + React + TypeScript + localStorage (primary) + Supabase (optional sync)
- Auto-updater live via GitHub Releases — triggers on `v*` tags
- GitHub repo is **public** (required for unauthenticated asset downloads / auto-updater)

## Key Paths
- Types + default data: `src/types/index.ts` (DEFAULT_RULES, DEFAULT_CHECKLIST_LABELS)
- All localStorage ops: `src/lib/db.ts`
- Pure trade helpers (P&L, session detection): `src/lib/tradeUtils.ts`
- Supabase client (dynamic config): `src/lib/supabase.ts`
- Trade sync logic (incl. exported `mergeTrades`): `src/lib/sync.ts`
- Screenshot storage: `src/lib/storage.ts`
- Image compression util: `src/lib/imageUtils.ts`
- Unit tests: `src/__tests__/` (tradeUtils, syncMerge, db)

## Design System
- Tailwind tokens only — never hardcode hex
- accent=#6366f1, profit=#10b981, loss=#ef4444, bg-primary=#0d0f14
- Config: `tailwind.config.js`

## To Release a New Version
1. Bump `version` in `src-tauri/tauri.conf.json` AND `src-tauri/Cargo.toml`
2. Run `npx tsc --noEmit` and `npm test` — both must pass
3. Commit, then: `git tag vX.Y.Z && git push origin main --tags`
4. GitHub Actions builds macOS + Windows, signs, generates combined `latest.json`, publishes release
5. GitHub repo: `ovuw/trade-journal`

## Completed This Session (2026-02-28)

### Quick Entry modal
- `src/components/QuickTradeModal.tsx` — 8-field modal (ticker, direction, asset class, entry/exit price, qty, setup tag, entry time)
- Sidebar button (⚡) in `Layout.tsx` — expanded shows label, collapsed shows icon with tooltip
- Live P&L preview, green checkmark on save, Supabase fire-and-forget sync

### Accessibility fixes (UX audit + app audit)
- QuickTradeModal: Escape key closes, Tab focus trapped inside, `role="dialog"` + `aria-modal` + `aria-labelledby`, `htmlFor`/`id` on all fields, `aria-pressed` on toggles, `aria-live` on P&L preview
- NewTrade: `Label` component accepts `htmlFor`, `PriceInput` accepts `id` — all 10 form fields wired
- Layout: `aria-label` on `<aside>`, `<nav>`, `<main>`

### Code quality (app audit)
- **Code splitting**: all 12 pages wrapped in `React.lazy` + `<Suspense>` in `App.tsx`
- **Error Boundary**: `src/components/ErrorBoundary.tsx` — catches unhandled crashes, shows recoverable UI
- **tradeUtils.ts**: extracted `detectSession`, `nowLocal`, `calcPnl`, `calcResultPct` from NewTrade + QuickTradeModal into `src/lib/tradeUtils.ts` (was duplicated)
- **mergeTrades()**: extracted pure merge algorithm from `syncTrades()` in `sync.ts` — now exported and testable
- **Unit tests**: 47 tests across 3 files (`tradeUtils`, `syncMerge`, `db`) using Vitest + happy-dom
- **Windows CI workflow**: `.github/workflows/release.yml` now has 3 jobs — `build` (matrix), and new `finalize` job that downloads both platform `.sig` artifacts and generates combined `latest.json` with `darwin-aarch64` + `windows-x86_64`
- **README.md**: written — features, dev setup, project structure, release workflow

## Completed This Session (2026-02-28, continued)

### IBKR Auto-Import (Flex Query)
- `src/lib/ibkr.ts` — Flex Query two-step API, XML parsing (`parseLots`, `parseDateTime`, `parseAssetClass`), `syncIbkr()` with duplicate detection + price-only update
- `src/hooks/useIbkrSync.ts` — auto-sync on launch (5s delay, fires after Supabase sync), `tj:ibkr-synced` / `tj:ibkr-error` events
- `src/__tests__/ibkrParser.test.ts` — 17 new tests (parseDateTime, parseAssetClass, parseLots edge cases)
- `src-tauri/src/lib.rs` — `fetch_url` Tauri command via `reqwest` (bypasses CORS)
- `src-tauri/Cargo.toml` — `reqwest = { version = "0.12", features = ["rustls-tls"] }`
- `src/types/index.ts` — `ibkr_transaction_id?: string | null` added to Trade
- `src/lib/db.ts` — `IbkrConfig`, `getIbkrConfig()`, `saveIbkrConfig()` added
- `src/pages/Settings.tsx` — IBKR Auto-Import section (token, query ID, auto-sync toggle, Import Now button, result/error feedback)
- `src/App.tsx` — `useIbkrSync()` wired in
- Tests: 86 total (69 prior + 17 new), all pass. `tsc --noEmit` zero errors.

## Pending Work

### Verify Windows auto-updater
The v0.4.0 CI run completed including the Windows build and `latest.json` generation.
- Confirm `latest.json` has both `darwin-aarch64` and `windows-x86_64` entries ← check once Windows machine available
- Verify Windows app shows update dialog on next version

### Secure credentials (low priority — personal use)
Anthropic API key + Supabase credentials stored as plaintext in localStorage.
Future: consider `tauri-plugin-stronghold` or OS keychain.

## Tsc Rule
Always run `npx tsc --noEmit` after every TypeScript change. Zero errors required before marking anything done.
Also run `npm test` — 86 tests must pass.

## UX Audit (2026-02-28) — COMPLETE ✓

All 14 items shipped. See files modified for details.
- [x] Toast system (Toast.tsx + Layout + NewTrade sync/save toasts)
- [x] Onboarding banner (Dashboard, dismissable, tj_onboarding_complete key)
- [x] Trade Log keyboard nav (↑↓ navigate, Enter expand/collapse, focus ring)
- [x] `?` shortcut modal (KeyboardShortcutsModal.tsx)
- [x] UpdaterDialog release notes scrollable (max-h-32 overflow-y-auto)
- [x] Analytics + Review empty states (icon + heading + Log a Trade → CTA)
- [x] Checklist 100% delight (CheckCircle icon + animate-pulse)
- [x] Dashboard stat card trend deltas (vs prior period for today/week/month)
- [x] AI Analysis streaming indicator (3-dot bounce animation at top)
- [x] QuickTradeModal draft persistence (tj_draft_quick_trade)
- [x] Undo after single trade delete (toast with Undo action)
- [x] Analytics + Review aria (role="group" + aria-label on period filters, aria-expanded on rule rows)
- [x] Journal textarea aria-label
- [x] Push notifications — already implemented in Settings.tsx (verified, no change needed)

### Design — Consider light mode toggle (low priority — dark is a deliberate design choice for trading)

## Math Audit (2026-02-28)

### Summary

**Files audited:** `tradeUtils.ts`, `analyticsUtils.ts`, `Analytics.tsx`, `Dashboard.tsx`, `TradeLog.tsx`, `NewTrade.tsx`, `Review.tsx`, `PositionCalculator.tsx`, `QuickTradeModal.tsx`

**Correct (no action needed):**
- P&L formula (long/short): ✓ `tradeUtils.ts:35-37`
- Result % on position cost: ✓ `tradeUtils.ts:41-43`
- Win rate (all pages use `pnl > 0`): ✓
- Profit factor (`grossProfit / grossLoss`, ∞ sentinel): ✓ `Dashboard.tsx:152`
- Max drawdown (peak-tracking loop, starts from 0): ✓ `Dashboard.tsx:157-163`
- Equity curve (rounds each step to 2dp): ✓ `Dashboard.tsx:183`
- Actual R (`pnl / initial_risk`): ✓ `NewTrade.tsx:233`
- Planned R:R (`|target-entry| / |entry-stop|`): ✓ `NewTrade.tsx:231`, `PositionCalculator.tsx:47`
- Position size calculator (`floor(riskDollars / stopDist)`): ✓ `PositionCalculator.tsx:41`
- DOW / time-of-day grouping: ✓ `Analytics.tsx:153-180`
- Streak tracking: ✓ `analyticsUtils.ts:35-55`
- Violation rate, rule win/loss comparison, checklist adherence: ✓ `Review.tsx`
- Float equality: no direct `===` comparisons on floats found anywhere ✓
- Cost basis / realized vs. unrealized: N/A — app records only closed trades

**Partial / Incorrect — see actionable items below**

### Actionable Items

- [x] **avgLoss definition inconsistent** — `Dashboard.tsx:147` uses `pnl <= 0` (includes break-even trades in loss bucket), while `analyticsUtils.ts:62` and `Review.tsx:313` use `pnl < 0`. If any break-even trade (pnl = 0) exists, Dashboard avgLoss is lower than Analytics avgLoss for the same period. Fix: change `Dashboard.tsx:147` to `trades.filter(t => t.pnl < 0)` for consistency.
- [x] **EV overstates loss side when break-even trades exist** — `analyticsUtils.ts:68` uses `(100 - winRate) / 100` as P(loss), but when break-even trades exist P(win) + P(loss) < 1. This overstates expected losses in the EV formula. Correct formula: `(wins.length / ts.length) * avgWin - (losses.length / ts.length) * avgLoss`.
- [x] **Trade P&L not rounded to 2dp on save** — `NewTrade.tsx:226` stores raw float `(exit - entry) * qty - fees`. For prices like $10.01 × 33 shares, result can be `99.99999...` instead of `100.00`. The equity curve rounds at each step but individual records don't. Fix: `Math.round(pnl * 100) / 100` before storing, and same for `result_pct`. Low impact in practice for equities.

## App Audit (2026-02-28) — COMPLETE ✓

- [x] Performance — `useMemo` added for all expensive derivations in Analytics, Dashboard, TradeLog
- [x] Performance — QuickTradeModal draft save debounced at 400ms
- [x] Database — Schema migrations runner (`runMigrations()` in db.ts, `tj_schema_version` key)
- [x] Database — Screenshot storage budget enforced (`estimateLocalStorageBytes` + 8MB quota guard)
- [x] Database — Orphaned screenshot cleanup added to `deleteTrades()` in db.ts
- [x] QA / Testing — 22 unit tests added for analyticsUtils (`calcStreak`, `calcSetupBreakdown`, `calcRuleBreakdown`) — 69 total
- [x] Error Monitoring — ErrorBoundary writes structured crash log to `tj_crash_log` (last 5 entries), "Copy error report" button in error UI
- [x] Caching — Module-level `_tradesCache` in db.ts, invalidated on every write
- [x] Accessibility — All Recharts charts wrapped in `<div role="img" aria-label="...">`
- [x] Accessibility — `+` prefix on all positive P/L values across Dashboard, TradeLog, Analytics
- [x] E2E tests — intentionally skipped; unit tests cover calculation logic sufficiently
- [x] Sentry — intentionally skipped; replaced by local crash log in ErrorBoundary
- [ ] Security — Anthropic API key + Supabase credentials in plaintext localStorage; consider `tauri-plugin-stronghold` (low priority — personal use app)
