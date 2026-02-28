import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { ImagePlus, X, CheckCircle, Clock } from 'lucide-react'
import PositionCalculator from '../components/PositionCalculator'
import StarRating from '../components/StarRating'
import MultiTagSelect from '../components/MultiTagSelect'
import { saveTrade, getTradeById, updateTrade, getRules, getScreenshots, saveScreenshots, getSetupTags, getMistakeTags, getNoteTemplate } from '../lib/db'
import { compressImage } from '../lib/imageUtils'
import { getSession } from '../lib/supabase'
import { uploadTradeScreenshot } from '../lib/storage'
import { pushTrade } from '../lib/sync'
import {
  type TradeFormData,
  type Direction,
  type AssetClass,
} from '../types'
import { detectSession, nowLocal } from '../lib/tradeUtils'

const ASSET_CLASSES: AssetClass[] = ['stock', 'option', 'futures', 'forex', 'crypto']

const DRAFT_KEY = 'tj_draft_trade'

function loadDraft(): TradeFormData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as TradeFormData
    // Only restore if there's meaningful content
    if (!draft.ticker && !draft.entry_price) return null
    return draft
  } catch {
    return null
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

function makeEmptyForm(): TradeFormData {
  return {
    ticker: '',
    direction: 'long',
    asset_class: 'stock',
    entry_price: '',
    exit_price: '',
    stop_price: '',
    target_price: '',
    quantity: '',
    fees: '',
    entry_time: nowLocal(),
    exit_time: nowLocal(),
    setup_tag_id: '',
    mistake_tag_ids: [],
    rules_broken_ids: [],
    emotion_entry: 0,
    emotion_exit: 0,
    confidence: 0,
    notes: getNoteTemplate(),
  }
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
      {title}
    </h2>
  )
}

function Label({ children, required, htmlFor }: { children: React.ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs text-text-secondary block mb-1.5">
      {children}
      {required && <span className="text-loss ml-0.5" aria-hidden="true">*</span>}
      {required && <span className="sr-only">(required)</span>}
    </label>
  )
}

function PriceInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  id,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  id?: string
}) {
  return (
    <div>
      <Label required={required} htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" aria-hidden="true">$</span>
        <input
          id={id}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '0.00'}
          className="input pl-6 font-mono text-sm"
          required={required}
        />
      </div>
    </div>
  )
}

