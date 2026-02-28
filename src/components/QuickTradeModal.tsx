import { useState, useMemo, useEffect, useRef } from 'react'
import { X, Zap, CheckCircle } from 'lucide-react'
import { saveTrade, getSetupTags } from '../lib/db'
import { getSession } from '../lib/supabase'
import { pushTrade } from '../lib/sync'
import { detectSession, nowLocal } from '../lib/tradeUtils'
import { type Direction, type AssetClass } from '../types'

const ASSET_CLASSES: AssetClass[] = ['stock', 'option', 'futures', 'forex', 'crypto']

const DRAFT_KEY = 'tj_draft_quick_trade'

function loadDraft(): Fields | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Fields
    if (!d.ticker && !d.entry_price) return null
    return d
  } catch {
    return null
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

type Fields = {
  ticker: string
  direction: Direction
  asset_class: AssetClass
  entry_price: string
  exit_price: string
  quantity: string
  setup_tag_id: string
  entry_time: string
}

type Errors = Partial<Record<keyof Fields, string>>

export default function QuickTradeModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Fields>(() => {
    const draft = loadDraft()
    return draft ?? {
      ticker: '',
      direction: 'long',
      asset_class: 'stock',
      entry_price: '',
      exit_price: '',
      quantity: '',
      setup_tag_id: '',
      entry_time: nowLocal(),
    }
  })
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState(false)

  const setupTags = useMemo(() => getSetupTags(), [])
  const dialogRef = useRef<HTMLDivElement>(null)
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Capture latest onClose in a ref so the keydown effect doesn't need to re-register
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    }
  }, [])

  // Escape to close + Tab focus trap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Persist draft on field change — debounced 400ms to avoid writing on every keystroke
  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
      draftSaveTimer.current = setTimeout(() => {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      }, 400)
      return next
    })
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const errs: Errors = {}
    if (!form.ticker.trim()) errs.ticker = 'Required'
    if (!form.entry_price) errs.entry_price = 'Required'
    if (!form.exit_price) errs.exit_price = 'Required'
    if (!form.quantity) errs.quantity = 'Required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSave() {
    if (!validate()) return

    const entry = parseFloat(form.entry_price)
    const exit = parseFloat(form.exit_price)
    const qty = parseFloat(form.quantity)
    const pnl = form.direction === 'long' ? (exit - entry) * qty : (entry - exit) * qty
    const result_pct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0

    const trade = saveTrade({
      ticker: form.ticker.toUpperCase(),
      direction: form.direction,
      asset_class: form.asset_class,
      entry_price: entry,
      exit_price: exit,
      quantity: qty,
      fees: 0,
      stop_price: null,
      target_price: null,
      planned_rr: null,
      actual_r: null,
      entry_time: form.entry_time,
      exit_time: form.entry_time,
      setup_tag_id: form.setup_tag_id,
      mistake_tag_ids: [],
      rules_broken_ids: [],
      rules_followed_ids: [],
      emotion_entry: 0,
      emotion_exit: 0,
      confidence: 0,
      notes: '',
      pnl,
      result_pct,
      screenshot_id: null,
      session: detectSession(form.entry_time),
    })

    void getSession().then(s => {
      if (s) void pushTrade(trade, s.user.id)
    })

    clearDraft()
    setSaved(true)
    setTimeout(onClose, 600)
  }

  const pnlPreview = (() => {
    const entry = parseFloat(form.entry_price)
    const exit = parseFloat(form.exit_price)
    const qty = parseFloat(form.quantity)
    if (!entry || !exit || !qty) return null
    const pnl = form.direction === 'long' ? (exit - entry) * qty : (entry - exit) * qty
    const pct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0
    return { pnl, pct }
  })()

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qe-title"
        className="bg-bg-card border border-border rounded-xl p-5 w-full max-w-sm shadow-card-hover"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-accent" aria-hidden="true" />
            <h2 id="qe-title" className="font-semibold text-text-primary">Quick Entry</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {saved ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2" role="status">
            <CheckCircle size={36} className="text-profit" aria-hidden="true" />
            <p className="text-text-primary font-medium">Trade Saved</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Ticker + Direction */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="qe-ticker" className="text-xs text-text-secondary block mb-1.5">
                  Ticker <span className="text-loss" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="qe-ticker"
                  type="text"
                  value={form.ticker}
                  onChange={e => update('ticker', e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  maxLength={10}
                  autoFocus
                  aria-required="true"
                  aria-invalid={!!errors.ticker}
                  aria-describedby={errors.ticker ? 'qe-ticker-err' : undefined}
                  className={`input font-mono font-semibold text-sm tracking-widest uppercase ${errors.ticker ? 'border-loss' : ''}`}
                />
                {errors.ticker && <p id="qe-ticker-err" className="text-xs text-loss mt-0.5" role="alert">{errors.ticker}</p>}
              </div>
              <div className="w-36">
                <span className="text-xs text-text-secondary block mb-1.5" aria-hidden="true">
                  Direction <span className="text-loss">*</span>
                </span>
                <div className="flex rounded-md overflow-hidden border border-border" role="group" aria-label="Direction (required)">
                  {(['long', 'short'] as Direction[]).map(dir => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => update('direction', dir)}
                      aria-pressed={form.direction === dir}
                      className={`flex-1 py-2 text-xs font-bold tracking-wide transition-colors ${
                        form.direction === dir
                          ? dir === 'long'
                            ? 'bg-profit text-bg-primary'
                            : 'bg-loss text-white'
                          : 'bg-bg-secondary text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {dir.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Asset Class */}
            <div>
              <span className="text-xs text-text-secondary block mb-1.5" aria-hidden="true">Asset Class</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Asset class">
                {ASSET_CLASSES.map(ac => (
                  <button
                    key={ac}
                    type="button"
                    onClick={() => update('asset_class', ac)}
                    aria-pressed={form.asset_class === ac}
                    className={`px-2.5 py-1 text-xs rounded-full border capitalize transition-all ${
                      form.asset_class === ac
                        ? 'border-accent text-accent bg-accent/10'
                        : 'border-border text-text-secondary hover:border-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {ac}
                  </button>
                ))}
              </div>
            </div>

            {/* Entry / Exit Price */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="qe-entry-price" className="text-xs text-text-secondary block mb-1.5">
                  Entry Price <span className="text-loss" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" aria-hidden="true">$</span>
                  <input
                    id="qe-entry-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.entry_price}
                    onChange={e => update('entry_price', e.target.value)}
                    placeholder="0.00"
                    aria-required="true"
                    aria-invalid={!!errors.entry_price}
                    aria-describedby={errors.entry_price ? 'qe-entry-price-err' : undefined}
                    className={`input pl-6 font-mono text-sm ${errors.entry_price ? 'border-loss' : ''}`}
                  />
                </div>
                {errors.entry_price && <p id="qe-entry-price-err" className="text-xs text-loss mt-0.5" role="alert">{errors.entry_price}</p>}
              </div>
              <div>
                <label htmlFor="qe-exit-price" className="text-xs text-text-secondary block mb-1.5">
                  Exit Price <span className="text-loss" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" aria-hidden="true">$</span>
                  <input
                    id="qe-exit-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.exit_price}
                    onChange={e => update('exit_price', e.target.value)}
                    placeholder="0.00"
                    aria-required="true"
                    aria-invalid={!!errors.exit_price}
                    aria-describedby={errors.exit_price ? 'qe-exit-price-err' : undefined}
                    className={`input pl-6 font-mono text-sm ${errors.exit_price ? 'border-loss' : ''}`}
                  />
                </div>
                {errors.exit_price && <p id="qe-exit-price-err" className="text-xs text-loss mt-0.5" role="alert">{errors.exit_price}</p>}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label htmlFor="qe-quantity" className="text-xs text-text-secondary block mb-1.5">
                Quantity <span className="text-loss" aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="qe-quantity"
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={e => update('quantity', e.target.value)}
                placeholder="100"
                aria-required="true"
                aria-invalid={!!errors.quantity}
                aria-describedby={errors.quantity ? 'qe-quantity-err' : undefined}
                className={`input font-mono text-sm ${errors.quantity ? 'border-loss' : ''}`}
              />
              {errors.quantity && <p id="qe-quantity-err" className="text-xs text-loss mt-0.5" role="alert">{errors.quantity}</p>}
            </div>

            {/* P/L Preview */}
            {pnlPreview && (
              <div className="flex items-center justify-between border-t border-border pt-2.5" aria-live="polite" aria-atomic="true">
                <span className="text-xs text-text-secondary">Calculated P/L</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-semibold text-sm ${pnlPreview.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {pnlPreview.pnl >= 0 ? '+' : ''}${pnlPreview.pnl.toFixed(2)}
                  </span>
                  <span className={`text-xs font-mono ${pnlPreview.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    ({pnlPreview.pnl >= 0 ? '+' : ''}{pnlPreview.pct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Setup Tag */}
            <div>
              <label htmlFor="qe-setup-tag" className="text-xs text-text-secondary block mb-1.5">Setup Tag</label>
              <select
                id="qe-setup-tag"
                value={form.setup_tag_id}
                onChange={e => update('setup_tag_id', e.target.value)}
                className="input text-sm"
              >
                <option value="">— Select setup —</option>
                {setupTags.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Entry Time */}
            <div>
              <label htmlFor="qe-entry-time" className="text-xs text-text-secondary block mb-1.5">Entry Time</label>
              <input
                id="qe-entry-time"
                type="datetime-local"
                value={form.entry_time}
                onChange={e => update('entry_time', e.target.value)}
                className="input text-sm"
              />
            </div>

            {/* Save */}
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary w-full mt-1"
            >
              Save Trade
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
