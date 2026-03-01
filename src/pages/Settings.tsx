import { useState, useEffect, useRef, useMemo } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Users, Cloud, Download, Upload, Trash2, Check, RefreshCw, Plus, Pencil, Bell, Zap, Link, ExternalLink,
} from 'lucide-react'
import { check as checkForUpdates } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import {
  getAccounts, saveAccounts, getActiveAccountId, setActiveAccountId, type AccountRecord,
  saveCalcSettings, getSupabaseConfig, saveSupabaseConfig, getTrades,
  saveRules, saveChecklistItems, getReminderSettings, saveReminderSettings,
  getIbkrConfig, saveIbkrConfig, type IbkrConfig,
} from '../lib/db'
import { syncIbkr, type IbkrSyncResult } from '../lib/ibkr'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { loadSampleData } from '../lib/seedData'
import {
  isSupabaseConfigured, testConnection, getSession,
  signIn as supabaseSignIn, signOut as supabaseSignOut,
  resetSupabaseClient,
} from '../lib/supabase'
import { syncTrades, deleteAllSyncedTrades } from '../lib/sync'
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
  const trades = getTrades().filter((t: Trade) => t.exit_time != null && t.exit_time.startsWith(year))
  const header = ['Date', 'Ticker', 'Direction', 'Asset Class', 'Entry $', 'Exit $', 'Qty', 'Gross P/L', 'Fees', 'Net P/L']
  const rows = trades.map((t: Trade) => [
    t.exit_time!.split('T')[0], t.ticker, t.direction.toUpperCase(), t.asset_class,
    t.entry_price.toFixed(4), t.exit_price!.toFixed(4), t.quantity.toString(),
    ((t.pnl ?? 0) + t.fees).toFixed(2), t.fees.toFixed(2), (t.pnl ?? 0).toFixed(2),
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
  const [autoSyncBanner, setAutoSyncBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  // ── Export / import ──────────────────────────────────────────────────────────
  const importRef = useRef<HTMLInputElement>(null)

  // ── Reminder ──────────────────────────────────────────────────────────────────
  const [reminder, setReminder] = useState(() => getReminderSettings())
  const [reminderSaved, setReminderSaved] = useState(false)

  // ── IBKR ──────────────────────────────────────────────────────────────────────
  const [ibkrForm, setIbkrForm] = useState<IbkrConfig>(() => {
    const cfg = getIbkrConfig()
    return cfg ?? { flexToken: '', queryId: '', autoSync: true }
  })
  const [ibkrSaved, setIbkrSaved] = useState(false)
  const [ibkrSyncing, setIbkrSyncing] = useState(false)
  const [ibkrResult, setIbkrResult] = useState<IbkrSyncResult | null>(null)
  const [ibkrError, setIbkrError] = useState('')

  // ── Updates ───────────────────────────────────────────────────────────────────
  type UpdateState = { kind: 'idle' } | { kind: 'checking' } | { kind: 'up-to-date' } | { kind: 'available'; version: string } | { kind: 'downloading'; progress: number } | { kind: 'ready' } | { kind: 'error'; message: string }
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' })

  // ── Danger zone ──────────────────────────────────────────────────────────────
  const [clearConfirm, setClearConfirm] = useState<'trades' | 'all' | null>(null)
  const [rulesReset, setRulesReset] = useState(false)

  useEffect(() => { getSession().then(s => setSession(s)) }, [])

  useEffect(() => {
    const onSynced = () => {
      setAutoSyncBanner({ kind: 'success', message: 'Auto-sync complete' })
      setTimeout(() => setAutoSyncBanner(null), 4000)
    }
    const onError = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail ?? 'Sync failed'
      setAutoSyncBanner({ kind: 'error', message: msg })
      setTimeout(() => setAutoSyncBanner(null), 6000)
    }
    window.addEventListener('tj:synced', onSynced)
    window.addEventListener('tj:sync-error', onError)
    return () => {
      window.removeEventListener('tj:synced', onSynced)
      window.removeEventListener('tj:sync-error', onError)
    }
  }, [])

  const taxYears = useMemo(() => {
    const years = new Set(
      getTrades().filter((t: Trade) => t.exit_time != null).map((t: Trade) => t.exit_time!.substring(0, 4)).filter(y => /^\d{4}$/.test(y))
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

  async function handleSaveSupabase() {
    const { url, anonKey } = supabaseForm
    if (!url || !anonKey) return
    await saveSupabaseConfig({ url, anonKey })
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

  async function handleDisconnect() {
    await saveSupabaseConfig(null)
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

  // ── IBKR handlers ────────────────────────────────────────────────────────────

  async function handleSaveIbkr() {
    await saveIbkrConfig(ibkrForm.flexToken || ibkrForm.queryId ? ibkrForm : null)
    setIbkrSaved(true)
    setTimeout(() => setIbkrSaved(false), 2000)
  }

  async function handleSyncIbkrNow() {
    if (!ibkrForm.flexToken || !ibkrForm.queryId) return
    setIbkrSyncing(true)
    setIbkrError('')
    setIbkrResult(null)
    try {
      const result = await syncIbkr(ibkrForm.flexToken, ibkrForm.queryId)
      setIbkrResult(result)
    } catch (err) {
      setIbkrError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIbkrSyncing(false)
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

  async function handleClearTrades() {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k === 'tj_trades' || k?.startsWith('tj_screenshot_')) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
    // Also remove from Supabase so sync doesn't restore them
    const session = await getSession()
    if (session?.user?.id) {
      await deleteAllSyncedTrades(session.user.id)
    }
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

  // ── Update handlers ───────────────────────────────────────────────────────────

  async function handleCheckUpdates() {
    setUpdateState({ kind: 'checking' })
    try {
      const update = await checkForUpdates()
      if (update?.available) {
        setUpdateState({ kind: 'available', version: update.version })
      } else {
        setUpdateState({ kind: 'up-to-date' })
        setTimeout(() => setUpdateState({ kind: 'idle' }), 4000)
      }
    } catch {
      setUpdateState({ kind: 'error', message: 'Update check failed.' })
      setTimeout(() => setUpdateState({ kind: 'idle' }), 4000)
    }
  }

  async function handleInstallUpdate() {
    if (updateState.kind !== 'available') return
    try {
      const update = await checkForUpdates()
      if (!update?.available) return
      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
          setUpdateState({ kind: 'downloading', progress: 0 })
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          setUpdateState({ kind: 'downloading', progress: total > 0 ? Math.round((downloaded / total) * 100) : 0 })
        } else if (event.event === 'Finished') {
          setUpdateState({ kind: 'ready' })
        }
      })
    } catch (err) {
      setUpdateState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Reminder handlers ─────────────────────────────────────────────────────────

  function handleSaveReminder(updated: typeof reminder) {
    saveReminderSettings(updated)
    setReminder(updated)
    setReminderSaved(true)
    setTimeout(() => setReminderSaved(false), 2000)
  }

  async function handleTestNotification() {
    let granted = await isPermissionGranted()
    if (!granted) {
      const result = await requestPermission()
      granted = result === 'granted'
    }
    if (!granted) return
    sendNotification({
      title: 'Pre-Market Reminder',
      body: 'Complete your pre-market checklist before trading.',
    })
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

      {/* Auto-sync banner */}
      {autoSyncBanner && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium ${
          autoSyncBanner.kind === 'success'
            ? 'bg-profit/10 border-profit/30 text-profit'
            : 'bg-loss/10 border-loss/30 text-loss'
        }`}>
          {autoSyncBanner.kind === 'success'
            ? <Check size={14} className="shrink-0" />
            : <RefreshCw size={14} className="shrink-0" />}
          {autoSyncBanner.message}
        </div>
      )}

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

      {/* ── Pre-Market Reminder ── */}
      <Section icon={Bell} title="Pre-Market Reminder">
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Get a system notification at a set time each morning to complete your pre-market checklist before trading.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">Enable reminder</span>
            <button
              onClick={() => handleSaveReminder({ ...reminder, enabled: !reminder.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${reminder.enabled ? 'bg-accent' : 'bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${reminder.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Reminder time</label>
              <input
                type="time"
                value={reminder.time}
                onChange={e => setReminder(r => ({ ...r, time: e.target.value }))}
                onBlur={() => handleSaveReminder(reminder)}
                className="input text-sm font-mono w-32"
              />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input
                id="weekdays-only"
                type="checkbox"
                checked={reminder.weekdaysOnly}
                onChange={e => handleSaveReminder({ ...reminder, weekdaysOnly: e.target.checked })}
                className="accent-accent"
              />
              <label htmlFor="weekdays-only" className="text-sm text-text-secondary select-none cursor-pointer">
                Weekdays only
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { void handleTestNotification() }}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Bell size={12} /> Test Notification
            </button>
            {reminderSaved && <span className="flex items-center gap-1 text-xs text-profit"><Check size={12} /> Saved</span>}
          </div>
        </div>
      </Section>

      {/* ── IBKR Auto-Import ── */}
      <Section icon={Link} title="IBKR Auto-Import">
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Automatically import closed trades from Interactive Brokers using Flex Web Services.
            In Client Portal, go to <span className="text-text-primary">Reports → Flex Queries</span>, create a query
            with <span className="text-text-primary">ClosedLots</span> activity, then paste your token and query ID below.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Flex Web Services Token</label>
              <input
                type="password"
                value={ibkrForm.flexToken}
                onChange={e => setIbkrForm(f => ({ ...f, flexToken: e.target.value }))}
                placeholder="Your Flex token"
                className="input text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Query ID</label>
              <input
                type="text"
                value={ibkrForm.queryId}
                onChange={e => setIbkrForm(f => ({ ...f, queryId: e.target.value }))}
                placeholder="123456789"
                className="input text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">Auto-sync on launch</span>
            <button
              onClick={() => setIbkrForm(f => ({ ...f, autoSync: !f.autoSync }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ibkrForm.autoSync ? 'bg-accent' : 'bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ibkrForm.autoSync ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSaveIbkr}
              className="btn-primary text-sm py-1.5 px-4"
            >
              Save
            </button>
            <button
              onClick={() => { void handleSyncIbkrNow() }}
              disabled={!ibkrForm.flexToken || !ibkrForm.queryId || ibkrSyncing}
              className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={12} className={ibkrSyncing ? 'animate-spin' : ''} />
              {ibkrSyncing ? 'Importing…' : 'Import Now'}
            </button>
            {ibkrSaved && <span className="flex items-center gap-1 text-xs text-profit"><Check size={12} /> Saved</span>}
          </div>

          {ibkrResult && (
            <p className="text-xs text-text-secondary">
              Last import: <span className="text-profit">+{ibkrResult.imported} new</span>
              {ibkrResult.updated > 0 && <> · {ibkrResult.updated} updated</>}
              {ibkrResult.skipped > 0 && <> · {ibkrResult.skipped} skipped</>}
            </p>
          )}
          {ibkrError && <p className="text-xs text-loss">{ibkrError}</p>}

          <p className="text-xs text-text-muted border-t border-border pt-3">
            Duplicate trades are detected by IBKR transaction ID — re-importing only updates prices, never overwrites your notes, tags, or rules.
          </p>
        </div>
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

      {/* ── Updates ── */}
      <Section icon={Zap} title="Updates">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary mb-0.5">Check for Updates</p>
            <p className="text-xs text-text-muted">Manually check for a new version of Trade Journal.</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {updateState.kind === 'idle' && (
              <button onClick={() => { void handleCheckUpdates() }} className="btn-secondary text-sm flex items-center gap-1.5">
                <RefreshCw size={13} /> Check Now
              </button>
            )}
            {updateState.kind === 'checking' && (
              <span className="flex items-center gap-1.5 text-sm text-text-muted">
                <RefreshCw size={13} className="animate-spin" /> Checking…
              </span>
            )}
            {updateState.kind === 'up-to-date' && (
              <span className="flex items-center gap-1 text-sm text-profit"><Check size={13} /> Up to date</span>
            )}
            {updateState.kind === 'available' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-warning font-medium">v{updateState.version} available</span>
                <button onClick={() => { void handleInstallUpdate() }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                  <Download size={12} /> Install
                </button>
              </div>
            )}
            {updateState.kind === 'downloading' && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${updateState.progress}%` }} />
                </div>
                <span className="text-xs text-text-muted font-mono">{updateState.progress}%</span>
              </div>
            )}
            {updateState.kind === 'ready' && (
              <button onClick={() => { void relaunch() }} className="btn-primary text-sm flex items-center gap-1.5">
                <RefreshCw size={13} /> Restart &amp; Install
              </button>
            )}
            {updateState.kind === 'error' && (
              <span className="text-xs text-loss">{updateState.message}</span>
            )}
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
              <p className="text-xs text-text-secondary">This will permanently delete <span className="text-loss font-medium">{getTrades().length} trade{getTrades().length !== 1 ? 's' : ''}</span> and all associated screenshots. Cannot be undone.</p>
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
                This will permanently delete <span className="text-loss font-medium">{getTrades().length} trade{getTrades().length !== 1 ? 's' : ''}</span>, all journal entries, rules, and settings. Cannot be undone.
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

      {/* ── Support ── */}
      <div className="flex items-center justify-center gap-4 pb-2 text-xs text-text-muted">
        <button
          onClick={async () => {
            try {
              const { openUrl } = await import('@tauri-apps/plugin-opener')
              await openUrl('https://github.com/ovuw/trade-journal/issues')
            } catch {
              window.open('https://github.com/ovuw/trade-journal/issues', '_blank', 'noopener,noreferrer')
            }
          }}
          className="flex items-center gap-1 hover:text-text-primary transition-colors"
        >
          <ExternalLink size={11} />
          Report an issue
        </button>
      </div>

    </div>
  )
}
