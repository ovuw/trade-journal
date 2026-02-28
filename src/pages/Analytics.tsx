import { useMemo } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Flame, TrendingUp, BarChart2 } from 'lucide-react'
import { getTrades, getSetupTags } from '../lib/db'
import { Trade, AssetClass } from '../types'
import { calcStreak, calcSetupBreakdown } from '../lib/analyticsUtils'

const DEFAULT_SETUP_TAGS = getSetupTags()

// ─── Period filter ────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all' | 'custom'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
]

function isoDate(d: Date) { return d.toISOString().split('T')[0] }

function getMondayOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return isoDate(new Date(d.getFullYear(), d.getMonth(), diff))
}

function filterTrades(trades: Trade[], period: Period, cs: string, ce: string): Trade[] {
  const today = isoDate(new Date())
  if (period === 'today') return trades.filter(t => t.entry_time.slice(0, 10) === today)
  if (period === 'week') return trades.filter(t => t.entry_time.slice(0, 10) >= getMondayOfWeek())
  if (period === 'month') return trades.filter(t => t.entry_time.slice(0, 10) >= today.slice(0, 7) + '-01')
  if (period === 'custom') {
    if (!cs) return trades
    const end = ce || today
    return trades.filter(t => { const d = t.entry_time.slice(0, 10); return d >= cs && d <= end })
  }
  return trades
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPnl(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

function pnlClass(n: number) { return n >= 0 ? 'text-profit' : 'text-loss' }

function getHour(entry_time: string): number {
  const t = entry_time.split('T')[1]
  return t ? parseInt(t.split(':')[0], 10) : 0
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface TickerBreakdown {
  ticker: string; count: number
  wins: number; winRate: number
  totalPnl: number; avgPnl: number
}

interface DirectionBreakdown {
  direction: 'long' | 'short'
  count: number; wins: number
  winRate: number; totalPnl: number; avgPnl: number
}

interface AssetBreakdown {
  assetClass: AssetClass
  count: number; wins: number
  winRate: number; totalPnl: number
}

interface DowPoint { day: string; totalPnl: number; count: number; winRate: number }
interface HourPoint { hour: number; label: string; totalPnl: number; count: number }
interface RBucket { label: string; count: number; profit: boolean }
// ─── Computation helpers ──────────────────────────────────────────────────────
// calcStreak and calcSetupBreakdown are imported from analyticsUtils

function computeTickerBreakdown(trades: Trade[]): TickerBreakdown[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const arr = map.get(t.ticker) ?? []
    arr.push(t)
    map.set(t.ticker, arr)
  }
  return [...map.entries()].map(([ticker, ts]) => {
    const wins = ts.filter(t => t.pnl > 0)
    return {
      ticker, count: ts.length, wins: wins.length,
      winRate: ts.length > 0 ? (wins.length / ts.length) * 100 : 0,
      totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
      avgPnl: ts.length > 0 ? ts.reduce((s, t) => s + t.pnl, 0) / ts.length : 0,
    }
  }).sort((a, b) => b.totalPnl - a.totalPnl)
}

function computeDirectionBreakdown(trades: Trade[]): DirectionBreakdown[] {
  return (['long', 'short'] as const).map(dir => {
    const ts = trades.filter(t => t.direction === dir)
    const wins = ts.filter(t => t.pnl > 0)
    return {
      direction: dir, count: ts.length, wins: wins.length,
      winRate: ts.length > 0 ? (wins.length / ts.length) * 100 : 0,
      totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
      avgPnl: ts.length > 0 ? ts.reduce((s, t) => s + t.pnl, 0) / ts.length : 0,
    }
  })
}

function computeAssetBreakdown(trades: Trade[]): AssetBreakdown[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const arr = map.get(t.asset_class) ?? []
    arr.push(t)
    map.set(t.asset_class, arr)
  }
  return [...map.entries()]
    .map(([ac, ts]) => {
      const wins = ts.filter(t => t.pnl > 0)
      return {
        assetClass: ac as AssetClass, count: ts.length, wins: wins.length,
        winRate: ts.length > 0 ? (wins.length / ts.length) * 100 : 0,
        totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
      }
    })
    .filter(a => a.count > 0)
    .sort((a, b) => b.totalPnl - a.totalPnl)
}

const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DOW_JS = [1, 2, 3, 4, 5] // getDay() values

function computeDow(trades: Trade[]): DowPoint[] {
  const map = new Map<string, { pnl: number; count: number; wins: number }>()
  DOW_ORDER.forEach(d => map.set(d, { pnl: 0, count: 0, wins: 0 }))
  for (const t of trades) {
    const idx = new Date(t.entry_time).getDay()
    if (!DOW_JS.includes(idx)) continue
    const day = DOW_ORDER[idx - 1]
    const cur = map.get(day)!
    map.set(day, { pnl: cur.pnl + t.pnl, count: cur.count + 1, wins: cur.wins + (t.pnl > 0 ? 1 : 0) })
  }
  return DOW_ORDER.map(day => {
    const d = map.get(day)!
    return { day, totalPnl: Math.round(d.pnl * 100) / 100, count: d.count, winRate: d.count > 0 ? (d.wins / d.count) * 100 : 0 }
  })
}

function computeTimeOfDay(trades: Trade[]): HourPoint[] {
  const map = new Map<number, { pnl: number; count: number }>()
  for (const t of trades) {
    const h = getHour(t.entry_time)
    const cur = map.get(h) ?? { pnl: 0, count: 0 }
    map.set(h, { pnl: cur.pnl + t.pnl, count: cur.count + 1 })
  }
  const results: HourPoint[] = []
  for (let h = 7; h <= 17; h++) {
    const d = map.get(h) ?? { pnl: 0, count: 0 }
    const pm = h >= 12
    const display = h <= 12 ? h : h - 12
    results.push({ hour: h, label: `${display}${pm ? 'pm' : 'am'}`, totalPnl: Math.round(d.pnl * 100) / 100, count: d.count })
  }
  return results
}

const R_BUCKETS: { min: number; max: number; label: string; profit: boolean }[] = [
  { min: -Infinity, max: -2, label: '<-2R', profit: false },
  { min: -2, max: -1, label: '-2R to -1R', profit: false },
  { min: -1, max: 0, label: '-1R to 0', profit: false },
  { min: 0, max: 1, label: '0 to 1R', profit: true },
  { min: 1, max: 2, label: '1R to 2R', profit: true },
  { min: 2, max: 3, label: '2R to 3R', profit: true },
  { min: 3, max: Infinity, label: '>3R', profit: true },
]

function computeRDistribution(trades: Trade[]): RBucket[] {
  const withR = trades.filter(t => t.actual_r !== null)
  return R_BUCKETS.map(b => ({
    label: b.label,
    count: withR.filter(t => t.actual_r! >= b.min && t.actual_r! < b.max).length,
    profit: b.profit,
  }))
}

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function PnlTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { count: number } }>; label?: string }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  const count = payload[0].payload.count
  return (
    <div className="bg-bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className={`font-mono font-semibold ${val >= 0 ? 'text-profit' : 'text-loss'}`}>{fmtPnl(val)}</p>
      {count > 0 && <p className="text-text-muted">{count} trade{count !== 1 ? 's' : ''}</p>}
    </div>
  )
}

function RTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="text-text-primary font-semibold">{payload[0].value} trade{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return <p className="text-text-muted text-sm text-center py-6">{message}</p>
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const navigate = useNavigate()
  const [period, setPeriod] = usePersistentState<Period>('tj_ui_analytics_period', 'month')
  const [customStart, setCustomStart] = usePersistentState('tj_ui_analytics_custom_start', '')
  const [customEnd, setCustomEnd] = usePersistentState('tj_ui_analytics_custom_end', '')

  const allTrades = useMemo(() => getTrades(), [])
  const filtered = useMemo(
    () => filterTrades(allTrades, period, customStart, customEnd),
    [allTrades, period, customStart, customEnd],
  )

  const setupBreakdown = useMemo(() => calcSetupBreakdown(filtered, DEFAULT_SETUP_TAGS), [filtered])
  const tickerBreakdown = useMemo(() => computeTickerBreakdown(filtered), [filtered])
  const dirBreakdown = useMemo(() => computeDirectionBreakdown(filtered), [filtered])
  const assetBreakdown = useMemo(() => computeAssetBreakdown(filtered), [filtered])
  const dowData = useMemo(() => computeDow(filtered), [filtered])
  const hourData = useMemo(() => computeTimeOfDay(filtered), [filtered])
  const rDist = useMemo(() => computeRDistribution(filtered), [filtered])
  const streaks = useMemo(() => calcStreak(allTrades), [allTrades]) // streaks always use all trades

  const hasData = filtered.length > 0

  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* ── Header + Period Selector ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
          <p className="text-text-secondary text-sm">Performance breakdowns to find your edge</p>
        </div>
        <div
          role="group"
          aria-label="Time period"
          className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1"
        >
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p.key ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex gap-3 items-center">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input w-40" />
          <span className="text-text-muted text-sm">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input w-40" />
        </div>
      )}

      {/* ── 8.7 Streak Tracker (all-time) ── */}
      {allTrades.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg px-5 py-4 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Flame size={16} className={streaks.currentStreakType === 'win' ? 'text-profit' : streaks.currentStreakType === 'loss' ? 'text-loss' : 'text-text-muted'} />
            <span className="text-xs text-text-muted uppercase tracking-wide mr-1">Current Streak</span>
            <span className={`text-lg font-mono font-bold ${streaks.currentStreakType === 'win' ? 'text-profit' : streaks.currentStreakType === 'loss' ? 'text-loss' : 'text-text-muted'}`}>
              {streaks.currentStreak}
            </span>
            <span className={`text-sm font-medium ml-1 ${streaks.currentStreakType === 'win' ? 'text-profit' : streaks.currentStreakType === 'loss' ? 'text-loss' : 'text-text-muted'}`}>
              {streaks.currentStreakType === 'win' ? 'wins' : streaks.currentStreakType === 'loss' ? 'losses' : '—'}
            </span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} className="text-profit" />
            <span className="text-xs text-text-muted">Best win streak:</span>
            <span className="text-sm font-mono font-semibold text-profit">{streaks.longestWin}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} className="text-loss rotate-180" />
            <span className="text-xs text-text-muted">Worst loss streak:</span>
            <span className="text-sm font-mono font-semibold text-loss">{streaks.longestLoss}</span>
          </div>
          <span className="text-xs text-text-muted ml-auto">Based on all-time trading history</span>
        </div>
      )}

      {!hasData ? (
        <div className="bg-bg-card border border-border rounded-lg p-10 flex flex-col items-center text-center">
          <BarChart2 size={36} className="text-text-muted mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-text-primary mb-1">No trades in this period</h2>
          <p className="text-text-secondary text-sm mb-5">
            Log trades to unlock performance breakdowns — setup edge, ticker performance, time-of-day analysis, and more.
          </p>
          <button
            onClick={() => navigate('/new-trade')}
            className="btn-primary text-sm"
          >
            Log a Trade →
          </button>
        </div>
      ) : (
        <>
          {/* ── 8.5 Direction + 8.6 Asset Class ── */}
          <div className="grid grid-cols-2 gap-5">
            {/* Direction */}
            <Section title="Long vs Short" sub="Performance by trade direction">
              <div className="grid grid-cols-2 gap-3">
                {dirBreakdown.map(d => (
                  <div key={d.direction} className={`rounded-lg p-4 border ${d.direction === 'long' ? 'border-profit/30 bg-profit/5' : 'border-loss/30 bg-loss/5'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${d.direction === 'long' ? 'text-profit' : 'text-loss'}`}>
                      {d.direction === 'long' ? '▲ Long' : '▼ Short'}
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-text-muted text-xs">Trades</span>
                        <span className="font-mono text-text-primary">{d.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted text-xs">Win Rate</span>
                        <span className={`font-mono ${d.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>{d.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted text-xs">Total P/L</span>
                        <span className={`font-mono font-semibold ${pnlClass(d.totalPnl)}`}>{fmtPnl(d.totalPnl)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted text-xs">Avg P/L</span>
                        <span className={`font-mono ${pnlClass(d.avgPnl)}`}>{fmtPnl(d.avgPnl)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Asset class */}
            <Section title="Asset Class" sub="Trades and P/L by instrument type">
              {assetBreakdown.length === 0 ? (
                <Empty message="No asset class data." />
              ) : (
                <div className="space-y-2">
                  {assetBreakdown.map(a => (
                    <div key={a.assetClass} className="flex items-center gap-3 px-3 py-2 bg-bg-secondary rounded-lg text-sm">
                      <span className="text-text-primary capitalize font-medium w-16">{a.assetClass}</span>
                      <span className="text-text-muted text-xs w-16">{a.count} trade{a.count !== 1 ? 's' : ''}</span>
                      <span className={`text-xs ${a.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                        {a.winRate.toFixed(1)}% WR
                      </span>
                      <span className={`font-mono font-semibold ml-auto ${pnlClass(a.totalPnl)}`}>
                        {fmtPnl(a.totalPnl)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* ── 8.1 + 8.8 Setup Tag Breakdown + EV ── */}
          <Section
            title="Setup Tag Breakdown"
            sub="Which setups have edge? Sorted by Expected Value (EV). EV = (Win% × Avg Win) − (Loss% × Avg Loss)"
          >
            {setupBreakdown.length === 0 ? (
              <Empty message="No trades with setup tags in this period." />
            ) : (
              <>
                <div className="grid grid-cols-[1fr_60px_80px_90px_90px_80px_90px] gap-2 px-3 py-1.5 text-xs text-text-muted uppercase tracking-wide">
                  <span>Setup</span>
                  <span className="text-right">Trades</span>
                  <span className="text-right">Win Rate</span>
                  <span className="text-right">Avg Win</span>
                  <span className="text-right">Avg Loss</span>
                  <span className="text-right">Avg R</span>
                  <span className="text-right">EV</span>
                </div>
                <div className="space-y-1">
                  {setupBreakdown.map((s, i) => (
                    <div
                      key={s.tagId}
                      className={`grid grid-cols-[1fr_60px_80px_90px_90px_80px_90px] gap-2 px-3 py-2.5 rounded-lg text-sm items-center ${
                        i === 0 ? 'bg-profit/8 border border-profit/20' : 'bg-bg-secondary'
                      }`}
                    >
                      <span className="text-text-primary font-medium flex items-center gap-1.5">
                        {i === 0 && <span className="text-xs text-profit font-bold">EDGE</span>}
                        {s.name}
                      </span>
                      <span className="text-right font-mono text-text-primary">{s.count}</span>
                      <span className={`text-right font-mono ${s.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                        {s.winRate.toFixed(1)}%
                      </span>
                      <span className="text-right font-mono text-profit">${s.avgWin.toFixed(2)}</span>
                      <span className="text-right font-mono text-loss">${s.avgLoss.toFixed(2)}</span>
                      <span className="text-right font-mono text-text-secondary">
                        {s.avgR !== null ? `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R` : '—'}
                      </span>
                      <span className={`text-right font-mono font-semibold ${pnlClass(s.ev)}`}>
                        {fmtPnl(s.ev)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-text-muted mt-2">
                  EV is per-trade expected value in dollars. Positive EV = statistical edge on this setup.
                </p>
              </>
            )}
          </Section>

          {/* ── 8.2 Ticker Breakdown ── */}
          <Section title="Ticker Breakdown" sub="Best and worst performing symbols">
            {tickerBreakdown.length === 0 ? (
              <Empty message="No ticker data in this period." />
            ) : (
              <>
                <div className="grid grid-cols-[1fr_60px_80px_100px_100px] gap-2 px-3 py-1.5 text-xs text-text-muted uppercase tracking-wide">
                  <span>Ticker</span>
                  <span className="text-right">Trades</span>
                  <span className="text-right">Win Rate</span>
                  <span className="text-right">Total P/L</span>
                  <span className="text-right">Avg P/L</span>
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {tickerBreakdown.map(t => (
                    <div
                      key={t.ticker}
                      className="grid grid-cols-[1fr_60px_80px_100px_100px] gap-2 px-3 py-2 rounded-lg bg-bg-secondary text-sm items-center"
                    >
                      <span className="font-mono font-semibold text-text-primary">{t.ticker}</span>
                      <span className="text-right font-mono text-text-primary">{t.count}</span>
                      <span className={`text-right font-mono ${t.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                        {t.winRate.toFixed(1)}%
                      </span>
                      <span className={`text-right font-mono font-semibold ${pnlClass(t.totalPnl)}`}>
                        {fmtPnl(t.totalPnl)}
                      </span>
                      <span className={`text-right font-mono ${pnlClass(t.avgPnl)}`}>
                        {fmtPnl(t.avgPnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* ── 8.4 Day of Week + 8.9 R Distribution ── */}
          <div className="grid grid-cols-2 gap-5">
            {/* Day of Week */}
            <Section title="Day of Week" sub="Total P/L by trading day">
              <div role="img" aria-label="P&L by day of week">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dowData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#4a5568', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#4a5568', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
                  <ReferenceLine y={0} stroke="#2a3347" />
                  <RechartsTooltip content={<PnlTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]}>
                    {dowData.map((entry, i) => (
                      <Cell key={i} fill={entry.totalPnl >= 0 ? '#10b981' : '#ef4444'} fillOpacity={entry.count > 0 ? 0.85 : 0.3} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </Section>

            {/* R-multiple distribution */}
            <Section title="R-Multiple Distribution" sub="Distribution of actual R across trades">
              {filtered.filter(t => t.actual_r !== null).length === 0 ? (
                <Empty message="No trades with R values yet. Add stop prices to trades to calculate R." />
              ) : (
                <div role="img" aria-label="Trade count by R-multiple">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={rDist} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#4a5568', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#4a5568', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <RechartsTooltip content={<RTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {rDist.map((entry, i) => (
                        <Cell key={i} fill={entry.profit ? '#10b981' : '#ef4444'} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              )}
            </Section>
          </div>

          {/* ── 8.3 Time of Day ── */}
          <Section title="Time of Day" sub="Total P/L by entry hour — shows which session hours are most profitable">
            <div role="img" aria-label="P&L by time of day">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#4a5568', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#4a5568', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={62} />
                <ReferenceLine y={0} stroke="#2a3347" />
                <RechartsTooltip content={<PnlTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="totalPnl" radius={[3, 3, 0, 0]}>
                  {hourData.map((entry, i) => (
                    <Cell key={i} fill={entry.totalPnl >= 0 ? '#10b981' : '#ef4444'} fillOpacity={entry.count > 0 ? 0.85 : 0.2} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
            <p className="text-xs text-text-muted mt-1">Based on entry time. Market open 9:30am, close 4pm.</p>
          </Section>

        </>
      )}
    </div>
  )
}
