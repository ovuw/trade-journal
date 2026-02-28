/**
 * Local database using localStorage.
 * Supabase sync will be layered on top in Phase 11.
 */
import { Trade, Rule, ChecklistItem, JournalEntry, Tag, DEFAULT_RULES, DEFAULT_CHECKLIST_LABELS, DEFAULT_SETUP_TAGS, DEFAULT_MISTAKE_TAGS } from '../types'

const TRADES_KEY = 'tj_trades'

// ── Module-level cache ─────────────────────────────────────────────────────────
let _tradesCache: Trade[] | null = null

export function getTrades(): Trade[] {
  if (_tradesCache !== null) return _tradesCache
  try {
    _tradesCache = JSON.parse(localStorage.getItem(TRADES_KEY) || '[]') as Trade[]
    return _tradesCache
  } catch {
    _tradesCache = []
    return _tradesCache
  }
}

// ── Schema migrations ──────────────────────────────────────────────────────────
const SCHEMA_VERSION = 1

export function runMigrations(): void {
  const current = parseInt(localStorage.getItem('tj_schema_version') ?? '0', 10)
  if (current >= SCHEMA_VERSION) return
  if (current < 1) {
    // Ensure all trades have required array fields
    const raw = JSON.parse(localStorage.getItem(TRADES_KEY) || '[]') as Record<string, unknown>[]
    const migrated = raw.map(t => ({
      ...t,
      mistake_tag_ids: (t.mistake_tag_ids as string[] | undefined) ?? [],
      rules_broken_ids: (t.rules_broken_ids as string[] | undefined) ?? [],
    }))
    localStorage.setItem(TRADES_KEY, JSON.stringify(migrated))
    _tradesCache = null
  }
  localStorage.setItem('tj_schema_version', String(SCHEMA_VERSION))
}

export function getTradeById(id: string): Trade | null {
  return getTrades().find(t => t.id === id) ?? null
}

export function saveTrade(trade: Omit<Trade, 'id' | 'created_at' | 'updated_at'>): Trade {
  const trades = getTrades()
  const newTrade: Trade = {
    ...trade,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  trades.unshift(newTrade)
  _tradesCache = null
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
  return newTrade
}

export function updateTrade(id: string, updates: Partial<Omit<Trade, 'id' | 'created_at'>>): Trade | null {
  const trades = getTrades()
  const idx = trades.findIndex(t => t.id === id)
  if (idx === -1) return null
  trades[idx] = { ...trades[idx], ...updates, updated_at: new Date().toISOString() }
  _tradesCache = null
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
  return trades[idx]
}

export function deleteTrade(id: string): void {
  const trades = getTrades().filter(t => t.id !== id)
  _tradesCache = null
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
}

export function deleteTrades(ids: string[]): void {
  const idSet = new Set(ids)
  for (const id of idSet) deleteScreenshots(id)
  const remaining = getTrades().filter(t => !idSet.has(t.id))
  _tradesCache = null
  localStorage.setItem(TRADES_KEY, JSON.stringify(remaining))
}

// Screenshot stored separately to avoid bloating the trades array
export function saveScreenshot(tradeId: string, dataUrl: string): void {
  localStorage.setItem(`tj_screenshot_${tradeId}`, dataUrl)
}

export function getScreenshot(tradeId: string): string | null {
  return localStorage.getItem(`tj_screenshot_${tradeId}`)
}

export function deleteScreenshot(tradeId: string): void {
  localStorage.removeItem(`tj_screenshot_${tradeId}`)
}

// Multiple screenshots per trade (up to 5)
const MAX_SCREENSHOTS = 5

export function getScreenshots(tradeId: string): string[] {
  try {
    const multi = localStorage.getItem(`tj_screenshots_${tradeId}`)
    if (multi) return JSON.parse(multi) as string[]
    // Fall back to legacy single screenshot
    const single = localStorage.getItem(`tj_screenshot_${tradeId}`)
    return single ? [single] : []
  } catch {
    return []
  }
}

function estimateLocalStorageBytes(): number {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) ?? ''
    total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
  }
  return total
}

export function saveScreenshots(tradeId: string, urls: string[]): void {
  const toSave = urls.slice(0, MAX_SCREENSHOTS)
  const incoming = JSON.stringify(toSave).length * 2
  const used = estimateLocalStorageBytes()
  if (used + incoming > 8 * 1024 * 1024) {
    throw new Error('Storage full: remove some screenshots to free space.')
  }
  localStorage.setItem(`tj_screenshots_${tradeId}`, JSON.stringify(toSave))
}

