/**
 * IBKR Flex Web Services integration.
 *
 * Two-step API:
 *   1. SendRequest → returns a reference code
 *   2. GetStatement (with ref code) → returns XML with ClosedLots
 *
 * HTTP calls go through a Rust Tauri command to avoid CORS.
 * XML is parsed in TypeScript using the browser-native DOMParser.
 */
import { invoke } from '@tauri-apps/api/core'
import { getTrades, saveTrade, updateTrade } from './db'
import { calcPartialPnl, calcResultPct, calcWeightedAvgExit, detectSession } from './tradeUtils'
import type { Trade, ExitLot } from '../types'

const SEND_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest'
const GET_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement'

// ── Low-level HTTP via Rust (bypasses CORS) ───────────────────────────────────

async function fetchUrl(url: string): Promise<string> {
  return invoke<string>('fetch_url', { url })
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function parseRefCode(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const status = doc.querySelector('Status')?.textContent ?? ''
  if (status !== 'Success') {
    const msg = doc.querySelector('ErrorMessage')?.textContent ?? 'Unknown error'
    throw new Error(`IBKR: ${msg}`)
  }
  const code = doc.querySelector('ReferenceCode')?.textContent
  if (!code) throw new Error('IBKR: no reference code in response')
  return code
}

/** Convert IBKR datetime (20240115;093045 or 20240115 093045) to datetime-local string. */
export function parseDateTime(ibkrDt: string): string {
  const s = ibkrDt.replace(';', ' ')
  const year = s.substring(0, 4)
  const month = s.substring(4, 6)
  const day = s.substring(6, 8)
  const hh = s.substring(9, 11)
  const mm = s.substring(11, 13)
  return `${year}-${month}-${day}T${hh}:${mm}`
}

/** Map IBKR assetCategory to app AssetClass. */
export function parseAssetClass(ibkrCategory: string): Trade['asset_class'] {
  const map: Record<string, Trade['asset_class']> = {
    STK: 'stock',
    OPT: 'option',
    FUT: 'futures',
    CASH: 'forex',
    CRYPTO: 'crypto',
  }
  return map[ibkrCategory.toUpperCase()] ?? 'stock'
}

interface ParsedLot {
  symbol: string
  assetCategory: string
  openDateTime: string
  closeDateTime: string
  costBasisPrice: number
  tradePrice: number
  quantity: number
  ibCommission: number
  transactionID: string
  buySell: string
}

/** Parse ClosedLot elements from a Flex statement XML. */
export function parseLots(xml: string): ParsedLot[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return Array.from(doc.querySelectorAll('ClosedLot')).map(lot => ({
    symbol: lot.getAttribute('symbol') ?? '',
    assetCategory: lot.getAttribute('assetCategory') ?? 'STK',
    openDateTime: lot.getAttribute('openDateTime') ?? '',
    closeDateTime: lot.getAttribute('dateTime') ?? '',
    costBasisPrice: parseFloat(lot.getAttribute('costBasisPrice') ?? '0'),
    tradePrice: parseFloat(lot.getAttribute('tradePrice') ?? '0'),
    quantity: Math.abs(parseFloat(lot.getAttribute('quantity') ?? '0')),
    ibCommission: Math.abs(parseFloat(lot.getAttribute('ibCommission') ?? '0')),
    transactionID: lot.getAttribute('transactionID') ?? '',
    buySell: lot.getAttribute('buySell') ?? 'SELL',
  }))
}

// ── Group lots by entry (symbol + openDateTime) ───────────────────────────────

/** Group lots by their common entry (same symbol + openDateTime = same position entry). */
export function groupLotsByEntry(lots: ParsedLot[]): Map<string, ParsedLot[]> {
  const grouped = new Map<string, ParsedLot[]>()
  for (const lot of lots) {
    const key = `${lot.symbol}::${lot.openDateTime}`
    const arr = grouped.get(key) ?? []
    arr.push(lot)
    grouped.set(key, arr)
  }
  return grouped
}

// ── Main sync function ────────────────────────────────────────────────────────

export interface IbkrSyncResult {
  imported: number
  updated: number
  skipped: number
}

export async function syncIbkr(flexToken: string, queryId: string): Promise<IbkrSyncResult> {
  // Step 1: Request statement generation
  const sendXml = await fetchUrl(`${SEND_URL}?t=${flexToken}&q=${queryId}&v=3`)
  const refCode = parseRefCode(sendXml)

  // Step 2: Wait for statement to be ready, then fetch
  await new Promise(resolve => setTimeout(resolve, 3000))
  const statementXml = await fetchUrl(`${GET_URL}?q=${refCode}&t=${flexToken}&v=3`)

  const lots = parseLots(statementXml)
  const existingTrades = getTrades()

  // Build lookup: ibkr_transaction_id → trade (handles both old single-lot and new grouped keys)
  const txIdMap = new Map<string, Trade>(
    existingTrades
      .filter(t => t.ibkr_transaction_id)
      .map(t => [t.ibkr_transaction_id!, t])
  )

  let imported = 0
  let updated = 0
  let skipped = 0

  const grouped = groupLotsByEntry(lots)

  for (const [groupKey, groupLots] of grouped) {
    if (!groupLots[0].symbol) { skipped += groupLots.length; continue }

    const firstLot = groupLots[0]
    const direction: Trade['direction'] = firstLot.buySell === 'BUY' ? 'short' : 'long'
    const entry = firstLot.costBasisPrice
    const totalQty = groupLots.reduce((s, l) => s + l.quantity, 0)
    const totalFees = groupLots.reduce((s, l) => s + l.ibCommission, 0)
    const entryTime = parseDateTime(firstLot.openDateTime)

    const exit_lots: ExitLot[] = groupLots.map(l => ({
      qty: l.quantity,
      price: l.tradePrice,
      time: parseDateTime(l.closeDateTime),
    }))

    const pnl = calcPartialPnl(direction, entry, exit_lots, totalFees)
    const result_pct = calcResultPct(pnl, entry, totalQty)
    const avgExit = calcWeightedAvgExit(exit_lots) ?? firstLot.tradePrice

    // Synthetic group key used for re-sync dedup
    const syntheticTxId = `IBKR::${groupKey}`

    // Check if any lot in this group matches an existing trade (handles pre-grouping imports)
    const existingFromGroupKey = txIdMap.get(syntheticTxId)
    const existingFromIndividualTx = groupLots
      .map(l => txIdMap.get(l.transactionID))
      .find(t => t !== undefined)
    const existing = existingFromGroupKey ?? existingFromIndividualTx

    if (existing) {
      updateTrade(existing.id, {
        entry_price: entry,
        exit_price: avgExit,
        quantity: totalQty,
        fees: totalFees,
        pnl,
        result_pct,
        entry_time: entryTime,
        exit_time: exit_lots[exit_lots.length - 1]?.time ?? entryTime,
        exit_lots,
        remaining_qty: 0,
        ibkr_transaction_id: syntheticTxId,
      })
      updated++
    } else {
      saveTrade({
        ticker: firstLot.symbol.toUpperCase(),
        direction,
        asset_class: parseAssetClass(firstLot.assetCategory),
        entry_price: entry,
        exit_price: avgExit,
        stop_price: null,
        target_price: null,
        quantity: totalQty,
        fees: totalFees,
        entry_time: entryTime,
        exit_time: exit_lots[exit_lots.length - 1]?.time ?? entryTime,
        pnl,
        result_pct,
        session: detectSession(entryTime),
        setup_tag_id: '',
        mistake_tag_ids: [],
        rules_broken_ids: [],
        rules_followed_ids: [],
        emotion_entry: 0,
        emotion_exit: 0,
        confidence: 0,
        notes: '',
        planned_rr: null,
        actual_r: null,
        screenshot_id: null,
        ibkr_transaction_id: syntheticTxId,
        exit_lots,
        remaining_qty: 0,
      })
      imported++
    }
  }

  return { imported, updated, skipped }
}
