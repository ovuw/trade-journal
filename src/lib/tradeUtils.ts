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

/** Calculate P&L for a trade (fees default to 0). */
export function calcPnl(
  direction: 'long' | 'short',
  entry: number,
  exit: number,
  qty: number,
  fees = 0
): number {
  return direction === 'long'
    ? (exit - entry) * qty - fees
    : (entry - exit) * qty - fees
}

/** Calculate result % relative to position cost. Returns 0 if entry is 0. */
export function calcResultPct(pnl: number, entry: number, qty: number): number {
  return entry > 0 ? (pnl / (entry * qty)) * 100 : 0
}