export function deleteScreenshots(tradeId: string): void {
  localStorage.removeItem(`tj_screenshots_${tradeId}`)
  localStorage.removeItem(`tj_screenshot_${tradeId}`)
}

// Calculator settings
const CALC_KEY = 'tj_calc_settings'
export interface CalcSettings { accountBalance: number; maxRiskPct: number }

export function getCalcSettings(): CalcSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(CALC_KEY) || '{}') as Partial<CalcSettings>
    return {
      accountBalance: parsed.accountBalance ?? 10000,
      maxRiskPct: parsed.maxRiskPct ?? 1,
    }
  } catch {
    return { accountBalance: 10000, maxRiskPct: 1 }
  }
}

export function saveCalcSettings(s: CalcSettings): void {
  localStorage.setItem(CALC_KEY, JSON.stringify(s))
}

// Pre-market checklist state — keyed by date string (YYYY-MM-DD)
export function getChecklistState(date: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(`tj_checklist_${date}`) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

export function saveChecklistState(date: string, state: Record<string, boolean>): void {
  localStorage.setItem(`tj_checklist_${date}`, JSON.stringify(state))
}

// ── Rules ─────────────────────────────────────────────────────────────────────
const RULES_KEY = 'tj_rules'

export function getRules(): Rule[] {
  try {
    const stored = localStorage.getItem(RULES_KEY)
    if (stored) return JSON.parse(stored) as Rule[]
    // First run: seed defaults
    localStorage.setItem(RULES_KEY, JSON.stringify(DEFAULT_RULES))
    return DEFAULT_RULES
  } catch {
    return DEFAULT_RULES
  }
}

export function saveRules(rules: Rule[]): void {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules))
}

// ── Checklist items (editable list, separate from per-day state) ──────────────
const CHECKLIST_ITEMS_KEY = 'tj_checklist_items'

export function getChecklistItems(): ChecklistItem[] {
  try {
    const stored = localStorage.getItem(CHECKLIST_ITEMS_KEY)
    if (stored) return JSON.parse(stored) as ChecklistItem[]
    // First run: seed defaults
    const seeded: ChecklistItem[] = DEFAULT_CHECKLIST_LABELS.map((label, i) => ({
      id: `cl-${i}`,
      label,
      order_index: i,
      is_active: true,
    }))
    localStorage.setItem(CHECKLIST_ITEMS_KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

export function saveChecklistItems(items: ChecklistItem[]): void {
  localStorage.setItem(CHECKLIST_ITEMS_KEY, JSON.stringify(items))
}

// ── Playbook notes ─────────────────────────────────────────────────────────────
const PLAYBOOK_NOTES_KEY = 'tj_playbook_notes'

export function getPlaybookNotes(): string {
  return localStorage.getItem(PLAYBOOK_NOTES_KEY) ?? ''
}

export function savePlaybookNotes(notes: string): void {
  localStorage.setItem(PLAYBOOK_NOTES_KEY, notes)
}

// ── Journal entries ────────────────────────────────────────────────────────────
const JOURNAL_KEY = 'tj_journal'

export function getJournalEntries(): JournalEntry[] {
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]') as JournalEntry[]
  } catch {
    return []
  }
}

export function getJournalEntry(date: string): JournalEntry | null {
  return getJournalEntries().find(e => e.date === date) ?? null
}

export function upsertJournalEntry(data: {
  date: string
  content: string
  mood: number
  market_condition: string
}): JournalEntry {
  const entries = getJournalEntries()
  const idx = entries.findIndex(e => e.date === data.date)
  if (idx !== -1) {
    const updated: JournalEntry = {
      ...entries[idx],
      ...data,
      market_condition: data.market_condition as JournalEntry['market_condition'],
      updated_at: new Date().toISOString(),
    }
    entries[idx] = updated
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries))
    return updated
  }
  const newEntry: JournalEntry = {
    ...data,
    market_condition: data.market_condition as JournalEntry['market_condition'],
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  entries.unshift(newEntry)
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries))
  return newEntry
}

// ── Account settings ────────────────────────────────────────────────────────────
const ACCOUNT_KEY = 'tj_account_settings'

export interface AccountSettings {
  name: string
  startingBalance: number
  maxRiskPct: number
  maxDailyLossPct: number
}