export default function NewTrade() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id')
  const isEdit = !!editId

  // Pre-fill form when editing
  const [form, setForm] = useState<TradeFormData>(() => {
    if (editId) {
      const t = getTradeById(editId)
      if (t) {
        return {
          ticker: t.ticker,
          direction: t.direction,
          asset_class: t.asset_class,
          entry_price: String(t.entry_price),
          exit_price: String(t.exit_price),
          stop_price: t.stop_price != null ? String(t.stop_price) : '',
          target_price: t.target_price != null ? String(t.target_price) : '',
          quantity: String(t.quantity),
          fees: String(t.fees),
          entry_time: t.entry_time.slice(0, 16),
          exit_time: t.exit_time.slice(0, 16),
          setup_tag_id: t.setup_tag_id,
          mistake_tag_ids: t.mistake_tag_ids,
          rules_broken_ids: t.rules_broken_ids,
          emotion_entry: t.emotion_entry,
          emotion_exit: t.emotion_exit,
          confidence: t.confidence,
          notes: t.notes,
        }
      }
    }
    return loadDraft() ?? makeEmptyForm()
  })

  const [draftRestored, setDraftRestored] = useState(() => !editId && loadDraft() !== null)
  const [screenshots, setScreenshots] = useState<string[]>(() =>
    editId ? getScreenshots(editId) : []
  )
  const [isDragging, setIsDragging] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof TradeFormData, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const update = useCallback(<K extends keyof TradeFormData>(key: K, value: TradeFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }, [])

  const MAX_SCREENSHOTS = 5

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (screenshots.length >= MAX_SCREENSHOTS) return
    const reader = new FileReader()
    reader.onload = async e => {
      const dataUrl = e.target?.result as string
      const compressed = await compressImage(dataUrl)
      setScreenshots(prev => [...prev, compressed])
    }
    reader.readAsDataURL(file)
  }

  const handleFiles = (files: FileList) => {
    const remaining = MAX_SCREENSHOTS - screenshots.length
    Array.from(files).slice(0, remaining).forEach(handleFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  const removeScreenshot = (idx: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== idx))
  }

  const fillQuantity = useCallback((qty: number) => {
    update('quantity', String(qty))
  }, [update])

  const validate = (): boolean => {
    const errs: Partial<Record<keyof TradeFormData, string>> = {}
    if (!form.ticker.trim()) errs.ticker = 'Required'
    if (!form.entry_price) errs.entry_price = 'Required'
    if (!form.exit_price) errs.exit_price = 'Required'
    if (!form.quantity) errs.quantity = 'Required'
    if (!form.entry_time) errs.entry_time = 'Required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitError(null)

    const entry = parseFloat(form.entry_price)
    const exit = parseFloat(form.exit_price)
    const qty = parseFloat(form.quantity)
    const fees = parseFloat(form.fees) || 0
    const stop = form.stop_price ? parseFloat(form.stop_price) : null
    const target = form.target_price ? parseFloat(form.target_price) : null

    const pnl = form.direction === 'long' ? (exit - entry) * qty - fees : (entry - exit) * qty - fees
    const result_pct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0

    const stopDist = stop ? Math.abs(entry - stop) : null
    const planned_rr =
      stopDist && target ? Math.abs(target - entry) / stopDist : null
    const initial_risk = stopDist ? stopDist * qty : null
    const actual_r = initial_risk && initial_risk > 0 ? pnl / initial_risk : null

    try {
      if (isEdit && editId) {
        updateTrade(editId, {
          ticker: form.ticker.toUpperCase(),
          direction: form.direction,
          asset_class: form.asset_class,
          entry_price: entry,
          exit_price: exit,
          quantity: qty,
          fees,
          stop_price: stop,
          target_price: target,
          planned_rr,
          actual_r,
          entry_time: form.entry_time,
          exit_time: form.exit_time || form.entry_time,
          setup_tag_id: form.setup_tag_id,
          mistake_tag_ids: form.mistake_tag_ids,
          rules_broken_ids: form.rules_broken_ids,
          rules_followed_ids: [],
          emotion_entry: form.emotion_entry,
          emotion_exit: form.emotion_exit,
          confidence: form.confidence,
          notes: form.notes,
          pnl,
          result_pct,
          screenshot_id: null,
          session: detectSession(form.entry_time),
        })
        saveScreenshots(editId, screenshots)
        void getSession().then(s => {
          if (s) {
            const updated = getTradeById(editId)
            if (updated) void pushTrade(updated, s.user.id)
            if (screenshots[0]) void uploadTradeScreenshot(editId, screenshots[0], s.user.id).then(path => { if (path) updateTrade(editId, { screenshot_id: path }) })
          }
        })
        clearDraft()
        showToast('Trade updated', 'success')
        setSaved(true)
        setTimeout(() => navigate('/trade-log'), 800)
      } else {
        const trade = saveTrade({
          ticker: form.ticker.toUpperCase(),
          direction: form.direction,
          asset_class: form.asset_class,
          entry_price: entry,
          exit_price: exit,
          quantity: qty,
          fees,
          stop_price: stop,
          target_price: target,
          planned_rr,
          actual_r,
          entry_time: form.entry_time,
          exit_time: form.exit_time || form.entry_time,
          setup_tag_id: form.setup_tag_id,
          mistake_tag_ids: form.mistake_tag_ids,
          rules_broken_ids: form.rules_broken_ids,
          rules_followed_ids: [],
          emotion_entry: form.emotion_entry,
          emotion_exit: form.emotion_exit,
          confidence: form.confidence,
          notes: form.notes,
          pnl,
          result_pct,
          screenshot_id: null,
          session: detectSession(form.entry_time),
        })
        saveScreenshots(trade.id, screenshots)
        void getSession().then(s => {
          if (s) {
            void pushTrade(trade, s.user.id)
            if (screenshots[0]) void uploadTradeScreenshot(trade.id, screenshots[0], s.user.id).then(path => { if (path) updateTrade(trade.id, { screenshot_id: path }) })
          }
        })
        clearDraft()
        showToast('Trade saved', 'success')
        setSaved(true)
        setTimeout(() => navigate('/trade-log'), 800)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save trade')
    }
  }

  const activeRules = useMemo(() => getRules().filter(r => r.is_active), [])
  const setupTagOptions = useMemo(() => getSetupTags(), [])
  const mistakeTagOptions = useMemo(() => getMistakeTags(), [])

  const entryNum = parseFloat(form.entry_price) || null
  const stopNum = parseFloat(form.stop_price) || null
  const targetNum = parseFloat(form.target_price) || null

  // Autosave draft to localStorage on every form change (new trade only)
  useEffect(() => {
    if (isEdit) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    } catch { /* storage full — ignore */ }
  }, [form, isEdit])

  // Cmd+S keyboard shortcut support
  useEffect(() => {
    const handler = () => {
      const fakeEvent = { preventDefault: () => {} } as React.FormEvent
      handleSubmit(fakeEvent)
    }
    window.addEventListener('trade:save', handler)
    return () => window.removeEventListener('trade:save', handler)
  // handleSubmit is stable (closure over form/errors state) — re-register when form changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  if (saved) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <CheckCircle size={48} className="text-profit mx-auto mb-3" />
          <p className="text-text-primary font-semibold text-lg">Trade Saved</p>
          <p className="text-text-secondary text-sm mt-1">Redirecting to trade log...</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="p-6 flex gap-6 items-start min-h-full">
        {/* ── Left: form ── */}
        <div className="flex-1 min-w-0 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              {isEdit ? 'Edit Trade' : 'New Trade'}
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">
              {isEdit ? 'Update your trade details' : 'Log a completed trade'}
            </p>
          </div>

          {draftRestored && (
            <div className="flex items-center justify-between bg-warning/10 border border-warning/30 rounded-lg px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-sm text-warning">
                <Clock size={13} /> Draft restored
              </span>
              <button
                type="button"
                onClick={() => { setForm(makeEmptyForm()); clearDraft(); setDraftRestored(false) }}
                className="text-xs text-text-secondary hover:text-text-primary underline"
              >
                Discard
              </button>
            </div>
          )}

          {submitError && (
            <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 text-sm text-loss">
              {submitError}
            </div>
          )}

          {/* ── Section 1: Trade Details ── */}
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <SectionHeader title="Trade Details" />
            <div className="space-y-4">
              {/* Ticker + Direction */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label required htmlFor="nt-ticker">Ticker</Label>
                  <input
                    id="nt-ticker"
                    type="text"
                    value={form.ticker}
                    onChange={e => update('ticker', e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    className={`input font-mono font-semibold text-base tracking-widest uppercase ${errors.ticker ? 'border-loss' : ''}`}
                    maxLength={10}
                  />
                  {errors.ticker && <p className="text-xs text-loss mt-1">{errors.ticker}</p>}
                </div>
                <div className="w-44">
                  <Label required>Direction</Label>
                  <div className="flex rounded-md overflow-hidden border border-border">
                    {(['long', 'short'] as Direction[]).map(dir => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => update('direction', dir)}
                        className={`flex-1 py-2.5 text-sm font-bold tracking-wide transition-colors ${
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

              {/* Asset class */}
              <div>
                <Label>Asset Class</Label>
                <div className="flex flex-wrap gap-2">
                  {ASSET_CLASSES.map(ac => (
                    <button
                      key={ac}
                      type="button"
                      onClick={() => update('asset_class', ac)}
                      className={`px-3 py-1.5 text-xs rounded-full border capitalize transition-all ${
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

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label required htmlFor="nt-entry-time">Entry Time</Label>
                  <input
                    id="nt-entry-time"
                    type="datetime-local"
                    value={form.entry_time}
                    onChange={e => update('entry_time', e.target.value)}
                    className={`input text-sm ${errors.entry_time ? 'border-loss' : ''}`}
                  />
                </div>
                <div>
                  <Label htmlFor="nt-exit-time">Exit Time</Label>
                  <input
                    id="nt-exit-time"
                    type="datetime-local"
                    value={form.exit_time}
                    onChange={e => update('exit_time', e.target.value)}
                    className="input text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Pricing & Size ── */}
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <SectionHeader title="Pricing & Size" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <PriceInput
                    id="nt-entry-price"
                    label="Entry Price"
                    value={form.entry_price}
                    onChange={v => update('entry_price', v)}
                    required
                  />
                  {errors.entry_price && <p className="text-xs text-loss mt-1">{errors.entry_price}</p>}
                </div>
                <div>
                  <PriceInput
                    id="nt-exit-price"
                    label="Exit Price"
                    value={form.exit_price}
                    onChange={v => update('exit_price', v)}
                    required
                  />
                  {errors.exit_price && <p className="text-xs text-loss mt-1">{errors.exit_price}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <PriceInput
                  id="nt-stop-price"
                  label="Stop Price"
                  value={form.stop_price}
                  onChange={v => update('stop_price', v)}
                  placeholder="Optional"
                />
                <PriceInput
                  id="nt-target-price"
                  label="Target Price"
                  value={form.target_price}
                  onChange={v => update('target_price', v)}
                  placeholder="Optional"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label required htmlFor="nt-quantity">Quantity / Shares</Label>
                  <input
                    id="nt-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={form.quantity}
                    onChange={e => update('quantity', e.target.value)}
                    placeholder="100"
                    className={`input font-mono text-sm ${errors.quantity ? 'border-loss' : ''}`}
                  />
                  {errors.quantity && <p className="text-xs text-loss mt-1">{errors.quantity}</p>}
                </div>
                <div>
                  <Label htmlFor="nt-fees">Fees / Commission</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm" aria-hidden="true">$</span>
                    <input
                      id="nt-fees"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.fees}
                      onChange={e => update('fees', e.target.value)}
                      placeholder="0.00"
                      className="input pl-6 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Computed P/L preview */}
              {form.entry_price && form.exit_price && form.quantity && (
                <div className="border-t border-border pt-3">
                  {(() => {
                    const entry = parseFloat(form.entry_price)
                    const exit = parseFloat(form.exit_price)
                    const qty = parseFloat(form.quantity)
                    const fees = parseFloat(form.fees) || 0
                    const pnl =
                      form.direction === 'long'
                        ? (exit - entry) * qty - fees
                        : (entry - exit) * qty - fees
                    const pct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0
                    const isProfit = pnl >= 0
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-secondary">Calculated P/L</span>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono font-semibold ${isProfit ? 'text-profit' : 'text-loss'}`}>
                            {isProfit ? '+' : ''}${pnl.toFixed(2)}
                          </span>
                          <span className={`text-xs font-mono ${isProfit ? 'text-profit' : 'text-loss'}`}>
                            ({isProfit ? '+' : ''}{pct.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* ── Section 3: Tags & Analysis ── */}
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <SectionHeader title="Tags & Analysis" />
            <div className="space-y-4">
              {/* Setup tag */}
              <div>
                <Label htmlFor="nt-setup-tag">Setup Tag</Label>
                <select
                  id="nt-setup-tag"
                  value={form.setup_tag_id}
                  onChange={e => update('setup_tag_id', e.target.value)}
                  className="input text-sm"
                >
                  <option value="">— Select setup —</option>
                  {setupTagOptions.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Mistake tags */}
              <MultiTagSelect
                label="Mistake Tags"
                options={mistakeTagOptions}
                selected={form.mistake_tag_ids}
                onChange={v => update('mistake_tag_ids', v)}
              />

              {/* Rules broken */}
              <MultiTagSelect
                label="Rules Broken"
                options={activeRules.map(r => ({ id: r.id, name: r.name, color: '#ef4444' }))}
                selected={form.rules_broken_ids}
                onChange={v => update('rules_broken_ids', v)}
              />
            </div>
          </div>

          {/* ── Section 4: Psychology ── */}
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <SectionHeader title="Psychology" />
            <div className="grid grid-cols-3 gap-6">
              <StarRating
                value={form.emotion_entry}
                onChange={v => update('emotion_entry', v)}
                label="Emotion at Entry"
              />
              <StarRating
                value={form.emotion_exit}
                onChange={v => update('emotion_exit', v)}
                label="Emotion at Exit"
              />
              <StarRating
                value={form.confidence}
                onChange={v => update('confidence', v)}
                label="Confidence"
              />
            </div>
          </div>

          {/* ── Section 5: Notes & Screenshot ── */}
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <SectionHeader title="Notes & Screenshot" />
            <div className="space-y-4">
              <div>
                <Label htmlFor="nt-notes">Trade Notes</Label>
                <textarea
                  id="nt-notes"
                  value={form.notes}
                  onChange={e => update('notes', e.target.value)}
                  placeholder="Why did you take this trade? What went well or wrong?"
                  rows={4}
                  className="input resize-none text-sm leading-relaxed"
                />
              </div>

              {/* Screenshot upload */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Chart Screenshots</Label>
                  <span className="text-xs text-text-muted">{screenshots.length}/{MAX_SCREENSHOTS}</span>
                </div>

                {/* Thumbnail grid */}
                {screenshots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {screenshots.map((src, idx) => (
                      <div key={idx} className="relative group aspect-video">
                        <img
                          src={src}
                          alt={`Screenshot ${idx + 1}`}
                          className="w-full h-full object-cover rounded-lg border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => removeScreenshot(idx)}
                          className="absolute top-1 right-1 bg-bg-secondary border border-border rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={11} className="text-text-secondary" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone — hide when at limit */}
                {screenshots.length < MAX_SCREENSHOTS && (
                  <div
                    onDrop={handleDrop}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-text-muted hover:bg-bg-hover'
                    }`}
                  >
                    <ImagePlus size={20} className="text-text-muted mx-auto mb-2" />
                    <p className="text-sm text-text-secondary">
                      Drop screenshots here or <span className="text-accent">browse</span>
                    </p>
                    <p className="text-xs text-text-muted mt-1">PNG, JPG, WebP · up to {MAX_SCREENSHOTS} images</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => { if (e.target.files) handleFiles(e.target.files) }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Submit ── */}
          <div className="flex justify-end gap-3 pb-6">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-6">
              {isEdit ? 'Update Trade' : 'Save Trade'}
            </button>
          </div>
        </div>

        {/* ── Right: Position Calculator ── */}
        <div className="w-72 flex-shrink-0">
          <PositionCalculator
            entryPrice={entryNum}
            stopPrice={stopNum}
            targetPrice={targetNum}
            direction={form.direction}
            onFillQuantity={fillQuantity}
          />
        </div>
      </div>
    </form>
  )
}
