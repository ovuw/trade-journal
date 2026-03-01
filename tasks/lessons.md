# Lessons

## Dashboard / UI State

### Mistake:
Assumed a UI widget (pre-market checklist on Dashboard) was reading from localStorage because a `saveChecklistItems()` function existed. It was actually a hardcoded constant `CHECKLIST_ITEMS` at the top of `Dashboard.tsx` — completely disconnected from the db layer.

### Rule:
Before wiring up a reset/update flow for any data, grep the consuming component for where it actually reads that data. Never assume it reads from the db layer — verify it.

### Why:
The reset button saved correctly to localStorage, but the dashboard never read from localStorage for that widget. The bug was invisible until the user tested it.

---

## Navigation After Mutations

### Mistake:
Using `window.location.reload()` after data mutations on non-root routes (e.g. `/settings`) causes a blank page in Tauri + BrowserRouter because Tauri's file server only serves `index.html` at `/`.

### Rule:
Always use `window.location.replace('/')` after any mutation that requires a full page reload. Never use `window.location.reload()`.

### Why:
BrowserRouter routes are virtual — Tauri can't serve `/settings` as a real file. `reload()` re-requests the current path from the file server, which 404s. `replace('/')` navigates to root where `index.html` exists.

---

## Nullable Type Cascade — Audit All Files First

### Mistake:
When making Trade fields nullable (`pnl`, `exit_price`, etc.), the plan only identified the obvious pages. The cascade actually hit aiAnalysis.ts, csvExport.ts, Journal.tsx, Settings.tsx, and Simulator.tsx — none of which were in the plan.

### Rule:
Before making any field nullable, grep every file in the project for that field name. Identify all consumers upfront and include them in the plan. `tsc --noEmit` will catch them all at the end, but surprises mid-implementation slow things down.

### Why:
TypeScript surfaces the errors at compile time regardless, but discovering 5 extra files mid-task breaks flow and risks making rushed fixes. A 30-second grep before starting saves 30 minutes of cleanup.

---

## IBKR CSV — DataDiscriminator Rows

### Rule:
IBKR Activity Statement CSV includes `DataDiscriminator=Lot` rows after every closing `Order` row. These re-state the original opening fill (positive qty, open price) for tax/cost-basis purposes. Always skip rows where `datadiscriminator` is `'lot'`, `'subtotal'`, or `'total'` in the IBKR parser.

### Why:
Without the filter, Lot rows are treated as buy transactions. FIFO matching accumulates extra buys that prevent `posQty` from reaching 0, so every trade is saved as an open position instead of closed.

---

## Node.js 25.x — Built-in localStorage Breaks Vitest

### Rule:
When running Vitest on Node.js 25+, add `NODE_OPTIONS=--no-experimental-webstorage` to the test script in package.json. Also configure `test: { environment: 'happy-dom', setupFiles: ['./src/__tests__/setup.ts'] }` in vite.config.ts.

### Why:
Node.js 25 exposes a built-in `localStorage` global (from `node:internal/webstorage`) that is read-only without the `--localstorage-file` CLI flag. It overrides happy-dom's localStorage because it's defined on `globalThis` before happy-dom can set it. `getItem` returns null (appears to work) but `setItem` throws `TypeError: not a function` — 8 db.test.ts tests silently fail. The `--no-experimental-webstorage` flag removes Node's built-in entirely, letting happy-dom provide the proper writable implementation.

---

## keyring Crate on macOS — Silent Failure in Unsigned Dev Builds

### Rule:
Do not use the `keyring` crate for credential storage in Tauri apps. Use file-based storage in the Tauri app data directory instead (`app.path().app_data_dir()`), with `chmod 600` on macOS/Linux.

### Why:
The `keyring` crate v3 on macOS silently "succeeds" (`set_password` returns `Ok(())`) but writes nothing to the keychain when the binary is unsigned (as in `tauri dev`). `get_password` then returns `NoEntry`. The `security find-generic-password` CLI tool confirms nothing was written. Root cause: the crate likely uses `kSecUseDataProtectionKeychain = true` which requires a signed binary with `keychain-access-groups` entitlement. The file-based approach using Tauri's app data dir works immediately, is cross-platform (macOS + Windows), and is still far more secure than localStorage — the file is in `~/Library/Application Support/<bundle-id>/` with user-only permissions, invisible to browser devtools.

---

## localStorage Data Integrity

### Mistake:
`JSON.parse(localStorage.getItem(key) || '{}') as SomeType` silently returns `{}` when storage is empty, then casts it as the full type. Any numeric field will be `undefined`, crashing renders that call `.toLocaleString()` or arithmetic on them.

### Rule:
Always use `Partial<T>` when parsing from localStorage, then apply `?? default` for every field. Also apply defensive `?? default` at the render site for numeric values.

### Why:
TypeScript's `as` cast is a lie at runtime — it doesn't validate the shape. `{}` cast as `{ accountBalance: number }` gives `undefined` for `accountBalance`, which crashes silently downstream.
