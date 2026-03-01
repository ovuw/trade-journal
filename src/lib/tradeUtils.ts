import type { TradingSession } from '../types'

/**
 * Detect trading session from a datetime-local string (YYYY-MM-DDTHH:MM).
 * Times are local (no timezone conversion).
 */
export function detectSession(entryTime: string): TradingSession | undefined {
  const parts = entryTime.split('T')
  if (parts.length < 2) return undefined
  const [hStr, mStr] = parts[1].split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const mins = h * 60 + m
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return 'pre-market'
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return 'rth'
  if (mins >= 16 * 60 && mins <= 20 * 60) return 'after-hours'
  return undefined
}

/** Format the current datetime as a datetime-local input value (YYYY-MM-DDTHH:MM). */
export function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Calculate P&L for a trade (fees default to 0). Rounded to 2dp. */
export function calcPnl(
  direction: 'long' | 'short',
  entry: number,
  exit: number,
  qty: number,
  fees = 0
): number {
  const raw = direction === 'long'
    ? (exit - entry) * qty - fees
    : (entry - exit) * qty - fees
  return Math.round(raw * 100) / 100
}

/** Calculate result % relative to position cost. Returns 0 if entry is 0. Rounded to 2dp. */
export function calcResultPct(pnl: number, entry: number, qty: number): number {
  if (entry <= 0) return 0
  return Math.round((pnl / (entry * qty)) * 100 * 100) / 100
}

/**
 * Aggregate realized P&L across multiple exit lots. Fees are for the whole position.
 * Pass positionQty to prorate fees by the fraction of the position actually exited.
 * Rounded to 2dp.
 */
export function calcPartialPnl(
  direction: 'long' | 'short',
  entry: number,
  lots: { qty: number; price: number }[],
  fees = 0,
  positionQty?: number
): number {
  if (lots.length === 0) return 0
  const gross = lots.reduce((sum, lot) => {
    return sum + (direction === 'long'
      ? (lot.price - entry) * lot.qty
      : (entry - lot.price) * lot.qty)
  }, 0)
  const exitedQty = lots.reduce((s, l) => s + l.qty, 0)
  const proratedFees = positionQty && positionQty > 0
    ? fees * (exitedQty / positionQty)
    : fees
  return Math.round((gross - proratedFees) * 100) / 100
}

/** Sum of quantities across exit lots. */
export function calcRealizedQty(lots: { qty: number }[]): number {
  return lots.reduce((s, l) => s + l.qty, 0)
}

/** Weighted average exit price across lots. Returns null if no lots. Rounded to 4dp. */
export function calcWeightedAvgExit(lots: { qty: number; price: number }[]): number | null {
  if (lots.length === 0) return null
  const totalQty = lots.reduce((s, l) => s + l.qty, 0)
  if (totalQty === 0) return null
  return Math.round(lots.reduce((s, l) => s + l.price * l.qty, 0) / totalQty * 10000) / 10000
}
