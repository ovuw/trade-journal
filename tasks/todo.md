# Trade Journal — Session Handoff

## If you are a new agent, read this first
- Project root: `/Users/ryanjones/projects/trade-journal/`
- Full memory: `/Users/ryanjones/.claude/projects/-Users-ryanjones-projects-trade-journal/memory/MEMORY.md`
- Past mistakes + rules: `tasks/lessons.md` — read this before touching anything
- Full original build spec (archived): `tasks/build-plan-archive.md`

## Current State
- **Version:** v0.5.2 released (2026-03-01). Credentials security work pushed to main but not yet tagged.
- **Status:** App is complete and daily-use ready. All audits passed.
- Stack: Tauri + React + TypeScript + localStorage (trades) + credentials file (API keys) + Supabase (optional sync)
- Auto-updater live via GitHub Releases — triggers on `v*` tags

## Key Paths
- Types + default data: `src/types/index.ts`
- All localStorage ops: `src/lib/db.ts`
- Credential storage (API keys): `src/lib/credentials.ts`
- Pure trade helpers: `src/lib/tradeUtils.ts`
- Supabase client: `src/lib/supabase.ts`
- Trade sync logic: `src/lib/sync.ts`
- Unit tests: `src/__tests__/` — 132 tests, all passing

## Design System
- Tailwind tokens only — never hardcode hex
- accent=#6366f1, profit=#10b981, loss=#ef4444, bg-primary=#0d0f14

## To Release a New Version
1. Bump `version` in `src-tauri/tauri.conf.json` AND `src-tauri/Cargo.toml`
2. Run `npx tsc --noEmit` and `npm test` — both must pass
3. Commit, then: `git tag vX.Y.Z && git push origin main --tags`
4. GitHub Actions builds macOS + Windows, signs, generates combined `latest.json`, publishes release

## Completed This Session (2026-03-01 — Session 4)

### Secure Credentials
- `src/lib/credentials.ts` — new file; `loadCredentials()`, `getCredential()`, `setCredential()`, `deleteCredential()`
- Supabase config, Anthropic API key, IBKR Flex token moved from localStorage to `~/Library/Application Support/com.tradejournal.app/credentials.json` (chmod 600)
- Auto-migrates existing localStorage values on first launch; deletes plaintext copies
- `App.tsx` shows brief spinner until credentials load (<100ms); auto-sync hooks have 2s+ delays so timing is always safe
- `db.ts` getters read from in-memory cache (sync); `saveSupabaseConfig`, `saveAnthropicKey`, `saveIbkrConfig` now async
- `Settings.tsx` and `AIAnalysis.tsx` updated to await async setters
- `keyring` crate tried and abandoned — v3 silently fails on unsigned macOS dev builds

## Pending Work

### Tag v0.5.3
All work committed and pushed to main. Bundle credentials change into next release.
1. Bump version in `src-tauri/tauri.conf.json` AND `src-tauri/Cargo.toml` (0.5.2 → 0.5.3)
2. `npx tsc --noEmit` + `npm test` — must pass
3. `git add -A && git commit -m "Bump version to 0.5.3"`
4. `git tag v0.5.3 && git push origin main --tags`

### Verify Windows auto-updater
CI for v0.5.0/0.5.2 completed. Needs a Windows machine to confirm the update dialog appears on launch.

### Add Supabase columns for exit lots sync (already done — verify only)
Schema migration was already run in Supabase:
```sql
alter table trades add column exit_lots jsonb;
alter table trades add column remaining_qty integer;
```
sync.ts already pushes full trade objects — no code change needed.

## App Audit (2026-03-01)

### Medium Priority
- [x] Error Monitoring — added `window.addEventListener('unhandledrejection', ...)` in App.tsx
- [x] Security — added 5s Promise.race timeout on `loadCredentials()` in App.tsx
- [x] IA — News and Simulator were fully implemented (audit false positive)

### Low Priority
- [x] QA/Testing — expanded CSV import tests from 8 → 28 (generic format, Tastytrade, TDA, edge cases, parseCsvRow/parseNum paths)
- [x] DevOps — synced package.json version to 0.5.2

## Math Audit (2026-03-01)

- [x] avgR scope in AI prompt — fixed in `aiAnalysis.ts`; now filters to `closed` before averaging
- [x] EV formula inconsistency — fixed in `Simulator.tsx`; uses `losses.length / ts.length` (matches analyticsUtils)
- [x] Partial-exit fee proration — fixed in `tradeUtils.ts` (`positionQty` param) + `NewTrade.tsx` (passes qty); 2 new tests added

## UX Audit (2026-03-01)

- [x] Changelogs/Release Notes — `CHANGELOG.md` created; `release.yml` now extracts per-version notes for both `gh release create` and `latest.json`
- [x] Feedback Channel — "Report an issue" link added to bottom of Settings page
- [x] Sync Status Indicator — already fully implemented in sidebar (audit false positive)
- [x] Keyboard Navigation — arrow-key nav in Trade Log already fully implemented (audit false positive)
- [x] Content Strategy — Review page already has a CTA button (audit false positive)
- [x] Accessibility — added `aria-invalid` + `aria-describedby` to 4 NewTrade form fields (ticker, entry time, entry price, quantity); extended PriceInput with `hasError`/`errorId` props
- [ ] Onboarding Flow — after first trade saved, surface one-time prompt to configure Playbook rules/tags (progressive disclosure)
- [ ] Micro-interactions — consider a profit-glow flash on stat cards when a winning trade is saved
