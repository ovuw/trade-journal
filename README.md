# Trade Journal

A desktop trading journal for stock traders. Log trades, track rule violations, review patterns, and improve over time using the Kullamägi methodology.

Built with [Tauri v2](https://tauri.app/) + React + TypeScript. Works fully offline — Supabase sync is optional.

---

## Features

- **Trade Log** — log entries and exits with P&L calculated automatically
- **Quick Entry** — minimal modal (⚡ in sidebar) for logging during live trades
- **Rule tracking** — tag rules broken per trade, correlate violations with losses
- **Review & Analytics** — win rate, avg R, streak charts, setup performance
- **AI Analysis** — Claude-powered pattern analysis across your trade history
- **Daily Journal** — market condition notes + mood tracking
- **Playbook** — document your setups and trading rules
- **Simulator** — replay and practice setups
- **Cross-device sync** — optional Supabase backend for 2+ computers
- **Auto-updater** — silent background updates (macOS; Windows in progress)

---

## Development

```bash
# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev

# Type check
npx tsc --noEmit

# Run tests
npm test

# Build desktop app
npm run tauri build
```

Requires: Node 20+, Rust (stable), [Tauri prerequisites](https://tauri.app/start/prerequisites/)

---

## Project Structure

```
src/
  pages/          # Route-level components (lazy loaded)
  components/     # Shared UI components
  lib/
    db.ts         # All localStorage read/write (tj_* namespace)
    sync.ts       # Supabase bidirectional sync
    tradeUtils.ts # Pure helpers: P&L, session detection
    supabase.ts   # Supabase client + auth
    storage.ts    # Screenshot upload/delete
    aiAnalysis.ts # Claude prompt builder + streaming
  hooks/          # useAutoSync, useKeyboardShortcuts, usePreMarketReminder
  types/          # Trade type, defaults (rules, tags, checklist)
src-tauri/        # Tauri Rust backend + app config
```

---

## Releasing a New Version

1. Bump `version` in both `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
2. Verify: `npx tsc --noEmit` and `npm test` — both must pass clean
3. Commit all changes
4. Tag and push: `git tag vX.Y.Z && git push origin main --tags`

GitHub Actions then:
- Builds macOS (Apple Silicon) and Windows (x64)
- Signs the updater bundles with the stored signing key
- Publishes the GitHub Release with all artifacts
- Generates `latest.json` for the auto-updater endpoint

> **Never tag with uncommitted changes** — CI builds from git, not local files.

---

## Optional: Supabase Sync

1. Create a Supabase project and run `tasks/sync_schema.sql` to create the trades table
2. In the app Settings → Sync, enter your Supabase URL and anon key
3. Sign in — trades sync automatically on launch (last-write-wins on `updated_at`)

---

## Optional: AI Analysis

In Settings → AI, enter an [Anthropic API key](https://console.anthropic.com/). The AI Analysis page will build a prompt from your trade history and stream a pattern analysis using Claude.
