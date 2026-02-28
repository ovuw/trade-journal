import { useState, useEffect, memo } from 'react'
import { Calculator, AlertTriangle, TrendingUp } from 'lucide-react'
import { getCalcSettings, saveCalcSettings } from '../lib/db'
import type { Direction } from '../types'

interface Props {
  entryPrice: number | null
  stopPrice: number | null
  targetPrice: number | null
  quantity: number | null
  direction: Direction
  onFillQuantity?: (qty: number) => void
  onFillStop?: (stop: number) => void
}

function PositionCalculator({
  entryPrice,
  stopPrice,
  targetPrice,
  quantity,
  direction,
  onFillQuantity,
  onFillStop,
}: Props) {
  const saved = getCalcSettings()
  const [accountBalance, setAccountBalance] = useState(String(saved.accountBalance ?? 10000))
  const [maxRiskPct, setMaxRiskPct] = useState(String(saved.maxRiskPct ?? 1))

  useEffect(() => {
    const balance = parseFloat(accountBalance)
    const riskPct = parseFloat(maxRiskPct)
    if (!isNaN(balance) && !isNaN(riskPct)) {
      saveCalcSettings({ accountBalance: balance, maxRiskPct: riskPct })
    }
  }, [accountBalance, maxRiskPct])

  const balance = parseFloat(accountBalance) || 0
  const riskPct = parseFloat(maxRiskPct) || 0

  // Core calculations
  const riskDollars = balance * (riskPct / 100)
  const stopDistance =
    entryPrice != null && stopPrice != null ? Math.abs(entryPrice - stopPrice) : null
  const maxShares =
    stopDistance && stopDistance > 0 ? Math.floor(riskDollars / stopDistance) : null
  const maxLoss = maxShares && stopDistance ? maxShares * stopDistance : null

  // R:R
  const plannedRR =
    entryPrice != null && stopPrice != null && targetPrice != null && stopDistance && stopDistance > 0
      ? Math.abs(targetPrice - entryPrice) / stopDistance
      : null

  // Implied stop: entry + quantity → what stop keeps risk within budget
  const impliedStopDistance =
    entryPrice != null && quantity != null && quantity > 0 && stopPrice == null
      ? riskDollars / quantity
      : null
  const impliedStop =
    impliedStopDistance != null && entryPrice != null
      ? direction === 'long'
        ? entryPrice - impliedStopDistance
        : entryPrice + impliedStopDistance
      : null

  // Validation
  const stopOnWrongSide =
    entryPrice != null &&
    stopPrice != null &&
    ((direction === 'long' && stopPrice >= entryPrice) ||
      (direction === 'short' && stopPrice <= entryPrice))

  const hasEntry = entryPrice != null

  return (
    <div className="sticky top-6 bg-bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Calculator size={14} className="text-text-secondary" />
        <span className="text-sm font-semibold text-text-primary">Position Calculator</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Settings */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">Account Balance</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
              <input
                type="number"
                value={accountBalance}
                onChange={e => setAccountBalance(e.target.value)}
                className="input pl-6 text-sm font-mono"
                placeholder="10000"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Max Risk per Trade</label>
            <div className="relative">
              <input
                type="number"
                value={maxRiskPct}
                onChange={e => setMaxRiskPct(e.target.value)}
                step="0.1"
                min="0.1"
                max="100"
                className="input pr-7 text-sm font-mono"
                placeholder="1.0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">%</span>
            </div>
          </div>
        </div>

        {/* Risk summary */}
        <div className="border-t border-border pt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Risk amount</span>
            <span className="text-text-primary font-mono font-medium">${riskDollars.toFixed(2)}</span>
          </div>
          {entryPrice != null && quantity != null && quantity > 0 && (
            <div className="flex justify-between">
              <span className="text-text-secondary">Position value</span>
              <span className="text-text-primary font-mono">${(entryPrice * quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {stopDistance != null ? (
            <>
              <div className="flex justify-between">
                <span className="text-text-secondary">Stop distance</span>
                <span className="text-text-primary font-mono">${stopDistance.toFixed(3)}/sh</span>
              </div>
              {entryPrice != null && entryPrice > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Stop %</span>
                  <span className="text-loss font-mono">{((stopDistance / entryPrice) * 100).toFixed(2)}% from entry</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-text-muted">
              {!hasEntry ? 'Enter entry price' : 'Enter stop price or quantity to calculate'}
            </p>
          )}
        </div>

        {/* Wrong side warning */}
        {stopOnWrongSide && (
          <div className="flex items-start gap-2 bg-loss/10 border border-loss/30 rounded-md p-2.5">
            <AlertTriangle size={13} className="text-loss mt-0.5 flex-shrink-0" />
            <p className="text-xs text-loss">
              Stop is above entry on a {direction} trade
            </p>
          </div>
        )}

        {/* Max position size */}
        {maxShares != null && !stopOnWrongSide && (
          <div className="border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">Max Position Size</p>
            <p className="text-4xl font-bold text-text-primary font-mono">
              {maxShares.toLocaleString()}
            </p>
            <p className="text-xs text-text-secondary mt-1">shares</p>
            {onFillQuantity && (
              <button
                type="button"
                onClick={() => onFillQuantity(maxShares)}
                className="mt-2 text-xs text-accent hover:underline"
              >
                Fill quantity ↗
              </button>
            )}
          </div>
        )}

        {/* Implied stop (reverse calc: entry + qty → stop) */}
        {impliedStop != null && (
          <div className="border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">Implied Stop Price</p>
            <p className="text-4xl font-bold text-text-primary font-mono">
              ${impliedStop.toFixed(2)}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {entryPrice != null && entryPrice > 0
                ? `${((Math.abs(impliedStop - entryPrice) / entryPrice) * 100).toFixed(2)}% from entry · within risk limit`
                : 'to stay within risk limit'}
            </p>
            {onFillStop && (
              <button
                type="button"
                onClick={() => onFillStop(parseFloat(impliedStop.toFixed(2)))}
                className="mt-2 text-xs text-accent hover:underline"
              >
                Apply stop ↗
              </button>
            )}
          </div>
        )}

        {/* Max loss */}
        {maxLoss != null && !stopOnWrongSide && (
          <div className="border border-loss/40 bg-loss/5 rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">Max Loss at Stop</p>
            <p className="text-2xl font-bold text-loss font-mono">
              -${maxLoss.toFixed(2)}
            </p>
          </div>
        )}

        {/* Planned R:R */}
        {plannedRR != null && (
          <div
            className={`border rounded-lg p-3 text-center ${
              plannedRR >= 2
                ? 'border-profit/40 bg-profit/5'
                : plannedRR >= 1
                ? 'border-warning/40 bg-warning/5'
                : 'border-loss/40 bg-loss/5'
            }`}
          >
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp size={12} className="text-text-secondary" />
              <p className="text-xs text-text-secondary uppercase tracking-wider">Planned R:R</p>
            </div>
            <p
              className={`text-2xl font-bold font-mono ${
                plannedRR >= 2 ? 'text-profit' : plannedRR >= 1 ? 'text-warning' : 'text-loss'
              }`}
            >
              {plannedRR.toFixed(2)} : 1
            </p>
            {plannedRR < 2 && (
              <p className={`text-xs mt-1 ${plannedRR < 1 ? 'text-loss' : 'text-warning'}`}>
                {plannedRR < 1 ? 'Negative expectancy' : 'Below 2:1 target'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(PositionCalculator)
