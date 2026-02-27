import { useMemo, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { getTrades } from '../lib/db'
import type { Trade } from '../types'

// ─── Period filter ────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
]

function isoDate(d: Date) { return d.toISOString().split('T')[0] }

function getMondayOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return isoDate(new Date(d.getFullYear(), d.getMonth(), diff))
}

function filterByPeriod(trades: Trade[], period: Period): Trade[] {
  const today = isoDate(new Date())
  if (period === 'week') return trades.filter(t => t.entry_time.slice(0, 10) >= getMondayOfWeek())
  if (period === 'month') return trades.filter(t => t.entry_time.slice(0, 10) >= today.slice(0, 7) + '-01')
  return trades
}

// ─── Scenario logic ───────────────────────────────────────────────────────────

interface Scenario {
  id: string
  label: string
  description: string
  simulate: (trades: Trade[]) => Trade[]
}

function capLossAt(trades: Trade[], rMultiple: number): Trade[] {
  return trades.map(t => {
    if (t.pnl >= 0) return t
    const stopDist = t.stop_price ? Math.abs(t.entry_price - t.stop_price) : null
    if (!stopDist || stopDist === 0) return t
    const maxLoss = -(stopDist * t.quantity * rMultiple)
    if (t.pnl < maxLoss) {
      return { ...t, pnl: maxLoss }
    }
    return t
  })
}

function cutAllLossesAtStop(trades: Trade[]): Trade[] {
  return trades.map(t => {
    if (t.pnl >= 0) return t
    const stopDist = t.stop_price ? Math.abs(t.entry_price - t.stop_price) : null
    if (!stopDist) return t
    const stopLoss = -(stopDist * t.quantity)
    // Only improve trades worse than stop (simulate that stop was respected)
    if (t.pnl < stopLoss) return { ...t, pnl: stopLoss }
    return t
  })
}

function removeRuleBreakingTrades(trades: Trade[]): Trade[] {
  return trades.filter(t => (t.rules_broken_ids || []).length === 0)
}

function sizeUpWinners(trades: Trade[]): Trade[] {
  return trades.map(t => t.pnl > 0 ? { ...t, pnl: t.pnl * 2 } : t)
}

function tradeOnlyBestSetup(trades: Trade[]): Trade[] {
  if (trades.length === 0) return trades
  // Find the setup with the highest win rate (min 3 trades)
  const bySetup = new Map<string, Trade[]>()
  for (const t of trades) {
    if (!t.setup_tag_id) continue
    const arr = bySetup.get(t.setup_tag_id) ?? []
    arr.push(t)
    bySetup.set(t.setup_tag_id, arr)
  }
  let bestSetup = ''
  let bestEv = -Infinity
  for (const [id, ts] of bySetup) {
    if (ts.length < 3) continue
    const wins = ts.filter(t => t.pnl > 0)
    const losses = ts.filter(t => t.pnl < 0)
    const winRate = wins.length / ts.length
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) / losses.length : 0
    const ev = winRate * avgWin - (1 - winRate) * avgLoss
    if (ev > bestEv) { bestEv = ev; bestSetup = id }
  }
  if (!bestSetup) return trades
  return trades.filter(t => t.setup_tag_id === bestSetup)
}

const SCENARIOS: Scenario[] = [
  {
    id: 'cap-1r',
    label: 'Cap Losses at 1R',
    description: 'What if you always stopped out at exactly 1R (your initial stop distance)? Simulates perfect stop discipline.',
    simulate: (ts) => capLossAt(ts, 1),
  },
  {
    id: 'obey-stops',
    label: 'Obey Every Stop',
    description: 'What if every trade that exceeded your stop was exited exactly at the stop? Shows the cost of letting losers run past stops.',
    simulate: cutAllLossesAtStop,
  },
  {
    id: 'no-rule-breaks',
    label: 'Skip Rule-Breaking Trades',
    description: 'What if you had skipped every trade where you broke a rule? Shows the value of discipline.',
    simulate: removeRuleBreakingTrades,
  },
  {
    id: 'size-up-winners',
    label: '2× Size on Winners',
    description: 'What if you had doubled your position on every winning trade? Optimistic but shows the upside of conviction sizing.',
    simulate: sizeUpWinners,
  },
  {
    id: 'best-setup-only',
    label: 'Best Setup Only',
    description: 'What if you only traded your highest-EV setup (min 3 trades required)? Shows focus benefit.',
    simulate: tradeOnlyBestSetup,
  },
]

// ─── Stat helpers ─────────────────────────────────────────────────────────────

interface Stats {
  totalPnl: number
  winRate: number
  tradeCount: number
  profitFactor: number
  avgWin: number
  avgLoss: number
}

function computeStats(trades: Trade[]): Stats {
  if (trades.length === 0) return { totalPnl: 0, winRate: 0, tradeCount: 0, profitFactor: 0, avgWin: 0, avgLoss: 0 }
  const wins = trades.filter(t => t.pnl > 0)
  const losses = trades.filter(t => t.pnl < 0)
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const winRate = (wins.length / trades.length) * 100
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0
  const avgWin = wins.length > 0 ? grossWin / wins.length : 0
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0
  return { totalPnl, winRate, tradeCount: trades.length, profitFactor, avgWin, avgLoss }
}

