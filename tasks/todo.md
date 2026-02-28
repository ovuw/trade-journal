# Trade Journal — Session Handoff

## If you are a new agent, read this first
- Project root: `/Users/ryanjones/projects/trade-journal/`
- Full memory: `/Users/ryanjones/.claude/projects/-Users-ryanjones/memory/MEMORY.md`
- Past mistakes + rules: `tasks/lessons.md` — read this before touching anything
- Full original build spec (archived): `tasks/build-plan-archive.md`

## Current State
- **Version:** 0.3.5 (unreleased changes — bump to 0.4.0 before next tag)
- **Status:** All 12 phases complete + full audit pass complete. App is in daily use.
- Stack: Tauri + React + TypeScript + localStorage (primary) + Supabase (optional sync)
- Auto-updater live via GitHub Releases — triggers on `v*` tags

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

## Pending Work

### Tag v0.4.0 release
All the above changes are uncommitted. When ready:
1. Bump version to `0.4.0` in `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml`
2. `npx tsc --noEmit && npm test` — confirm clean
3. Commit, tag, push

### Verify Windows auto-updater
The CI workflow is correct in theory but untested in production. After the next release tag:
- Confirm the Windows `finalize` job completes successfully
- Check `latest.json` in the release has both `darwin-aarch64` and `windows-x86_64` entries
- Verify Windows app shows update dialog on next version

## Tsc Rule
Always run `npx tsc --noEmit` after every TypeScript change. Zero errors required before marking anything done.
Also run `npm test` — 47 tests must pass.

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
