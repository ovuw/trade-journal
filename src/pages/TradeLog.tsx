import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Upload, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  Trash2, Pencil, Image, X, AlertTriangle, ChevronRight, ChevronDown as ExpandIcon,
  FileText,
} from 'lucide-react'
import { getTrades, deleteTrade, saveTrade, getScreenshots, deleteScreenshots } from '../lib/db'
import { getStorageScreenshotUrl } from '../lib/storage'
import { exportTradesToCsv, downloadCsv, CSV_TEMPLATE_EXAMPLE } from '../lib/csvExport'
import { parseCsv, type ParsedTrade } from '../lib/csvImport'
import {
  DEFAULT_SETUP_TAGS, DEFAULT_MISTAKE_TAGS, DEFAULT_RULES,
  type Trade, type Direction,
} from '../types'

const PAGE_SIZE = 25

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'ticker' | 'entry_time' | 'quantity' | 'entry_price' | 'exit_price' | 'pnl' | 'result_pct' | 'actual_r'

interface Filters {
  ticker: string
  dateFrom: string
  dateTo: string
  direction: 'all' | Direction
  setupTagId: string
  hasMistakes: 'all' | 'yes' | 'no'
  hasRulesBroken: 'all' | 'yes' | 'no'
}

const DEFAULT_FILTERS: Filters = {
  ticker: '', dateFrom: '', dateTo: '',
  direction: 'all', setupTagId: '',
  hasMistakes: 'all', hasRulesBroken: 'all',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2)
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function getSetupTag(id: string) { return DEFAULT_SETUP_TAGS.find(t => t.id === id) }
function getMistakeTags(ids: string[]) {
  return ids.map(id => DEFAULT_MISTAKE_TAGS.find(t => t.id === id)).filter((t): t is typeof DEFAULT_MISTAKE_TAGS[0] => Boolean(t))
}
function getRuleItems(ids: string[]) {
  return ids.map(id => DEFAULT_RULES.find(r => r.id === id)).filter((r): r is typeof DEFAULT_RULES[0] => Boolean(r))
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' } }) {
  if (sort.key !== col) return <ChevronsUpDown size={11} className="text-text-muted" />
  return sort.dir === 'asc'
    ? <ChevronUp size={11} className="text-accent" />
    : <ChevronDown size={11} className="text-accent" />
}

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ dir }: { dir: Direction }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold tracking-wide ${dir === 'long' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>
      {dir === 'long' ? 'LONG' : 'SHORT'}
    </span>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ trade, onConfirm, onCancel }: { trade: Trade; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-card border border-border rounded-xl p-6 w-96 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-loss/20 flex items-center justify-center flex-shrink-0">
            <Trash2 size={16} className="text-loss" />
          </div>
          <div>
            <p className="text-text-primary font-semibold">Delete trade?</p>
            <p className="text-text-secondary text-sm">{trade.ticker} · {fmtDate(trade.entry_time)}</p>
          </div>
        </div>
        <p className="text-text-secondary text-sm mb-5">This action cannot be undone.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button onClick={onConfirm} className="bg-loss text-white font-semibold px-4 py-2 rounded-md hover:opacity-90 text-sm">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [preview, setPreview] = useState<ParsedTrade[] | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [skipped, setSkipped] = useState(0)
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const text = await file.text()
    const result = parseCsv(text)
    setPreview(result.trades)
    setParseErrors(result.errors)
    setSkipped(result.skipped)
    setDetectedFormat(result.detectedFormat)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }

  const handleImport = () => {
    if (!preview || preview.length === 0) return
    preview.forEach(p => {
      const entry = p.entry_price, exit = p.exit_price, qty = p.quantity, fees = p.fees
      const pnl = p.direction === 'long' ? (exit - entry) * qty - fees : (entry - exit) * qty - fees
      const result_pct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0
      const stopDist = p.stop_price ? Math.abs(entry - p.stop_price) : null
      const planned_rr = stopDist && p.target_price ? Math.abs(p.target_price - entry) / stopDist : null
      const initial_risk = stopDist ? stopDist * qty : null
      const actual_r = initial_risk && initial_risk > 0 ? pnl / initial_risk : null
      saveTrade({
        ticker: p.ticker, direction: p.direction, asset_class: p.asset_class,
        entry_price: entry, exit_price: exit, quantity: qty, fees,
        stop_price: p.stop_price, target_price: p.target_price,
        planned_rr, actual_r,
        entry_time: p.entry_time, exit_time: p.exit_time,
        setup_tag_id: p.setup_tag_id,
        mistake_tag_ids: [], rules_broken_ids: [], rules_followed_ids: [],
        emotion_entry: 0, emotion_exit: 0, confidence: 0,
        notes: p.notes, pnl, result_pct, screenshot_id: null,
      })
    })
    onImported(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-text-primary">Import Trades</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-text-primary font-medium">Supported formats</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Tastytrade · TD Ameritrade · IBKR · or use the Trade Journal template
              </p>
            </div>
            <button
              onClick={() => downloadCsv('trade-journal-template.csv', CSV_TEMPLATE_EXAMPLE)}
              className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
            >
              <Download size={12} /> Template
            </button>
          </div>

          {detectedFormat && detectedFormat !== 'Unknown' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">Detected format:</span>
              <span className="text-xs font-medium text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full">
                {detectedFormat}
              </span>
            </div>
          )}

          {!preview && (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-text-muted'}`}
            >
              <Upload size={24} className="text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Drop CSV here or <span className="text-accent">browse</span></p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          )}

          {parseErrors.length > 0 && (
            <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-loss" /><span className="text-sm font-medium text-loss">{parseErrors.length} issue(s)</span></div>
              {parseErrors.map((e, i) => <p key={i} className="text-xs text-text-secondary pl-5">{e}</p>)}
            </div>
          )}

          {preview && preview.length > 0 && (
            <div>
              <p className="text-sm text-text-secondary mb-2">
                <span className="text-profit font-medium">{preview.length} trades</span> ready to import
                {skipped > 0 && <span className="text-warning ml-2">({skipped} rows skipped)</span>}
              </p>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-bg-secondary">
                    <tr>{['Ticker', 'Dir', 'Entry $', 'Exit $', 'Qty', 'Date'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-text-secondary font-medium">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((t, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 font-mono font-semibold text-text-primary">{t.ticker}</td>
                        <td className="px-3 py-2"><DirectionBadge dir={t.direction} /></td>
                        <td className="px-3 py-2 font-mono">${t.entry_price}</td>
                        <td className="px-3 py-2 font-mono">${t.exit_price}</td>
                        <td className="px-3 py-2 font-mono">{t.quantity}</td>
                        <td className="px-3 py-2 text-text-secondary">{fmtDate(t.entry_time)}</td>
                      </tr>
                    ))}
                    {preview.length > 5 && (
                      <tr className="border-t border-border">
                        <td colSpan={6} className="px-3 py-2 text-center text-text-muted">+{preview.length - 5} more rows</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button onClick={() => { setPreview(null); setParseErrors([]); setDetectedFormat(null) }} className="text-xs text-text-muted hover:text-text-secondary mt-2">
                ← Choose different file
              </button>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={handleImport}
            disabled={!preview || preview.length === 0}
            className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {preview?.length ?? 0} Trades
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({ trade, colSpan, onEdit, onDelete }: {
  trade: Trade; colSpan: number; onEdit: () => void; onDelete: () => void
}) {
  const multiScreenshots = getScreenshots(trade.id)
  const storageShot = trade.screenshot_id ? getStorageScreenshotUrl(trade.screenshot_id) : null
  const allScreenshots = storageShot
    ? [storageShot, ...multiScreenshots.filter(s => s !== storageShot)]
    : multiScreenshots
  const mistakeTags = getMistakeTags(trade.mistake_tag_ids)
  const rulesBroken = getRuleItems(trade.rules_broken_ids)

  return (
    <tr className="bg-bg-secondary border-b border-border">
      <td colSpan={colSpan} className="px-5 py-4">
        <div className="flex gap-6">
          {allScreenshots.length > 0 && (
            <div className="flex-shrink-0">
              <p className="text-xs text-text-secondary mb-1.5">
                Screenshot{allScreenshots.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-col gap-2">
                {allScreenshots.map((src, idx) => (
                  <img
                    key={idx}
                    src={src}
                    alt={`Chart ${idx + 1}`}
                    className="rounded-lg border border-border w-52 object-cover"
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-3">
            {trade.notes && (
              <div>
                <p className="text-xs text-text-secondary mb-1">Notes</p>
                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{trade.notes}</p>
              </div>
            )}
            <div className="flex gap-6 flex-wrap">
              {mistakeTags.length > 0 && (
                <div>
                  <p className="text-xs text-text-secondary mb-1.5">Mistake Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mistakeTags.map(t => (
                      <span key={t.id} className="px-2 py-0.5 rounded-full text-xs text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
                    ))}
                  </div>
                </div>
              )}
              {rulesBroken.length > 0 && (
                <div>
                  <p className="text-xs text-text-secondary mb-1.5">Rules Broken</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rulesBroken.map(r => (
                      <span key={r.id} className="px-2 py-0.5 rounded-full text-xs bg-loss/20 text-loss">{r.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-5 text-sm border-t border-border pt-2 flex-wrap">
              {trade.planned_rr != null && <span><span className="text-text-secondary text-xs">Planned R:R </span><span className="font-mono">{trade.planned_rr.toFixed(2)}:1</span></span>}
              {trade.actual_r != null && <span><span className="text-text-secondary text-xs">Actual R </span><span className={`font-mono ${trade.actual_r >= 0 ? 'text-profit' : 'text-loss'}`}>{trade.actual_r.toFixed(2)}R</span></span>}
              {trade.emotion_entry > 0 && <span><span className="text-text-secondary text-xs">Emotion entry→exit </span><span className="font-mono">{trade.emotion_entry}→{trade.emotion_exit}</span></span>}
              {trade.confidence > 0 && <span><span className="text-text-secondary text-xs">Confidence </span><span className="font-mono">{trade.confidence}/5</span></span>}
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button onClick={onEdit} className="flex items-center gap-1.5 text-xs text-accent hover:underline whitespace-nowrap"><Pencil size={12} /> Edit trade</button>
            <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-loss hover:underline whitespace-nowrap"><Trash2 size={12} /> Delete</button>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TradeLog() {
  const navigate = useNavigate()
  const [allTrades, setAllTrades] = useState(() => getTrades())
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'entry_time', dir: 'desc' })
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [filters, sort])

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)

  const filtered = useMemo(() => {
    let r = allTrades
    if (filters.ticker) r = r.filter(t => t.ticker.includes(filters.ticker.toUpperCase()))
    if (filters.dateFrom) r = r.filter(t => t.entry_time >= filters.dateFrom)
    if (filters.dateTo) r = r.filter(t => t.entry_time <= filters.dateTo + 'T23:59')
    if (filters.direction !== 'all') r = r.filter(t => t.direction === filters.direction)
    if (filters.setupTagId) r = r.filter(t => t.setup_tag_id === filters.setupTagId)
    if (filters.hasMistakes === 'yes') r = r.filter(t => t.mistake_tag_ids.length > 0)
    if (filters.hasMistakes === 'no') r = r.filter(t => t.mistake_tag_ids.length === 0)
    if (filters.hasRulesBroken === 'yes') r = r.filter(t => t.rules_broken_ids.length > 0)
    if (filters.hasRulesBroken === 'no') r = r.filter(t => t.rules_broken_ids.length === 0)
    return r
  }, [allTrades, filters])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a[sort.key] ?? -Infinity) as number | string
      const bv = (b[sort.key] ?? -Infinity) as number | string
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })

  const totalPnl = sorted.reduce((s, t) => s + t.pnl, 0)
  const winners = sorted.filter(t => t.pnl > 0).length
  const winRate = sorted.length > 0 ? (winners / sorted.length) * 100 : 0

  const handleDelete = () => {
    if (!deleteId) return
    deleteTrade(deleteId); deleteScreenshots(deleteId)
    setAllTrades(getTrades())
    if (expandedId === deleteId) setExpandedId(null)
    setDeleteId(null)
  }

  const tradeToDelete = deleteId ? allTrades.find(t => t.id === deleteId) : null
  const COL_SPAN = 13

  const Th = ({ label, sortKey, className = '' }: { label: string; sortKey?: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-left text-xs font-medium text-text-secondary whitespace-nowrap select-none ${sortKey ? 'cursor-pointer hover:text-text-primary' : ''} ${className}`}
      onClick={sortKey ? () => toggleSort(sortKey) : undefined}
    >
      <div className="flex items-center gap-1">{label}{sortKey && <SortIcon col={sortKey} sort={sort} />}</div>
    </th>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Trade Log</h1>
            <p className="text-text-secondary text-sm mt-0.5">
              {sorted.length} trade{sorted.length !== 1 ? 's' : ''}
              {sorted.length > 0 && <>
                <span className="mx-2 opacity-40">·</span>
                P/L: <span className={`font-medium ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt$(totalPnl)}</span>
                <span className="mx-2 opacity-40">·</span>
                Win rate: <span className="text-text-primary font-medium">{winRate.toFixed(0)}%</span>
              </>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`btn-secondary text-xs flex items-center gap-1.5 ${hasActiveFilters ? 'border-accent text-accent' : ''}`}
            >
              Filters {hasActiveFilters && <span className="bg-accent text-bg-primary rounded-full w-4 h-4 text-center leading-4 font-bold">!</span>}
            </button>
            <button onClick={() => setShowImport(true)} className="btn-secondary text-xs flex items-center gap-1.5">
              <Upload size={12} /> Import
            </button>
            <button
              onClick={() => downloadCsv(`trades-${new Date().toISOString().slice(0, 10)}.csv`, exportTradesToCsv(sorted))}
              disabled={sorted.length === 0}
              className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <Download size={12} /> Export
            </button>
            <button onClick={() => navigate('/new-trade')} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus size={14} /> New Trade
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="mt-4 p-4 bg-bg-secondary rounded-lg border border-border space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Ticker</label>
                <input type="text" value={filters.ticker} onChange={e => setFilter('ticker', e.target.value.toUpperCase())} placeholder="AAPL" className="input text-sm font-mono" maxLength={10} />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">From</label>
                <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">To</label>
                <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Direction</label>
                <select value={filters.direction} onChange={e => setFilter('direction', e.target.value as Filters['direction'])} className="input text-sm">
                  <option value="all">All</option>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Setup Tag</label>
                <select value={filters.setupTagId} onChange={e => setFilter('setupTagId', e.target.value)} className="input text-sm">
                  <option value="">All setups</option>
                  {DEFAULT_SETUP_TAGS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Mistakes</label>
                <select value={filters.hasMistakes} onChange={e => setFilter('hasMistakes', e.target.value as Filters['hasMistakes'])} className="input text-sm">
                  <option value="all">All</option>
                  <option value="yes">With mistakes</option>
                  <option value="no">Clean trades</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Rules Broken</label>
                <select value={filters.hasRulesBroken} onChange={e => setFilter('hasRulesBroken', e.target.value as Filters['hasRulesBroken'])} className="input text-sm">
                  <option value="all">All</option>
                  <option value="yes">Rules broken</option>
                  <option value="no">Rules followed</option>
                </select>
              </div>
              <div className="flex items-end">
                {hasActiveFilters && <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-secondary text-xs w-full">Clear all</button>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <FileText size={40} className="text-text-muted mb-4" />
            <p className="text-text-primary font-medium text-lg">
              {hasActiveFilters ? 'No trades match your filters' : 'No trades yet'}
            </p>
            <p className="text-text-secondary text-sm mt-1 mb-5">
              {hasActiveFilters ? 'Try adjusting or clearing your filters' : 'Log your first trade to get started'}
            </p>
            {!hasActiveFilters
              ? <button onClick={() => navigate('/new-trade')} className="btn-primary flex items-center gap-1.5"><Plus size={14} /> New Trade</button>
              : <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-secondary text-sm">Clear filters</button>}
          </div>
        ) : (
          <table className="w-full min-w-max border-collapse">
            <thead className="sticky top-0 bg-bg-secondary border-b border-border z-10">
              <tr>
                <th className="w-8 px-3 py-2.5" />
                <Th label="Ticker" sortKey="ticker" />
                <Th label="Date" sortKey="entry_time" />
                <Th label="Dir" />
                <Th label="Size" sortKey="quantity" />
                <Th label="Entry $" sortKey="entry_price" />
                <Th label="Exit $" sortKey="exit_price" />
                <Th label="P/L" sortKey="pnl" />
                <Th label="R" sortKey="actual_r" />
                <Th label="Setup" />
                <Th label="Mistakes" />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary select-none">Rules ⚠</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary select-none">Notes</th>
              </tr>
            </thead>
            <tbody>
              {paginated.flatMap(trade => {
                const isExpanded = expandedId === trade.id
                const setupTag = getSetupTag(trade.setup_tag_id)
                const mistakeTags = getMistakeTags(trade.mistake_tag_ids)
                const rulesBrokenCount = trade.rules_broken_ids.length
                const hasShot = getScreenshots(trade.id).length > 0 || !!trade.screenshot_id
                const isProfit = trade.pnl >= 0

                const mainRow = (
                  <tr
                    key={trade.id}
                    onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                    className={`border-b border-border cursor-pointer transition-colors hover:bg-bg-hover group ${isProfit ? 'border-l-2 border-l-profit/50' : 'border-l-2 border-l-loss/50'}`}
                  >
                    <td className="px-3 py-2.5 text-text-muted">
                      {isExpanded ? <ExpandIcon size={12} className="text-text-secondary" /> : <ChevronRight size={12} className="group-hover:text-text-secondary" />}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-text-primary text-sm">{trade.ticker}</span>
                        {hasShot && <Image size={10} className="text-text-muted" />}
                      </div>
                      <span className="text-xs text-text-muted capitalize">{trade.asset_class}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-text-primary">{fmtDate(trade.entry_time)}</div>
                      <div className="text-xs text-text-muted">{fmtTime(trade.entry_time)}</div>
                    </td>
                    <td className="px-3 py-2.5"><DirectionBadge dir={trade.direction} /></td>
                    <td className="px-3 py-2.5 font-mono text-sm text-text-primary">{trade.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-mono text-sm text-text-secondary">${trade.entry_price.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-mono text-sm text-text-secondary">${trade.exit_price.toFixed(2)}</td>
                    <td className="px-3 py-2.5">
                      <div className={`font-mono text-sm font-semibold ${isProfit ? 'text-profit' : 'text-loss'}`}>{fmt$(trade.pnl)}</div>
                      <div className={`text-xs font-mono ${isProfit ? 'text-profit/80' : 'text-loss/80'}`}>{trade.result_pct >= 0 ? '+' : ''}{trade.result_pct.toFixed(2)}%</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm">
                      {trade.actual_r != null
                        ? <span className={trade.actual_r >= 0 ? 'text-profit' : 'text-loss'}>{trade.actual_r >= 0 ? '+' : ''}{trade.actual_r.toFixed(1)}R</span>
                        : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {setupTag && (
                        <span className="px-2 py-0.5 rounded-full text-xs text-white font-medium" style={{ backgroundColor: setupTag.color }}>{setupTag.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {mistakeTags.length > 0 && (
                        <div className="flex items-center gap-1">
                          {mistakeTags.slice(0, 3).map(t => (
                            <span key={t.id} className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} title={t.name} />
                          ))}
                          {mistakeTags.length > 3 && <span className="text-xs text-text-muted">+{mistakeTags.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {rulesBrokenCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-loss/20 text-loss rounded text-xs font-semibold">⚠ {rulesBrokenCount}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-xs">
                      {trade.notes && <p className="text-xs text-text-secondary truncate">{trade.notes}</p>}
                    </td>
                  </tr>
                )

                if (!isExpanded) return [mainRow]
                return [
                  mainRow,
                  <ExpandedRow
                    key={`${trade.id}-exp`}
                    trade={trade}
                    colSpan={COL_SPAN}
                    onEdit={() => navigate(`/new-trade?id=${trade.id}`)}
                    onDelete={() => setDeleteId(trade.id)}
                  />,
                ]
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {sorted.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-shrink-0 bg-bg-secondary">
          <span className="text-xs text-text-secondary">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} trades
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-xs text-text-secondary">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages}
              className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {tradeToDelete && <DeleteConfirm trade={tradeToDelete} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={() => setAllTrades(getTrades())} />}
    </div>
  )
}