function fmtPnl(n: number) {
  const abs = Math.abs(n).toFixed(2)
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Simulator() {
  const [period, setPeriod] = useState<Period>('all')
  const [activeScenario, setActiveScenario] = useState<string>(SCENARIOS[0].id)

  const allTrades = useMemo(() => getTrades(), [])
  const filtered = useMemo(() => filterByPeriod(allTrades, period), [allTrades, period])

  const scenario = SCENARIOS.find(s => s.id === activeScenario) ?? SCENARIOS[0]
  const simulated = useMemo(() => scenario.simulate(filtered), [scenario, filtered])

  const baseStats = useMemo(() => computeStats(filtered), [filtered])
  const simStats = useMemo(() => computeStats(simulated), [simulated])

  const pnlDiff = simStats.totalPnl - baseStats.totalPnl
  const winRateDiff = simStats.winRate - baseStats.winRate
  const pfDiff = simStats.profitFactor - baseStats.profitFactor
  const tradeCountDiff = simStats.tradeCount - baseStats.tradeCount

  function StatRow({
    label, base, sim, diff, format, higherIsBetter = true,
  }: {
    label: string
    base: number
    sim: number
    diff: number
    format: (n: number) => string
    higherIsBetter?: boolean
  }) {
    const improved = higherIsBetter ? diff > 0 : diff < 0
    const diffColor = Math.abs(diff) < 0.001 ? 'text-text-muted' : improved ? 'text-profit' : 'text-loss'
    return (
      <div className="grid grid-cols-[1fr_120px_120px_100px] gap-3 px-4 py-2.5 rounded-lg bg-bg-secondary text-sm items-center">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono text-text-primary text-right">{format(base)}</span>
        <span className={`font-mono font-semibold text-right ${sim > base && higherIsBetter ? 'text-profit' : sim < base && !higherIsBetter ? 'text-profit' : sim === base ? 'text-text-primary' : 'text-loss'}`}>
          {format(sim)}
        </span>
        <span className={`font-mono text-right text-xs ${diffColor}`}>
          {diff > 0 ? '+' : ''}{Math.abs(diff) < 0.001 ? '—' : format(diff)}
        </span>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical size={20} className="text-accent" />
            <h1 className="text-2xl font-semibold text-text-primary">P&L Simulator</h1>
          </div>
          <p className="text-text-secondary text-sm mt-0.5">
            Run what-if scenarios on your real trades — no data is modified
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p.key ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-text-muted">No trades in this period. Log some trades to use the simulator.</p>
        </div>
      ) : (
        <>
          {/* Scenario selector */}
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-3">Choose a Scenario</p>
            <div className="space-y-2">
              {SCENARIOS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveScenario(s.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    activeScenario === s.id
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                      activeScenario === s.id ? 'border-accent bg-accent' : 'border-border'
                    }`}>
                      {activeScenario === s.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-text-muted mt-0.5">{s.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Results comparison */}
          <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Results: {scenario.label}</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Showing {filtered.length} actual trades vs {simStats.tradeCount} simulated
              </p>
            </div>
            <div className="p-5 space-y-2">

              {/* Big P/L diff banner */}
              <div className={`rounded-lg p-4 mb-4 text-center border ${
                pnlDiff > 0 ? 'border-profit/30 bg-profit/8' : pnlDiff < 0 ? 'border-loss/30 bg-loss/8' : 'border-border bg-bg-secondary'
              }`}>
                <p className="text-xs text-text-muted mb-1 uppercase tracking-wide">Simulated P/L Change</p>
                <p className={`text-3xl font-black font-mono ${pnlDiff > 0 ? 'text-profit' : pnlDiff < 0 ? 'text-loss' : 'text-text-muted'}`}>
                  {pnlDiff === 0 ? 'No change' : fmtPnl(pnlDiff)}
                </p>
                {pnlDiff !== 0 && (
                  <p className="text-xs text-text-muted mt-1">
                    {pnlDiff > 0 ? 'This strategy would have improved' : 'This strategy would have reduced'} your P/L by {fmtPnl(Math.abs(pnlDiff))}
                  </p>
                )}
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[1fr_120px_120px_100px] gap-3 px-4 py-1.5 text-xs text-text-muted uppercase tracking-wide">
                <span>Metric</span>
                <span className="text-right">Actual</span>
                <span className="text-right">Simulated</span>
                <span className="text-right">Difference</span>
              </div>

              <StatRow
                label="Total P/L"
                base={baseStats.totalPnl}
                sim={simStats.totalPnl}
                diff={pnlDiff}
                format={fmtPnl}
              />
              <StatRow
                label="Trades"
                base={baseStats.tradeCount}
                sim={simStats.tradeCount}
                diff={tradeCountDiff}
                format={n => String(Math.round(n))}
              />
              <StatRow
                label="Win Rate"
                base={baseStats.winRate}
                sim={simStats.winRate}
                diff={winRateDiff}
                format={n => `${n.toFixed(1)}%`}
              />
              <StatRow
                label="Profit Factor"
                base={baseStats.profitFactor}
                sim={simStats.profitFactor}
                diff={pfDiff}
                format={n => n >= 999 ? '∞' : n.toFixed(2)}
              />
              <StatRow
                label="Avg Win"
                base={baseStats.avgWin}
                sim={simStats.avgWin}
                diff={simStats.avgWin - baseStats.avgWin}
                format={n => `$${n.toFixed(2)}`}
              />
              <StatRow
                label="Avg Loss"
                base={baseStats.avgLoss}
                sim={simStats.avgLoss}
                diff={simStats.avgLoss - baseStats.avgLoss}
                format={n => `$${n.toFixed(2)}`}
                higherIsBetter={false}
              />
            </div>
          </div>

          <p className="text-xs text-text-muted text-center pb-2">
            All simulations are hypothetical and do not modify your actual trade data.
          </p>
        </>
      )}
    </div>
  )
}
