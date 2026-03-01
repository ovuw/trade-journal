import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import {
  Plus, Upload, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  Trash2, Pencil, Image, X, AlertTriangle, ChevronRight, ChevronDown as ExpandIcon,
  FileText,
} from 'lucide-react'
import { getTrades, deleteTrade, deleteTrades, saveTrade, updateTrade, getScreenshots, deleteScreenshots, getSetupTags, getMistakeTags } from '../lib/db'
import { getStorageScreenshotUrl, deleteStorageScreenshot } from '../lib/storage'
import { exportTradesToCsv, downloadCsv, CSV_TEMPLATE_EXAMPLE } from '../lib/csvExport'
import { parseCsv, type ParsedTrade, type OrphanedSell } from '../lib/csvImport'
import {
  DEFAULT_RULES,
  type Trade, type Direction,
} from '../types'
import { calcPnl, calcResultPct, calcPartialPnl, calcWeightedAvgExit, nowLocal } from '../lib/tradeUtils'
import type { ExitLot } from '../types'

const SETUP_TAGS = getSetupTags()
const MISTAKE_TAGS = getMistakeTags()

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
function getSetupTag(id: string) { return SETUP_TAGS.find(t => t.id === id) }
function getTagsByIds(ids: string[]) {
  return ids.map(id => MISTAKE_TAGS.find(t => t.id === id)).filter((t): t is typeof MISTAKE_TAGS[0] => Boolean(t))
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

function dedupKey(ticker: string, entryTime: string, entryPrice: number, quantity: number): string {
  return `${ticker}|${entryTime.slice(0, 10)}|${entryPrice}|${quantity}`
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [preview, setPreview] = useState<ParsedTrade[] | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [skipped, setSkipped] = useState(0)
  const [duplicates, setDuplicates] = useState(0)
  const [orphanedSells, setOrphanedSells] = useState<OrphanedSell[]>([])
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const text = await file.text()
    const result = parseCsv(text)
    const existingKeys = new Set(
      getTrades().map(t => dedupKey(t.ticker, t.entry_time, t.entry_price, t.quantity))
    )
    const dupeCount = result.trades.filter(
      p => existingKeys.has(dedupKey(p.ticker, p.entry_time, p.entry_price, p.quantity))
    ).length
    setPreview(result.trades)
    setParseErrors(result.errors)
    setSkipped(result.skipped)
    setDuplicates(dupeCount)
    setOrphanedSells(result.orphanedSells)
    setDetectedFormat(result.detectedFormat)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }

  const handleImport = () => {
    if (!preview || preview.length === 0) return
    const existingKeys = new Set(
      getTrades().map(t => dedupKey(t.ticker, t.entry_time, t.entry_price, t.quantity))
    )
    const toImport = preview.filter(
      p => !existingKeys.has(dedupKey(p.ticker, p.entry_time, p.entry_price, p.quantity))
    )
    toImport.forEach(p => {
      const entry = p.entry_price
      const exit = p.exit_price
      const qty = p.quantity
      const fees = p.fees
      if (exit === null) {
        // Open position — no exit yet
        saveTrade({
          ticker: p.ticker, direction: p.direction, asset_class: p.asset_class,
          entry_price: entry, exit_price: null, quantity: qty, fees,
          stop_price: p.stop_price, target_price: p.target_price,
          planned_rr: null, actual_r: null,
          entry_time: p.entry_time, exit_time: null,
          setup_tag_id: p.setup_tag_id,
          mistake_tag_ids: [], rules_broken_ids: [], rules_followed_ids: [],
          emotion_entry: 0, emotion_exit: 0, confidence: 0,
          notes: p.notes, pnl: null, result_pct: null, screenshot_id: null,
          exit_lots: [], remaining_qty: qty,
        })
      } else {
        // Closed trade
        const pnl = calcPnl(p.direction, entry, exit, qty, fees)
        const result_pct = calcResultPct(pnl, entry, qty)
        const stopDist = p.stop_price ? Math.abs(entry - p.stop_price) : null
        const planned_rr = stopDist && p.target_price ? Math.abs(p.target_price - entry) / stopDist : null
        const initial_risk = stopDist ? stopDist * qty : null
        const actual_r = initial_risk && initial_risk > 0 ? pnl / initial_risk : null
        // Use per-lot exits from broker parsing if available, otherwise synthesise a single lot
        const exit_lots = p.exit_lots && p.exit_lots.length > 0
          ? p.exit_lots
          : [{ qty, price: exit, time: p.exit_time ?? p.entry_time }]
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
          exit_lots, remaining_qty: 0,
        })
      }
    })
    // Close open positions using orphaned sells (cross-file / cross-year positions).
    // Groups all sells per ticker and aggregates them to handle partial-lot closes.
    if (orphanedSells.length > 0) {
      const sellsByTicker = new Map<string, OrphanedSell[]>()
      for (const sell of orphanedSells) {
        const arr = sellsByTicker.get(sell.ticker) ?? []
        arr.push(sell)
        sellsByTicker.set(sell.ticker, arr)
      }

      for (const [ticker, sells] of sellsByTicker) {
        sells.sort((a, b) => a.datetime.localeCompare(b.datetime))

        const openTrades = getTrades()
          .filter(t => t.ticker === ticker && t.exit_price === null && t.direction === 'long')
          .sort((a, b) => a.entry_time.localeCompare(b.entry_time))

        let sellIdx = 0
        let sellRemaining = sells[0]?.qty ?? 0

        for (const openTrade of openTrades) {
          if (sellIdx >= sells.length) break

          let posRemaining = openTrade.quantity
          let exitValue = 0
          let exitFees = 0
          let lastDatetime = openTrade.entry_time

          while (posRemaining > 0 && sellIdx < sells.length) {
            const sell = sells[sellIdx]
            const usedQty = Math.min(posRemaining, sellRemaining)
            const ratio = usedQty / sell.qty
            exitValue += sell.price * usedQty
            exitFees += sell.fees * ratio
            lastDatetime = sell.datetime
            posRemaining -= usedQty
            sellRemaining -= usedQty
            if (sellRemaining <= 0) {
              sellIdx++
              sellRemaining = sells[sellIdx]?.qty ?? 0
            }
          }

          if (posRemaining <= 0) {
            const avgExitPrice = Math.round((exitValue / openTrade.quantity) * 10000) / 10000
            const totalFees = Math.round((openTrade.fees + exitFees) * 100) / 100
            const pnl = calcPnl('long', openTrade.entry_price, avgExitPrice, openTrade.quantity, totalFees)
            const result_pct = calcResultPct(pnl, openTrade.entry_price, openTrade.quantity)
            const closeLot = { qty: openTrade.quantity, price: avgExitPrice, time: lastDatetime }
            const updatedLots = [...(openTrade.exit_lots ?? []), closeLot]
            updateTrade(openTrade.id, {
              exit_price: avgExitPrice,
              exit_time: lastDatetime,
              fees: totalFees,
              pnl,
              result_pct,
              exit_lots: updatedLots,
              remaining_qty: 0,
            })
          }
        }
      }
    }
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
                <span className="text-profit font-medium">{preview.length - duplicates} new trades</span> ready to import
                {preview.filter(p => p.exit_price === null).length > 0 && <span className="text-accent ml-2">· {preview.filter(p => p.exit_price === null).length} open position{preview.filter(p => p.exit_price === null).length !== 1 ? 's' : ''}</span>}
                {orphanedSells.length > 0 && <span className="text-profit ml-2">· {orphanedSells.length} cross-file position{orphanedSells.length !== 1 ? 's' : ''} will close</span>}
                {duplicates > 0 && <span className="text-text-muted ml-2">· {duplicates} duplicate{duplicates !== 1 ? 's' : ''} skipped</span>}
                {skipped > 0 && <span className="text-warning ml-2">· {skipped} rows skipped</span>}
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
                        <td className="px-3 py-2 font-mono">{t.exit_price !== null ? `$${t.exit_price}` : <span className="text-accent text-xs font-semibold">OPEN</span>}</td>
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
              <button onClick={() => { setPreview(null); setParseErrors([]); setDetectedFormat(null); setDuplicates(0); setOrphanedSells([]) }} className="text-xs text-text-muted hover:text-text-secondary mt-2">
                ← Choose different file
              </button>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={handleImport}
            disabled={!preview || preview.length - duplicates === 0}
            className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {(preview?.length ?? 0) - duplicates} Trades
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({ trade, colSpan, onEdit, onDelete, onCloseTrade }: {
  trade: Trade; colSpan: number; onEdit: () => void; onDelete: () => void; onCloseTrade?: () => void
}) {
  const multiScreenshots = getScreenshots(trade.id)
  const storageShot = trade.screenshot_id ? getStorageScreenshotUrl(trade.screenshot_id) : null
  const allScreenshots = storageShot
    ? [storageShot, ...multiScreenshots.filter(s => s !== storageShot)]
    : multiScreenshots
  const mistakeTags = getTagsByIds(trade.mistake_tag_ids)
  const rulesBroken = getRuleItems(trade.rules_broken_ids)

  const remainingQty = trade.remaining_qty ?? trade.quantity
  const hasPartialExits = (trade.exit_lots?.length ?? 0) > 0

  const [showCloseForm, setShowCloseForm] = useState(false)
  const [closeExitPrice, setCloseExitPrice] = useState('')
  const [closeQtyStr, setCloseQtyStr] = useState(String(remainingQty))
  const [closeExitTime, setCloseExitTime] = useState(nowLocal())

  function handleClose() {
    const exitPrice = parseFloat(closeExitPrice)
    const closeQty = parseFloat(closeQtyStr)
    if (!exitPrice || isNaN(closeQty) || closeQty <= 0) return

    const newLot: ExitLot = { qty: closeQty, price: exitPrice, time: closeExitTime || nowLocal() }
    const updatedLots = [...(trade.exit_lots ?? []), newLot]
    const newRemainingQty = Math.max(0, remainingQty - closeQty)
    const isFullyClosed = newRemainingQty <= 0

    const pnl = isFullyClosed ? calcPartialPnl(trade.direction, trade.entry_price, updatedLots, trade.fees) : null
    const result_pct = pnl !== null ? calcResultPct(pnl, trade.entry_price, trade.quantity) : null
    const avgExit = isFullyClosed ? calcWeightedAvgExit(updatedLots) : null

    updateTrade(trade.id, {
      exit_lots: updatedLots,
      remaining_qty: newRemainingQty,
      exit_price: avgExit,
      exit_time: isFullyClosed ? (closeExitTime || nowLocal()) : null,
      pnl,
      result_pct,
    })
    onCloseTrade?.()
  }

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
            {/* Exit lots breakdown — shown when trade has partial or full exit lots */}
            {hasPartialExits && (
              <div>
                <p className="text-xs text-text-secondary mb-1.5">Exit Lots</p>
                <div className="space-y-1">
                  {trade.exit_lots!.map((lot, i) => {
                    const lotPnl = calcPnl(trade.direction, trade.entry_price, lot.price, lot.qty)
                    return (
                      <div key={i} className="flex items-center gap-3 text-xs font-mono text-text-secondary">
                        <span className="text-text-muted w-4">#{i + 1}</span>
                        <span className="text-text-primary">{lot.qty.toLocaleString()} sh</span>
                        <span>@ ${lot.price.toFixed(2)}</span>
                        <span className="text-text-muted">{lot.time.slice(0, 10)}</span>
                        <span className={lotPnl >= 0 ? 'text-profit' : 'text-loss'}>
                          {lotPnl >= 0 ? '+' : ''}${lotPnl.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {remainingQty > 0 && (
                  <p className="text-xs text-text-muted mt-1">{remainingQty.toLocaleString()} shares still open</p>
                )}
              </div>
            )}

            {/* Close Trade / Partial Close form — for positions with shares still open */}
            {trade.exit_price === null && (
              <div className="border-t border-border pt-3">
                {showCloseForm ? (
                  <div className="flex flex-wrap gap-2 items-end">
                    <div>
                      <label className="text-xs text-text-secondary block mb-1">Qty to close</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max={remainingQty}
                        value={closeQtyStr}
                        onChange={e => setCloseQtyStr(e.target.value)}
                        className="input font-mono text-sm w-24"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary block mb-1">Exit Price</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary text-xs" aria-hidden="true">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={closeExitPrice}
                          onChange={e => setCloseExitPrice(e.target.value)}
                          placeholder="0.00"
                          autoFocus
                          className="input pl-5 font-mono text-sm w-28"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary block mb-1">Exit Time</label>
                      <input
                        type="datetime-local"
                        value={closeExitTime}
                        onChange={e => setCloseExitTime(e.target.value)}
                        className="input text-sm w-44"
                      />
                    </div>
                    <button
                      onClick={handleClose}
                      disabled={!closeExitPrice || !closeQtyStr}
                      className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {parseFloat(closeQtyStr) >= remainingQty ? 'Close Position' : 'Record Partial Exit'}
                    </button>
                    <button
                      onClick={() => setShowCloseForm(false)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCloseForm(true)}
                    className="text-xs text-accent hover:underline underline-offset-2"
                  >
                    {hasPartialExits ? `Record exit for remaining ${remainingQty.toLocaleString()} shares →` : 'Close this position →'}
                  </button>
                )}
              </div>
            )}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (INPUT_TAGS.has(el.tagName)) return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TradeLog() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [allTrades, setAllTrades] = useState(() => getTrades())
  const [sort, setSort] = usePersistentState<{ key: SortKey; dir: 'asc' | 'desc' }>('tj_ui_tradelog_sort', { key: 'entry_time', dir: 'desc' })
  const [filters, setFilters] = usePersistentState<Filters>('tj_ui_tradelog_filters', DEFAULT_FILTERS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null)
  const undoTradeRef = useRef<(typeof allTrades)[0] | null>(null)
  const rowRefsMap = useRef<Map<string, HTMLTableRowElement>>(new Map())

  useEffect(() => { setPage(1); setFocusedRowIndex(null) }, [filters, sort])

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
    // Open positions always float to the top, sorted by entry_time desc
    const open = filtered
      .filter(t => t.exit_price === null)
      .sort((a, b) => b.entry_time.localeCompare(a.entry_time))
    const closed = filtered.filter(t => t.exit_price !== null).sort((a, b) => {
      const av = (a[sort.key] ?? -Infinity) as number | string
      const bv = (b[sort.key] ?? -Infinity) as number | string
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return [...open, ...closed]
  }, [filtered, sort])

  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })

  const { totalPnl, winRate, closedCount } = useMemo(() => {
    const closed = sorted.filter(t => t.pnl !== null)
    const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const winners = closed.filter(t => (t.pnl ?? 0) > 0).length
    const winRate = closed.length > 0 ? (winners / closed.length) * 100 : 0
    return { totalPnl, winRate, closedCount: closed.length }
  }, [sorted])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedRowIndex(prev => {
          if (prev === null) return 0
          return Math.min(prev + 1, paginated.length - 1)
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedRowIndex(prev => {
          if (prev === null) return 0
          return Math.max((prev ?? 0) - 1, 0)
        })
      } else if (e.key === 'Enter') {
        if (focusedRowIndex === null) return
        const trade = paginated[focusedRowIndex]
        if (trade) setExpandedId(prev => prev === trade.id ? null : trade.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedRowIndex, paginated])

  // Scroll focused row into view
  useEffect(() => {
    if (focusedRowIndex === null) return
    const trade = paginated[focusedRowIndex]
    if (!trade) return
    const el = rowRefsMap.current.get(trade.id)
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedRowIndex, paginated])

  const handleUndo = useCallback(() => {
    const t = undoTradeRef.current
    if (!t) return
    const { id: _id, created_at: _ca, updated_at: _ua, ...tradeData } = t
    saveTrade(tradeData)
    setAllTrades(getTrades())
    undoTradeRef.current = null
  }, [])

  const handleDelete = () => {
    if (!deleteId) return
    const trade = allTrades.find(t => t.id === deleteId)
    deleteTrade(deleteId); deleteScreenshots(deleteId)
    if (trade?.screenshot_id) void deleteStorageScreenshot(trade.screenshot_id)
    setAllTrades(getTrades())
    if (expandedId === deleteId) setExpandedId(null)
    setSelected(prev => { const n = new Set(prev); n.delete(deleteId); return n })
    setDeleteId(null)
    if (trade) {
      undoTradeRef.current = trade
      showToast('Trade deleted', 'info', { label: 'Undo', onClick: handleUndo })
    }
  }

  const handleBulkDelete = () => {
    const ids = [...selected]
    const trades = allTrades.filter(t => ids.includes(t.id))
    ids.forEach(id => deleteScreenshots(id))
    trades.forEach(t => { if (t.screenshot_id) void deleteStorageScreenshot(t.screenshot_id) })
    deleteTrades(ids)
    setAllTrades(getTrades())
    setSelected(new Set())
    setBulkDeleteConfirm(false)
    if (expandedId && ids.includes(expandedId)) setExpandedId(null)
  }

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const allPageSelected = paginated.length > 0 && paginated.every(t => selected.has(t.id))
  const somePageSelected = paginated.some(t => selected.has(t.id))

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(t => n.delete(t.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(t => n.add(t.id)); return n })
    }
  }

  const tradeToDelete = deleteId ? allTrades.find(t => t.id === deleteId) : null
  const COL_SPAN = 14

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
              {closedCount > 0 && <>
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
                  {SETUP_TAGS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2.5 bg-accent/5 border-b border-accent/20 flex-shrink-0">
          <span className="text-sm text-text-secondary font-medium">{selected.size} selected</span>
          {bulkDeleteConfirm ? (
            <>
              <span className="text-sm text-loss">Delete {selected.size} trade{selected.size !== 1 ? 's' : ''}?</span>
              <button onClick={handleBulkDelete} className="text-sm text-white bg-loss hover:bg-loss/80 rounded-md px-3 py-1 transition-colors font-medium">Confirm Delete</button>
              <button onClick={() => setBulkDeleteConfirm(false)} className="btn-secondary text-sm py-1 px-3">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setBulkDeleteConfirm(true)} className="flex items-center gap-1.5 text-sm text-loss border border-loss/30 hover:bg-loss/10 rounded-md px-3 py-1 transition-colors">
                <Trash2 size={13} /> Delete {selected.size}
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-text-muted hover:text-text-primary ml-auto">Clear selection</button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-bg-card border border-border flex items-center justify-center mb-5">
              <FileText size={28} className="text-text-muted" />
            </div>
            <p className="text-text-primary font-semibold text-lg">
              {hasActiveFilters ? 'No trades match your filters' : 'Your trade history lives here'}
            </p>
            <p className="text-text-secondary text-sm mt-1.5 mb-6 max-w-xs">
              {hasActiveFilters
                ? 'Try adjusting or clearing your filters to see more trades.'
                : 'Log your first trade to start tracking performance and building your edge.'}
            </p>
            {!hasActiveFilters
              ? <button onClick={() => navigate('/new-trade')} className="btn-primary flex items-center gap-1.5"><Plus size={14} /> Log a Trade</button>
              : <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-secondary text-sm">Clear Filters</button>}
          </div>
        ) : (
          <table className="w-full min-w-max border-collapse">
            <thead className="sticky top-0 bg-bg-secondary border-b border-border z-10">
              <tr>
                <th className="w-8 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected }}
                    onChange={toggleSelectAll}
                    className={`accent-accent cursor-pointer transition-opacity ${selected.size > 0 ? '' : 'opacity-30 hover:opacity-100'}`}
                  />
                </th>
                <th className="w-5 px-1 py-2.5" />
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
              {paginated.flatMap((trade, rowIdx) => {
                const isExpanded = expandedId === trade.id
                const isFocused = focusedRowIndex === rowIdx
                const setupTag = getSetupTag(trade.setup_tag_id)
                const mistakeTags = getTagsByIds(trade.mistake_tag_ids)
                const rulesBrokenCount = trade.rules_broken_ids.length
                const hasShot = getScreenshots(trade.id).length > 0 || !!trade.screenshot_id
                const isOpen = trade.exit_price === null
                const isProfit = !isOpen && trade.pnl !== null && trade.pnl >= 0
                const borderColorClass = isOpen ? 'border-l-accent/50' : isProfit ? 'border-l-profit/50' : 'border-l-loss/50'

                const mainRow = (
                  <tr
                    key={trade.id}
                    ref={el => {
                      if (el) rowRefsMap.current.set(trade.id, el)
                      else rowRefsMap.current.delete(trade.id)
                    }}
                    tabIndex={0}
                    onClick={() => { setExpandedId(isExpanded ? null : trade.id); setFocusedRowIndex(rowIdx) }}
                    onFocus={() => setFocusedRowIndex(rowIdx)}
                    className={`border-b border-border cursor-pointer transition-colors hover:bg-bg-hover group border-l-2 ${borderColorClass} ${isFocused ? 'ring-1 ring-inset ring-accent/50 bg-bg-hover' : ''}`}
                  >
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(trade.id)}
                        onChange={() => toggleSelect(trade.id)}
                        className={`accent-accent cursor-pointer transition-opacity ${selected.has(trade.id) ? '' : 'opacity-0 group-hover:opacity-100'}`}
                      />
                    </td>
                    <td className="px-1 py-2.5 text-text-muted">
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
                      <div className="text-xs text-text-muted flex items-center gap-1">
                        {fmtTime(trade.entry_time)}
                        {isOpen && (trade.exit_lots?.length ?? 0) > 0 && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide bg-warning/15 text-warning">
                            PARTIAL
                          </span>
                        )}
                        {isOpen && !(trade.exit_lots?.length) && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide bg-accent/15 text-accent">
                            OPEN
                          </span>
                        )}
                        {!isOpen && trade.session && (
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide ${
                            trade.session === 'pre-market' ? 'bg-warning/15 text-warning' :
                            trade.session === 'rth' ? 'bg-profit/15 text-profit' :
                            'bg-accent/15 text-accent'
                          }`}>
                            {trade.session === 'pre-market' ? 'PRE' : trade.session === 'rth' ? 'RTH' : 'AH'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><DirectionBadge dir={trade.direction} /></td>
                    <td className="px-3 py-2.5 font-mono text-sm text-text-primary">{trade.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-mono text-sm text-text-secondary">${trade.entry_price.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-mono text-sm text-text-secondary">
                      {trade.exit_price != null ? `$${trade.exit_price.toFixed(2)}` : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {trade.pnl !== null ? (
                        <>
                          <div className={`font-mono text-sm font-semibold ${isProfit ? 'text-profit' : 'text-loss'}`}>{fmt$(trade.pnl)}</div>
                          <div className={`text-xs font-mono ${isProfit ? 'text-profit/80' : 'text-loss/80'}`}>{(trade.result_pct ?? 0) >= 0 ? '+' : ''}{(trade.result_pct ?? 0).toFixed(2)}%</div>
                        </>
                      ) : (
                        <span className="text-text-muted font-mono text-sm">—</span>
                      )}
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
                    onCloseTrade={() => { setAllTrades(getTrades()); setExpandedId(null) }}
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
              onClick={() => { setPage(p => p - 1); setFocusedRowIndex(null) }}
              disabled={page === 1}
              className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-xs text-text-secondary">Page {page} of {totalPages}</span>
            <button
              onClick={() => { setPage(p => p + 1); setFocusedRowIndex(null) }}
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
