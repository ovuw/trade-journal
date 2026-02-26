import { useState, useEffect, useRef, useMemo } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Users, Cloud, Download, Upload, Trash2, Check, RefreshCw, Plus, Pencil,
} from 'lucide-react'
import {
  getAccounts, saveAccounts, getActiveAccountId, setActiveAccountId, type AccountRecord,
  saveCalcSettings, getSupabaseConfig, saveSupabaseConfig, getTrades,
  saveRules, saveChecklistItems,
} from '../lib/db'
import { loadSampleData } from '../lib/seedData'
import {
  isSupabaseConfigured, testConnection, getSession,
  signIn as supabaseSignIn, signOut as supabaseSignOut,
  resetSupabaseClient,
} from '../lib/supabase'
import { syncTrades } from '../lib/sync'
import type { Trade } from '../types'
import { DEFAULT_RULES, DEFAULT_CHECKLIST_LABELS } from '../types'

// ─── Account form fields (all strings for input binding) ──────────────────────

interface AccountFormFields {
  name: string
  broker: string
  currency: string
  startingBalance: string
  maxRiskPct: string
  maxDailyLossPct: string
}

function toFormFields(acc: AccountRecord): AccountFormFields {
  return {
    name: acc.name,
    broker: acc.broker,
    currency: acc.currency,
    startingBalance: String(acc.startingBalance),
    maxRiskPct: String(acc.maxRiskPct),
    maxDailyLossPct: String(acc.maxDailyLossPct),
  }
}

function fromFormFields(fields: AccountFormFields, base?: Partial<AccountRecord>): Omit<AccountRecord, 'id' | 'created_at'> {
  return {
    name: fields.name,
    broker: fields.broker,
    currency: fields.currency || 'USD',
    startingBalance: parseFloat(fields.startingBalance) || 0,
    maxRiskPct: parseFloat(fields.maxRiskPct) || 0,
    maxDailyLossPct: parseFloat(fields.maxDailyLossPct) || (base?.maxDailyLossPct ?? 3),
  }
}

// ─── AccountForm sub-component ────────────────────────────────────────────────

function AccountForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: AccountFormFields
  onSave: (f: AccountFormFields) => void
  onCancel: () => void
}) {
  const [f, setF] = useState<AccountFormFields>(initial ?? {
    name: '', broker: '', currency: 'USD',
    startingBalance: '10000', maxRiskPct: '1', maxDailyLossPct: '3',
  })
  const set = (key: keyof AccountFormFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-secondary block mb-1">Account Name</label>
          <input type="text" value={f.name} onChange={set('name')} className="input text-sm" placeholder="Main Account" autoFocus />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Broker / Platform</label>
          <input type="text" value={f.broker} onChange={set('broker')} className="input text-sm" placeholder="IBKR, Tastytrade…" />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Currency</label>
          <input type="text" value={f.currency} onChange={set('currency')} className="input text-sm" placeholder="USD" maxLength={3} />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Starting Balance</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
            <input type="number" value={f.startingBalance} onChange={set('startingBalance')} className="input pl-6 text-sm font-mono" min="0" step="100" />
          </div>
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Max Risk / Trade</label>
          <div className="relative">
            <input type="number" value={f.maxRiskPct} onChange={set('maxRiskPct')} className="input pr-7 text-sm font-mono" step="0.1" min="0.1" max="100" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">%</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Max Daily Loss</label>
          <div className="relative">
            <input type="number" value={f.maxDailyLossPct} onChange={set('maxDailyLossPct')} className="input pr-7 text-sm font-mono" step="0.1" min="0" max="100" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">%</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(f)} className="btn-primary text-sm py-1.5 px-4">Save</button>
        <button onClick={onCancel} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  titleClass = 'text-text-primary',
  borderClass = 'border-border',
  children,
  right,
}: {
  icon: React.ElementType
  title: string
  titleClass?: string
  borderClass?: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <section className={`bg-bg-card border ${borderClass} rounded-lg overflow-hidden`}>
      <div className={`flex items-center justify-between px-5 py-3 border-b ${borderClass}`}>
        <div className="flex items-center gap-2">
          <Icon size={14} className={titleClass === 'text-loss' ? 'text-loss' : 'text-text-secondary'} />
          <h2 className={`text-sm font-semibold ${titleClass}`}>{title}</h2>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

// ─── Download helpers ──────────────────────────────────────────────────────────

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportTaxCSV(year: string) {
  const trades = getTrades().filter((t: Trade) => t.exit_time.startsWith(year))
  const header = ['Date', 'Ticker', 'Direction', 'Asset Class', 'Entry $', 'Exit $', 'Qty', 'Gross P/L', 'Fees', 'Net P/L']
  const rows = trades.map((t: Trade) => [
    t.exit_time.split('T')[0], t.ticker, t.direction.toUpperCase(), t.asset_class,
    t.entry_price.toFixed(4), t.exit_price.toFixed(4), t.quantity.toString(),
    (t.pnl + t.fees).toFixed(2), t.fees.toFixed(2), t.pnl.toFixed(2),
  ])
  triggerDownload([header, ...rows].map(r => r.join(',')).join('\n'), `trade-journal-${year}-taxes.csv`, 'text/csv')
}

function exportBackup() {
  const backup: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('tj_')) {
      try { backup[key] = JSON.parse(localStorage.getItem(key)!) }
      catch { backup[key] = localStorage.getItem(key) }
    }
  }
  const date = new Date().toISOString().split('T')[0]
  triggerDownload(JSON.stringify(backup, null, 2), `trade-journal-backup-${date}.json`, 'application/json')
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Settings() {
  // ── Accounts ────────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<AccountRecord[]>(() => getAccounts())
  const [activeAccountId, setActiveAccountIdState] = useState<string>(() => getActiveAccountId())
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accountSaved, setAccountSaved] = useState(false)

  // ── Supabase config ──────────────────────────────────────────────────────────
  const [supabaseForm, setSupabaseForm] = useState(() => {
    const cfg = getSupabaseConfig()
    return { url: cfg?.url ?? '', anonKey: cfg?.anonKey ?? '' }
  })
  const [configuredState, setConfiguredState] = useState(() => isSupabaseConfigured())
  const [supabaseSaved, setSupabaseSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // ── Sync ─────────────────────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [syncResult, setSyncResult] = useState<{ pulled: number; pushed: number } | null>(null)
  const [syncError, setSyncError] = useState('')

  // ── Export / import ──────────────────────────────────────────────────────────
  const importRef = useRef<HTMLInputElement>(null)

  // ── Danger zone ──────────────────────────────────────────────────────────────
  const [clearConfirm, setClearConfirm] = useState<'trades' | 'all' | null>(null)
  const [rulesReset, setRulesReset] = useState(false)

  useEffect(() => { getSession().then(s => setSession(s)) }, [])

  const taxYears = useMemo(() => {
    const years = new Set(
      getTrades().map((t: Trade) => t.exit_time.substring(0, 4)).filter(y => /^\d{4}$/.test(y))
    )
    return [...years].sort().reverse()
  }, [])

  // ── Account handlers ─────────────────────────────────────────────────────────

  function handleSetActive(id: string) {
    setActiveAccountId(id)  // updates localStorage + CalcSettings
    setActiveAccountIdState(id)
  }

  function handleAddAccount(fields: AccountFormFields) {
    const newAcc: AccountRecord = {
      id: crypto.randomUUID(),
      ...fromFormFields(fields),
      created_at: new Date().toISOString(),
    }
    const updated = [...accounts, newAcc]
    saveAccounts(updated)
    setAccounts(updated)
    setShowAddAccount(false)
  }

  function handleUpdateAccount(id: string, fields: AccountFormFields) {
    const updated = accounts.map(a => a.id !== id ? a : { ...a, ...fromFormFields(fields) })
    saveAccounts(updated)
    setAccounts(updated)
    setEditingAccountId(null)
    if (id === activeAccountId) {
      const active = updated.find(a => a.id === id)
      if (active) saveCalcSettings({ accountBalance: active.startingBalance, maxRiskPct: active.maxRiskPct })
      setAccountSaved(true)
      setTimeout(() => setAccountSaved(false), 2000)
    }
  }

  function handleDeleteAccount(id: string) {
    if (accounts.length <= 1) return
    const updated = accounts.filter(a => a.id !== id)
    saveAccounts(updated)
    setAccounts(updated)
    if (id === activeAccountId) {
      const first = updated[0]
      setActiveAccountId(first.id)
      setActiveAccountIdState(first.id)
    }
  }

  // ── Supabase config handlers ─────────────────────────────────────────────────

  function handleSaveSupabase() {
    const { url, anonKey } = supabaseForm
    if (!url || !anonKey) return
    saveSupabaseConfig({ url, anonKey })
    resetSupabaseClient()
    setConfiguredState(true)
    setSupabaseSaved(true)
    setTimeout(() => setSupabaseSaved(false), 2000)
  }

  async function handleTestConnection() {
    setTestStatus('testing')
    const ok = await testConnection(supabaseForm.url, supabaseForm.anonKey)
    setTestStatus(ok ? 'ok' : 'fail')
    setTimeout(() => setTestStatus('idle'), 4000)
  }

  function handleDisconnect() {
    saveSupabaseConfig(null)
    resetSupabaseClient()
    setConfiguredState(false)
    setSession(null)
    setSupabaseForm({ url: '', anonKey: '' })
  }

  // ── Auth handlers ─────────────────────────────────────────────────────────────

  async function handleSignIn() {
    if (!authForm.email || !authForm.password) return
    setAuthLoading(true)
    setAuthError('')
    try {
      const { data, error } = await supabaseSignIn(authForm.email, authForm.password)
      if (error) { setAuthError(error.message); return }
      setSession(data.session)
      setAuthForm({ email: '', password: '' })
    } catch {
      setAuthError('Sign in failed. Check your credentials.')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSignOut() {
    await supabaseSignOut()
    setSession(null)
    setSyncResult(null)
    setSyncStatus('idle')
  }

  // ── Sync handler ──────────────────────────────────────────────────────────────

  async function handleSyncNow() {
    if (!session) return
    setSyncStatus('syncing')
    setSyncError('')
    try {
      const result = await syncTrades(session.user.id)
      setSyncResult(result)
      setSyncStatus('done')
    } catch {
      setSyncError('Sync failed. Check your Supabase table setup.')
      setSyncStatus('error')
    }
  }

  // ── Import backup ─────────────────────────────────────────────────────────────

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result
      if (typeof result !== 'string') return
      try {
        const backup = JSON.parse(result) as Record<string, unknown>
        for (const [key, val] of Object.entries(backup)) {
          if (key.startsWith('tj_')) localStorage.setItem(key, JSON.stringify(val))
        }
        window.location.replace('/')
      } catch {
        alert('Invalid backup file — not a valid Trade Journal backup.')
      }
    }
    reader.readAsText(file)
  }

  // ── Clear data ────────────────────────────────────────────────────────────────

  function handleClearTrades() {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k === 'tj_trades' || k?.startsWith('tj_screenshot_')) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
    window.location.replace('/')
  }

  function handleClearData() {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('tj_')) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
    window.location.replace('/')
  }

  function handleResetRulesAndChecklist() {
    saveRules(DEFAULT_RULES)
    const seeded = DEFAULT_CHECKLIST_LABELS.map((label, i) => ({
      id: `cl-${i}`,
      label,
      order_index: i,
      is_active: true,
    }))
    saveChecklistItems(seeded)
    setRulesReset(true)
    setTimeout(() => window.location.replace('/'), 1000)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const syncBadge = session ? (
    <span className="text-[11px] font-medium text-profit bg-profit/10 border border-profit/20 px-2 py-0.5 rounded-full">● Synced</span>
  ) : configuredState ? (
    <span className="text-[11px] font-medium text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full">● Not signed in</span>
  ) : (
    <span className="text-[11px] text-text-muted bg-bg-secondary border border-border px-2 py-0.5 rounded-full">Local only</span>
  )

  return (
    <div className="p-6 space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-text-secondary text-sm mt-0.5">Account management, risk defaults, and data</p>
      </div>

      {/* ── Accounts ── */}
      <Section icon={Users} title="Accounts">
        <div className="space-y-2">
          {accounts.map(acc => (
            <div key={acc.id}>
              {editingAccountId === acc.id ? (
                <AccountForm
                  initial={toFormFields(acc)}
                  onSave={f => handleUpdateAccount(acc.id, f)}
                  onCancel={() => setEditingAccountId(null)}
                />
              ) : (
                <div className="flex items-center gap-3 p-3 bg-bg-secondary border border-border rounded-lg group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {acc.name || 'Unnamed Account'}
                      </span>
                      {acc.id === activeAccountId && (
                        <span className="text-[10px] font-bold text-profit bg-profit/10 border border-profit/20 px-1.5 py-0.5 rounded-full shrink-0">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {[acc.broker, acc.currency, `$${(acc.startingBalance ?? 0).toLocaleString()}`, `${acc.maxRiskPct ?? 0}% risk`]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {acc.id !== activeAccountId && (
                      <button
                        onClick={() => handleSetActive(acc.id)}
                        className="text-xs text-accent hover:underline px-2 py-1"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      onClick={() => setEditingAccountId(acc.id)}
                      className="p-1.5 text-text-muted hover:text-accent rounded transition-colors"
                      title="Edit"
                    >
                      <Pencil size={12} />
                    </button>
                    {accounts.length > 1 && (
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        className="p-1.5 text-text-muted hover:text-loss rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {showAddAccount ? (
            <AccountForm onSave={handleAddAccount} onCancel={() => setShowAddAccount(false)} />
          ) : (
            <button
              onClick={() => setShowAddAccount(true)}
              className="flex items-center gap-1.5 text-xs text-accent hover:underline mt-1"
            >
              <Plus size={12} /> Add Account
            </button>
          )}
        </div>

        {accountSaved && (
          <p className="flex items-center gap-1 text-xs text-profit mt-3">
            <Check size={12} /> Saved
          </p>
        )}

        <p className="text-xs text-text-muted border-t border-border pt-3 mt-4">
          The active account's starting balance and risk % are used by the Position Calculator on the trade entry form.
          Hover an account to edit or switch.
        </p>
      </Section>

      {/* ── Cloud Sync ── */}
      <Section icon={Cloud} title="Cloud Sync" right={syncBadge}>
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Connect to a Supabase project to sync trades across computers. Create a free project at{' '}
            <span className="text-text-primary">supabase.com</span>, paste your URL and anon key below,
            then run <span className="font-mono text-accent">tasks/sync_schema.sql</span> in the SQL Editor.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Supabase URL</label>
              <input
                type="url"
                value={supabaseForm.url}
                onChange={e => setSupabaseForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://yourproject.supabase.co"
                className="input text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Anon Key</label>
              <input
                type="password"
                value={supabaseForm.anonKey}
                onChange={e => setSupabaseForm(f => ({ ...f, anonKey: e.target.value }))}
                placeholder="eyJhb..."
                className="input text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSaveSupabase}
              disabled={!supabaseForm.url || !supabaseForm.anonKey}
              className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50"
            >
              Save Connection
            </button>
            <button
              onClick={() => { void handleTestConnection() }}
              disabled={!supabaseForm.url || !supabaseForm.anonKey || testStatus === 'testing'}
              className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
            >
              {testStatus === 'testing' ? 'Testing…' : 'Test'}
            </button>
            {configuredState && (
              <button onClick={handleDisconnect} className="text-xs text-text-muted hover:text-loss transition-colors">
                Disconnect
              </button>
            )}
            {supabaseSaved && <span className="flex items-center gap-1 text-xs text-profit"><Check size={12} /> Saved</span>}
            {testStatus === 'ok' && <span className="flex items-center gap-1 text-xs text-profit"><Check size={12} /> Connected</span>}
            {testStatus === 'fail' && <span className="text-xs text-loss">Failed — check URL and key</span>}
          </div>

          {/* Sign in form */}
          {configuredState && !session && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-medium text-text-primary">Sign in to start syncing</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Email</label>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={e => { setAuthForm(f => ({ ...f, email: e.target.value })); setAuthError('') }}
                    className="input text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') void handleSignIn() }}
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Password</label>
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={e => { setAuthForm(f => ({ ...f, password: e.target.value })); setAuthError('') }}
                    className="input text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') void handleSignIn() }}
                  />
                </div>
              </div>
              {authError && <p className="text-xs text-loss">{authError}</p>}
              <button
                onClick={() => { void handleSignIn() }}
                disabled={authLoading || !authForm.email || !authForm.password}
                className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50"
              >
                {authLoading ? 'Signing in…' : 'Sign In'}
              </button>
            </div>
          )}

          {/* Signed-in state */}
          {session && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs text-text-secondary">
                Signed in as <span className="text-text-primary font-medium">{session.user.email ?? 'unknown'}</span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { void handleSyncNow() }}
                  disabled={syncStatus === 'syncing'}
                  className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw size={12} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                  {syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now'}
                </button>
                <button
                  onClick={() => { void handleSignOut() }}
                  className="btn-secondary text-sm py-1.5 px-3"
                >
                  Sign Out
                </button>
                {syncResult && syncStatus === 'done' && (
                  <span className="text-xs text-text-secondary">↓{syncResult.pulled} pulled · ↑{syncResult.pushed} pushed</span>
                )}
                {syncError && <span className="text-xs text-loss">{syncError}</span>}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── Export & Backup ── */}
      <Section icon={Download} title="Export & Backup">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-text-primary mb-0.5">Tax Export</p>
            <p className="text-xs text-text-muted mb-3">Download realized P/L as CSV grouped by calendar year for tax reporting.</p>
            {taxYears.length === 0 ? (
              <p className="text-xs text-text-muted italic">No trades recorded yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {taxYears.map(year => (
                  <button
                    key={year}
                    onClick={() => exportTaxCSV(year)}
                    className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <Download size={12} />
                    {year} CSV
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-text-primary mb-0.5">Full Data Backup</p>
            <p className="text-xs text-text-muted mb-3">
              Export all app data (trades, rules, journal, settings) as JSON. Use to migrate between computers or as a safety backup.
            </p>
            <div className="flex gap-2">
              <button onClick={exportBackup} className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5">
                <Download size={12} /> Export JSON
              </button>
              <button onClick={() => importRef.current?.click()} className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5">
                <Upload size={12} /> Import JSON
              </button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>
            <p className="text-xs text-text-muted mt-2">Import will overwrite all current data and reload the app.</p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-text-primary mb-0.5">Sample Data</p>
            <p className="text-xs text-text-muted mb-3">
              Load 24 realistic sample trades and 11 journal entries to explore the app. Replaces all current trades and journal entries.
            </p>
            <button
              onClick={() => { loadSampleData(); window.location.replace('/') }}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              Load Sample Data
            </button>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-text-primary mb-0.5">Reset Rules & Checklist</p>
            <p className="text-xs text-text-muted mb-3">
              Overwrites your rules and pre-market checklist with the latest defaults. Your trades, journal, and settings are not affected.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetRulesAndChecklist}
                className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5"
              >
                <RefreshCw size={12} /> Reset to Defaults
              </button>
              {rulesReset && <span className="flex items-center gap-1 text-xs text-profit"><Check size={12} /> Updated</span>}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Danger Zone ── */}
      <Section icon={Trash2} title="Danger Zone" titleClass="text-loss" borderClass="border-loss/20">
        <div className="space-y-4">
          {/* Clear trades only */}
          {clearConfirm !== 'trades' ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Clear Trades</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Deletes all trade entries and screenshots. Keeps journal, rules, and settings.
                </p>
              </div>
              <button
                onClick={() => setClearConfirm('trades')}
                className="text-sm text-loss border border-loss/30 hover:bg-loss/10 rounded-md px-3 py-1.5 transition-colors shrink-0 ml-4"
              >
                Clear Trades
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text-primary">Delete all trades?</p>
              <p className="text-xs text-text-secondary">All trade entries and local screenshots will be permanently removed. Cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleClearTrades}
                  className="text-sm text-white bg-loss hover:bg-loss/80 rounded-md px-4 py-1.5 transition-colors font-medium"
                >
                  Yes, Delete Trades
                </button>
                <button onClick={() => setClearConfirm(null)} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
              </div>
            </div>
          )}

          <div className="border-t border-loss/10" />

          {/* Clear everything */}
          {clearConfirm !== 'all' ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Clear All Data</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Permanently deletes all trades, journal entries, rules, and settings.
                </p>
              </div>
              <button
                onClick={() => setClearConfirm('all')}
                className="text-sm text-loss border border-loss/30 hover:bg-loss/10 rounded-md px-3 py-1.5 transition-colors shrink-0 ml-4"
              >
                Clear Everything
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text-primary">Are you absolutely sure?</p>
              <p className="text-xs text-text-secondary">
                This will permanently delete all your trades, journal entries, rules, and settings. Cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClearData}
                  className="text-sm text-white bg-loss hover:bg-loss/80 rounded-md px-4 py-1.5 transition-colors font-medium"
                >
                  Yes, Delete Everything
                </button>
                <button onClick={() => setClearConfirm(null)} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </Section>

    </div>
  )
}
