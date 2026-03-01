# Trade Journal — Session Handoff

## If you are a new agent, read this first
- Project root: `/Users/ryanjones/projects/trade-journal/`
- Full memory: `/Users/ryanjones/.claude/projects/-Users-ryanjones/memory/MEMORY.md`
- Past mistakes + rules: `tasks/lessons.md` — read this before touching anything
- Full original build spec (archived): `tasks/build-plan-archive.md`

## Current State
- **Version:** 0.4.0 (released 2026-02-28) — next release will be v0.5.0
- **Status:** All features complete. Pushed to main but not yet tagged v0.5.0.
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
- Unit tests: `src/__tests__/` — 86 tests, all passing

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

## Tsc Rule
Always run `npx tsc --noEmit` after every TypeScript change. Zero errors required before marking anything done.
Also run `npm test` — 86 tests must pass.

## Completed This Session (2026-02-28)

### Open Positions Lifecycle
- `src/types/index.ts` — `exit_price`, `exit_time`, `pnl`, `result_pct` are now `| null` (null = open position)
- **NewTrade**: single smart button — "Save Open Position" when exit blank, "Save Trade" when filled. No separate button needed.
- **QuickTradeModal**: same auto-detection — open or closed based on exit price presence
- **TradeLog**: open trades float to top, OPEN badge (accent pill), `—` for null P&L, Close Trade inline form in expanded row (exit price + time → recalculates P&L via `calcPnl`)
- **Dashboard**: all stats filtered to closed trades only (`closedFiltered`); Open Positions widget shows when any open trades exist, links to trade log
- **Analytics + Review**: filtered to closed only before all calculations
- Null-safety cascade: aiAnalysis.ts, analyticsUtils.ts, csvExport.ts, Journal.tsx, Settings.tsx, Simulator.tsx all updated

### Position Calculator Improvements (`src/components/PositionCalculator.tsx`)
- **Bidirectional**: entry + stop → position size (existing); entry + qty → implied stop price (new)
- Implied stop card shows price, % from entry, and "Apply stop ↗" button that fills the stop_price field
- **Position value** row always shows (entry × qty) when both are entered
- **Stop %** row shows when stop price is set ("X.XX% from entry")

### IBKR Auto-Import (Flex Query) — committed previously, same push
- `src/lib/ibkr.ts`, `src/hooks/useIbkrSync.ts`, `src/__tests__/ibkrParser.test.ts`
- 17 new tests; total: 86 passing

## Pending Work

### Tag v0.5.0
All work is committed and pushed to main. Ready to release when confirmed stable.
1. Bump version in `src-tauri/tauri.conf.json` AND `src-tauri/Cargo.toml` (0.4.0 → 0.5.0)
2. `npx tsc --noEmit` + `npm test` — must pass
3. `git add -A && git commit -m "Bump version to 0.5.0"`
4. `git tag v0.5.0 && git push origin main --tags`

### Verify Windows auto-updater
The v0.4.0 CI run completed. Confirm Windows app shows update dialog on next version.

### Add Supabase columns for exit lots sync (low priority)
`exit_lots` and `remaining_qty` are currently stripped from sync payload because the Supabase schema doesn't have these columns.
Core P/L data syncs correctly — only the per-lot breakdown is missing on the second computer.
To fix:
1. Run in Supabase SQL editor:
   ```sql
   alter table trades add column exit_lots jsonb;
   alter table trades add column remaining_qty integer;
   ```
2. In `src/lib/sync.ts`, remove the destructure strip: `({ exit_lots, remaining_qty, ...t }) => ...` → `(t) => ...`

### Secure credentials (low priority — personal use)
Anthropic API key + Supabase credentials stored as plaintext in localStorage.
Future: consider `tauri-plugin-stronghold` or OS keychain.

## Visual Audit (2026-03-01)

- [x] Sidebar — expanded state
- [x] Sidebar — collapsed state
- [x] Dashboard — with data
- [x] Dashboard — Open Positions widget
- [x] Dashboard — empty state (no trades) ⚠️ BUG: deleting all trades locally doesn't delete from Supabase — sync on next save pulls them all back
- [x] New Trade — full form (closed trade)
- [x] New Trade — open position mode (exit blank)
- [x] Position Calculator (embedded in New Trade)
- [x] Quick Entry Modal (⚡)
- [x] Trade Log — with trades
- [x] Trade Log — expanded row / Close Trade inline form
- [x] Trade Log — empty state
- [x] Trade Log — bulk select mode ⚠️ Checkboxes always visible on every row — clutters the table; should be hover-reveal or behind a "Select" mode toggle
- [x] Review
- [x] Analytics
- [x] Journal
- [x] Playbook
- [x] AI Analysis
- [x] Simulator ⚠️ "Best Setup Only" scenario description says "Shows focus benefit" but result can be negative — description should acknowledge both outcomes (focus benefit OR focus cost depending on your data)
- [x] News
- [x] Settings
- [x] Keyboard Shortcuts Modal

### Issues to fix
- [x] Dashboard — Delete all local trades also needs to delete from Supabase, otherwise sync on next save restores everything
- [x] Trade Log — Bulk select checkboxes always visible; hide behind hover or a "Select" mode toggle to reduce visual noise
- [x] Simulator — "Best Setup Only" description says "Shows focus benefit" but result can be negative; update copy to reflect both outcomes

---

## Previous Session Audit History (for reference)

### UX Audit (2026-02-28) — COMPLETE ✓
All 14 items shipped. Toast system, onboarding banner, keyboard nav, QuickTradeModal draft persistence, etc.

### App Audit (2026-02-28) — COMPLETE ✓
useMemo perf, schema migrations, screenshot quota guard, ErrorBoundary crash log, db cache.

### Math Audit (2026-02-28) — COMPLETE ✓
All P&L formulas verified correct. avgLoss consistency fix, EV formula fix, P&L rounding on save.
