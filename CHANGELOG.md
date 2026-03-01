# Changelog

All notable changes to Trade Journal are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.5.2] - 2026-03-01

### Security
- API keys (Supabase, Anthropic, IBKR) moved from localStorage to a restricted app data file (`~/Library/Application Support/com.tradejournal.app/credentials.json` on macOS, equivalent on Windows) with chmod 600 permissions
- Credentials are auto-migrated from previous versions on first launch

## [0.5.1] - 2026-03-01

### Added
- Trade deletions now propagate across devices — soft-deleted trades sync to Supabase and are removed on other devices on next sync
- Exit lots and remaining quantity sync to Supabase for partial position tracking

### Fixed
- Windows auto-updater: installer ZIP now uses STORE compression to fix extraction errors on install

## [0.5.0] - 2026-03-01

### Added
- Open positions and partial exits — record exit fills individually; positions show as OPEN or PARTIAL until fully closed
- IBKR CSV import now groups fills by entry date into single trades with per-lot exit detail
- Grouped IBKR Flex sync: lots sharing the same open date/time are merged into one trade

### Fixed
- IBKR CSV import: Lot rows (cost-basis accounting records) are no longer misread as buy transactions, preventing phantom open positions

## [0.4.0] - 2026-02-28

### Added
- Auto-updater: app checks for new releases on launch and shows a one-click install dialog (macOS confirmed, Windows available)
- CI/CD release pipeline: tagged releases automatically build signed installers for macOS (ARM) and Windows (x64)
- App hardening: database migrations, storage quota guard, crash boundary, db cache layer
- UX hardening: toast notifications, keyboard navigation (↑↓ in trade log, N/L/D nav, Cmd+S save), onboarding empty states, accessibility improvements

## [0.3.0] - 2026-02-27

### Added
- Terminal-style dashboard redesign with compact P&L summary cards
- App hardening: improved error handling and state robustness

## [0.2.0] - 2026-02-26

### Added
- Multiple screenshots per trade (up to 3)
- Checklist adherence tracking with per-trade pre-trade checklist
- Weekly/monthly report card with win rate, profit factor, and streak stats
- P&L simulator: run what-if scenarios (cap losses at 1R, skip rule-breaking trades, etc.)
- Expectancy and R-multiple tracking
- AI trade analysis with Claude: streaming analysis of your trading patterns
- Broker CSV import: Tastytrade, TD Ameritrade, and IBKR Activity Statement formats

## [0.1.0] - 2026-02-26

### Added
- Initial release: trade log, trade entry form, basic P&L tracking
- Setup tags, mistake tags, and trading rules
- Supabase sync for cross-device trade access
- IBKR Flex Query integration for automatic trade import