const ACCOUNT_DEFAULTS: AccountSettings = {
  name: '',
  startingBalance: 10000,
  maxRiskPct: 1,
  maxDailyLossPct: 3,
}

export function getAccountSettings(): AccountSettings {
  try {
    const stored = localStorage.getItem(ACCOUNT_KEY)
    if (stored) return { ...ACCOUNT_DEFAULTS, ...JSON.parse(stored) as AccountSettings }
    // Seed from CalcSettings on first visit
    const calc = getCalcSettings()
    return { ...ACCOUNT_DEFAULTS, startingBalance: calc.accountBalance, maxRiskPct: calc.maxRiskPct }
  } catch {
    return ACCOUNT_DEFAULTS
  }
}

export function saveAccountSettings(s: AccountSettings): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s))
  // Keep PositionCalculator in sync
  saveCalcSettings({ accountBalance: s.startingBalance, maxRiskPct: s.maxRiskPct })
}

// ── Supabase runtime config ─────────────────────────────────────────────────────
const SUPABASE_CONFIG_KEY = 'tj_supabase_config'

export interface SupabaseConfig { url: string; anonKey: string }

export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const s = localStorage.getItem(SUPABASE_CONFIG_KEY)
    return s ? JSON.parse(s) as SupabaseConfig : null
  } catch {
    return null
  }
}

export function saveSupabaseConfig(config: SupabaseConfig | null): void {
  if (config) localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config))
  else localStorage.removeItem(SUPABASE_CONFIG_KEY)
}

// ── Anthropic API key ──────────────────────────────────────────────────────────
const ANTHROPIC_KEY = 'tj_anthropic_key'

export function getAnthropicKey(): string {
  return localStorage.getItem(ANTHROPIC_KEY) ?? ''
}

export function saveAnthropicKey(key: string): void {
  if (key) localStorage.setItem(ANTHROPIC_KEY, key)
  else localStorage.removeItem(ANTHROPIC_KEY)
}

// ── Pre-market reminder settings ───────────────────────────────────────────────
const REMINDER_KEY = 'tj_reminder'

export interface ReminderSettings {
  enabled: boolean
  time: string   // "HH:MM" 24-hour
  weekdaysOnly: boolean
}

export function getReminderSettings(): ReminderSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}') as Partial<ReminderSettings>
    return {
      enabled: raw.enabled ?? false,
      time: raw.time ?? '09:00',
      weekdaysOnly: raw.weekdaysOnly ?? true,
    }
  } catch {
    return { enabled: false, time: '09:00', weekdaysOnly: true }
  }
}

export function saveReminderSettings(s: ReminderSettings): void {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(s))
}

// ── Bulk replace trades (used after sync merge) ─────────────────────────────────
export function replaceTrades(trades: Trade[]): void {
  _tradesCache = null
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
}

// ── Account records (multi-account) ────────────────────────────────────────────
const ACCOUNTS_KEY = 'tj_accounts'
const ACTIVE_ACCOUNT_KEY = 'tj_active_account_id'

export interface AccountRecord {
  id: string
  name: string
  broker: string
  currency: string
  startingBalance: number
  maxRiskPct: number
  maxDailyLossPct: number
  created_at: string
}

function sanitizeAccount(acc: AccountRecord): AccountRecord {
  return {
    ...acc,
    startingBalance: acc.startingBalance ?? 10000,
    maxRiskPct: acc.maxRiskPct ?? 1,
    maxDailyLossPct: acc.maxDailyLossPct ?? 3,
  }
}

export function getAccounts(): AccountRecord[] {
  try {
    const stored = localStorage.getItem(ACCOUNTS_KEY)
    if (stored) return (JSON.parse(stored) as AccountRecord[]).map(sanitizeAccount)
    // Seed from existing account settings on first run (migration path)
    const s = getAccountSettings()
    const seed: AccountRecord = {
      id: crypto.randomUUID(),
      name: s.name || 'Main Account',
      broker: '',
      currency: 'USD',
      startingBalance: s.startingBalance ?? 10000,
      maxRiskPct: s.maxRiskPct ?? 1,
      maxDailyLossPct: s.maxDailyLossPct ?? 3,
      created_at: new Date().toISOString(),
    }
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([seed]))
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, seed.id)
    return [seed]
  } catch {
    return []
  }
}

