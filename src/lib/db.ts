/**
 * Local database using localStorage.
 * Supabase sync will be layered on top in Phase 11.
 */
import { Trade, Rule, ChecklistItem, JournalEntry, DEFAULT_RULES, DEFAULT_CHECKLIST_LABELS } from '../types'

const TRADES_KEY = 'tj_trades'

export function getTrades(): Trade[] {
  try {
    return JSON.parse(localStorage.getItem(TRADES_KEY) || '[]') as Trade[]
  } catch {
    return []
  }
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
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
  return newTrade
}

export function updateTrade(id: string, updates: Partial<Omit<Trade, 'id' | 'created_at'>>): Trade | null {
  const trades = getTrades()
  const idx = trades.findIndex(t => t.id === id)
  if (idx === -1) return null
  trades[idx] = { ...trades[idx], ...updates, updated_at: new Date().toISOString() }
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades))
  return trades[idx]
}

export function deleteTrade(id: string): void {
  localStorage.setItem(TRADES_KEY, JSON.stringify(getTrades().filter(t => t.id !== id)))
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

// Calculator settings
const CALC_KEY = 'tj_calc_settings'
export interface CalcSettings { accountBalance: number; maxRiskPct: number }

export function getCalcSettings(): CalcSettings {
  try {
    return JSON.parse(localStorage.getItem(CALC_KEY) || '{}') as CalcSettings
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

// ── Bulk replace trades (used after sync merge) ─────────────────────────────────
export function replaceTrades(trades: Trade[]): void {
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

export function getAccounts(): AccountRecord[] {
  try {
    const stored = localStorage.getItem(ACCOUNTS_KEY)
    if (stored) return JSON.parse(stored) as AccountRecord[]
    // Seed from existing account settings on first run (migration path)
    const s = getAccountSettings()
    const seed: AccountRecord = {
      id: crypto.randomUUID(),
      name: s.name || 'Main Account',
      broker: '',
      currency: 'USD',
      startingBalance: s.startingBalance,
      maxRiskPct: s.maxRiskPct,
      maxDailyLossPct: s.maxDailyLossPct,
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