export function saveAccounts(accounts: AccountRecord[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function getActiveAccountId(): string {
  const stored = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
  if (stored) return stored
  const accounts = getAccounts()
  const id = accounts[0]?.id ?? ''
  if (id) localStorage.setItem(ACTIVE_ACCOUNT_KEY, id)
  return id
}

export function setActiveAccountId(id: string): void {
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, id)
  const account = getAccounts().find(a => a.id === id)
  if (account) saveCalcSettings({ accountBalance: account.startingBalance, maxRiskPct: account.maxRiskPct })
}

export function getActiveAccount(): AccountRecord | null {
  const accounts = getAccounts()
  const id = getActiveAccountId()
  return accounts.find(a => a.id === id) ?? accounts[0] ?? null
}

// ── Setup & Mistake Tags (user-customizable) ───────────────────────────────────

const SETUP_TAGS_KEY = 'tj_setup_tags'
const MISTAKE_TAGS_KEY = 'tj_mistake_tags'

export function getSetupTags(): Tag[] {
  try {
    const stored = localStorage.getItem(SETUP_TAGS_KEY)
    if (stored) return JSON.parse(stored) as Tag[]
    localStorage.setItem(SETUP_TAGS_KEY, JSON.stringify(DEFAULT_SETUP_TAGS))
    return DEFAULT_SETUP_TAGS
  } catch {
    return DEFAULT_SETUP_TAGS
  }
}

export function saveSetupTags(tags: Tag[]): void {
  localStorage.setItem(SETUP_TAGS_KEY, JSON.stringify(tags))
}

export function getMistakeTags(): Tag[] {
  try {
    const stored = localStorage.getItem(MISTAKE_TAGS_KEY)
    if (stored) return JSON.parse(stored) as Tag[]
    localStorage.setItem(MISTAKE_TAGS_KEY, JSON.stringify(DEFAULT_MISTAKE_TAGS))
    return DEFAULT_MISTAKE_TAGS
  } catch {
    return DEFAULT_MISTAKE_TAGS
  }
}

export function saveMistakeTags(tags: Tag[]): void {
  localStorage.setItem(MISTAKE_TAGS_KEY, JSON.stringify(tags))
}

// ── Trade Note Template ────────────────────────────────────────────────────────

const NOTE_TEMPLATE_KEY = 'tj_note_template'

const DEFAULT_NOTE_TEMPLATE = `Thesis:

Execution:

What went well:

What to improve:`

export function getNoteTemplate(): string {
  return localStorage.getItem(NOTE_TEMPLATE_KEY) ?? DEFAULT_NOTE_TEMPLATE
}

export function saveNoteTemplate(template: string): void {
  localStorage.setItem(NOTE_TEMPLATE_KEY, template)
}

// ── IBKR Flex Query config ─────────────────────────────────────────────────────
const IBKR_CONFIG_KEY = 'tj_ibkr_config'

export interface IbkrConfig {
  flexToken: string
  queryId: string
  autoSync: boolean
}

export function getIbkrConfig(): IbkrConfig | null {
  try {
    const s = localStorage.getItem(IBKR_CONFIG_KEY)
    return s ? JSON.parse(s) as IbkrConfig : null
  } catch {
    return null
  }
}

export function saveIbkrConfig(config: IbkrConfig | null): void {
  if (config) localStorage.setItem(IBKR_CONFIG_KEY, JSON.stringify(config))
  else localStorage.removeItem(IBKR_CONFIG_KEY)
}

// ── AI Analyses (save last 10) ─────────────────────────────────────────────────

const AI_ANALYSES_KEY = 'tj_ai_analyses'
const MAX_ANALYSES = 10

export interface SavedAnalysis {
  id: string
  date: string     // YYYY-MM-DD
  period: string   // e.g. 'All Time', 'Last 30 Days'
  content: string
}

export function getAnalyses(): SavedAnalysis[] {
  try {
    return JSON.parse(localStorage.getItem(AI_ANALYSES_KEY) || '[]') as SavedAnalysis[]
  } catch {
    return []
  }
}

export function saveAnalysis(analysis: Omit<SavedAnalysis, 'id'>): void {
  const analyses = getAnalyses()
  const newEntry: SavedAnalysis = { ...analysis, id: crypto.randomUUID() }
  const updated = [newEntry, ...analyses].slice(0, MAX_ANALYSES)
  localStorage.setItem(AI_ANALYSES_KEY, JSON.stringify(updated))
}
