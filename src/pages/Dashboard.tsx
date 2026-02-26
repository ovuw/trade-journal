import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { AlertTriangle, TrendingUp, TrendingDown, CheckSquare, Square } from 'lucide-react'
import { getTrades, getChecklistState, saveChecklistState, getRules } from '../lib/db'
import { Trade } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all' | 'custom'

interface Stats {
  netPnl: number
  winRate: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  maxDrawdown: number
  totalTrades: number
  wins: number
  losses: number
}

interface CurvePoint {
  label: string
  equity: number
}

interface CalDay {
  date: string
  day: number
  pnl: number
  count: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  'Check the news',
  'Review trading plan',
  'Analyze the market',
  'Spot entry and exit points',
  'Calculate risk-reward',
  'Set stop loss and take profit',
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getMondayOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return isoDate(new Date(d.getFullYear(), d.getMonth(), diff))
}

function filterTrades(
  trades: Trade[],
  period: Period,
  customStart: string,
  customEnd: string,
): Trade[] {
  const today = isoDate(new Date())
  if (period === 'today') return trades.filter(t => t.entry_time.slice(0, 10) === today)
  if (period === 'week') {
    const weekStart = getMondayOfWeek()
    return trades.filter(t => t.entry_time.slice(0, 10) >= weekStart)
  }
  if (period === 'month') {
    const monthStart = today.slice(0, 7) + '-01'
    return trades.filter(t => t.entry_time.slice(0, 10) >= monthStart)
  }
  if (period === 'custom') {
    if (!customStart) return trades
    const end = customEnd || today
    return trades.filter(t => {
      const d = t.entry_time.slice(0, 10)
      return d >= customStart && d <= end
    })
  }
  return trades // 'all'
}

function computeStats(trades: Trade[]): Stats {
  if (trades.length === 0) {
    return { netPnl: 0, winRate: 0, profitFactor: 0, avgWin: 0, avgLoss: 0, maxDrawdown: 0, totalTrades: 0, wins: 0, losses: 0 }
  }
  const winList = trades.filter(t => t.pnl > 0)
  const lossList = trades.filter(t => t.pnl <= 0)
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const winRate = (winList.length / trades.length) * 100
  const grossProfit = winList.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(lossList.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : winList.length > 0 ? 999 : 0
  const avgWin = winList.length > 0 ? grossProfit / winList.length : 0
  const avgLoss = lossList.length > 0 ? grossLoss / lossList.length : 0

  const sorted = [...trades].sort((a, b) => a.entry_time.localeCompare(b.entry_time))
  let peak = 0, running = 0, maxDD = 0
  for (const t of sorted) {
    running += t.pnl
    if (running > peak) peak = running
    const dd = peak - running
    if (dd > maxDD) maxDD = dd
  }

  return {
    netPnl,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    maxDrawdown: maxDD,
    totalTrades: trades.length,
    wins: winList.length,
    losses: lossList.length,
  }
}

function buildEquityCurve(trades: Trade[]): CurvePoint[] {
  const sorted = [...trades].sort((a, b) => a.entry_time.localeCompare(b.entry_time))
  let running = 0
  const points: CurvePoint[] = [{ label: 'Start', equity: 0 }]
  for (const t of sorted) {
    running = Math.round((running + t.pnl) * 100) / 100
    points.push({ label: t.entry_time.slice(5, 10), equity: running })
  }
  return points
}

function buildCalendarDays(year: number, month: number, trades: Trade[]): (CalDay | null)[] {
  const map = new Map<string, { pnl: number; count: number }>()
  for (const t of trades) {
    const day = t.entry_time.slice(0, 10)
    const cur = map.get(day) ?? { pnl: 0, count: 0 }
    map.set(day, { pnl: cur.pnl + t.pnl, count: cur.count + 1 })
  }
  const firstDay = new Date(year, month, 1)
  const lastDate = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7 // Mon = 0
  const days: (CalDay | null)[] = []
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= lastDate; d++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const data = map.get(date)
    days.push({ date, day: d, pnl: data?.pnl ?? 0, count: data?.count ?? 0 })
  }
  return days
}

function buildRuleViolations(trades: Trade[]) {
  const rules = getRules()
  const map = new Map<string, { count: number; cost: number }>()
  for (const t of trades) {
    for (const ruleId of (t.rules_broken_ids || [])) {
      const cur = map.get(ruleId) ?? { count: 0, cost: 0 }
      map.set(ruleId, { count: cur.count + 1, cost: cur.cost + t.pnl })
    }
  }
  return [...map.entries()]
    .map(([ruleId, data]) => ({
      ruleId,
      name: rules.find(r => r.id === ruleId)?.name ?? ruleId,
      count: data.count,
      cost: data.cost,
    }))
    .sort((a, b) => a.cost - b.cost) // most costly (most negative) first
}

function fmtPnl(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  color?: 'profit' | 'loss' | 'neutral'
}) {
  const valueClass =
    color === 'profit' ? 'text-profit' :
    color === 'loss' ? 'text-loss' :
    'text-text-primary'
  return (
    <div className="stat-card">
      <p className="text-text-muted text-xs uppercase tracking-wide mb-1.5">{label}</p>
      <p className={`text-xl font-mono font-semibold ${valueClass}`}>{value}</p>
      {sub && <p className="text-text-muted text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function EquityTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
      <span className={`font-mono font-semibold ${val >= 0 ? 'text-profit' : 'text-loss'}`}>
        {fmtPnl(val)}
      </span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const navigate = useNavigate()

  const today = isoDate(new Date())
  const now = new Date()

  const allTrades = useMemo(() => getTrades(), [])
  const filtered = useMemo(
    () => filterTrades(allTrades, period, customStart, customEnd),
    [allTrades, period, customStart, customEnd],
  )

  const stats = useMemo(() => computeStats(filtered), [filtered])
  const equityCurve = useMemo(() => buildEquityCurve(filtered), [filtered])
  const calDays = useMemo(
    () => buildCalendarDays(now.getFullYear(), now.getMonth(), filtered),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered],
  )
  const ruleViolations = useMemo(() => buildRuleViolations(filtered), [filtered])

  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => getChecklistState(today))

  const toggleCheck = (item: string) => {
    setChecklist(prev => {
      const next = { ...prev, [item]: !prev[item] }
      saveChecklistState(today, next)
      return next
    })
  }

  const sortedByPnl = useMemo(() => [...filtered].sort((a, b) => b.pnl - a.pnl), [filtered])
  const bestTrades = sortedByPnl.slice(0, 3)
  const worstTrades = [...sortedByPnl].reverse().slice(0, 3)

  const recentTrades = useMemo(
    () => [...allTrades].sort((a, b) => b.entry_time.localeCompare(a.entry_time)).slice(0, 5),
    [allTrades],
  )

  const topViolation = ruleViolations[0]

  const maxAbsPnl = useMemo(() => {
    let max = 0
    for (const d of calDays) {
      if (d && Math.abs(d.pnl) > max) max = Math.abs(d.pnl)
    }
    return max || 1
  }, [calDays])

  const checklistDone = CHECKLIST_ITEMS.filter(i => checklist[i]).length
  const equityIsPositive = stats.netPnl >= 0

  const profitFactorDisplay =
    stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)

  return (
    <div className="p-6 space-y-5">
      {/* ── Header + Period Selector ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary text-sm">Your trading performance at a glance</p>
        </div>
        <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p.key
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Custom Date Range ── */}
      {period === 'custom' && (
        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="input w-40"
          />
          <span className="text-text-muted text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="input w-40"
          />
        </div>
      )}

      {/* ── Rule Violation Alert ── */}
      {topViolation && topViolation.cost < -0.01 && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-loss shrink-0" />
          <p className="text-sm">
            <span className="font-semibold text-loss">Top violation: </span>
            <span className="text-text-primary">"{topViolation.name}"</span>
            {' '}broken{' '}
            <span className="font-semibold text-text-primary">{topViolation.count}×</span>
            {' '}this period — cost{' '}
            <span className="font-semibold text-loss">{fmtPnl(topViolation.cost)}</span>.{' '}
            <button
              onClick={() => navigate('/review')}
              className="text-accent hover:underline underline-offset-2 ml-1"
            >
              View Review →
            </button>
          </p>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-7 gap-3">
        <StatCard
          label="Net P/L"
          value={`$${Math.abs(stats.netPnl).toFixed(2)}`}
          color={stats.netPnl > 0 ? 'profit' : stats.netPnl < 0 ? 'loss' : 'neutral'}
          sub={stats.totalTrades > 0 ? (stats.netPnl >= 0 ? 'profit' : 'loss') : undefined}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          color={stats.winRate >= 50 ? 'profit' : stats.totalTrades > 0 ? 'loss' : 'neutral'}
          sub={stats.totalTrades > 0 ? `${stats.wins}W / ${stats.losses}L` : undefined}
        />
        <StatCard
          label="Profit Factor"
          value={profitFactorDisplay}
          color={
            stats.profitFactor >= 1.5 ? 'profit' :
            stats.profitFactor < 1 && stats.totalTrades > 0 ? 'loss' :
            'neutral'
          }
        />
        <StatCard
          label="Avg Win"
          value={`$${stats.avgWin.toFixed(2)}`}
          color={stats.avgWin > 0 ? 'profit' : 'neutral'}
        />
        <StatCard
          label="Avg Loss"
          value={`$${stats.avgLoss.toFixed(2)}`}
          color={stats.avgLoss > 0 ? 'loss' : 'neutral'}
        />
        <StatCard
          label="Max Drawdown"
          value={`$${stats.maxDrawdown.toFixed(2)}`}
          color={stats.maxDrawdown > 0 ? 'loss' : 'neutral'}
        />
        <StatCard
          label="Trades"
          value={stats.totalTrades.toString()}
        />
      </div>

      {/* ── Equity Curve ── */}
      <div className="bg-bg-card border border-border rounded-lg p-4">
        <h2 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-4">
          Equity Curve
        </h2>
        {equityCurve.length > 1 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={equityCurve} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={equityIsPositive ? '#00c896' : '#ff4d4d'}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor={equityIsPositive ? '#00c896' : '#ff4d4d'}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#484f58', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#484f58', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${v}`}
                width={62}
              />
              <ReferenceLine y={0} stroke="#30363d" strokeDasharray="4 4" />
              <RechartsTooltip
                content={<EquityTooltip />}
                cursor={{ stroke: '#484f58', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={equityIsPositive ? '#00c896' : '#ff4d4d'}
                strokeWidth={2}
                fill="url(#equityGrad)"
                dot={false}
                activeDot={{ r: 4, fill: equityIsPositive ? '#00c896' : '#ff4d4d' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-text-muted text-sm">No trades in this period</p>
          </div>
        )}
      </div>

      {/* ── Middle Row: Calendar + Checklist ── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Calendar Heatmap */}
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
            {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
          </h2>
          {/* Day of week headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW_LABELS.map(d => (
              <div key={d} className="text-center text-xs text-text-muted py-0.5">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} />
              const isToday = day.date === today
              const hasData = day.count > 0
              const intensity = hasData
                ? Math.min(0.85, 0.2 + (Math.abs(day.pnl) / maxAbsPnl) * 0.65)
                : 0
              const bg = hasData
                ? day.pnl > 0
                  ? `rgba(0, 200, 150, ${intensity})`
                  : `rgba(255, 77, 77, ${intensity})`
                : 'transparent'
              return (
                <div
                  key={day.date}
                  className={`relative aspect-square rounded flex items-center justify-center text-xs select-none
                    ${isToday ? 'ring-1 ring-accent ring-offset-1 ring-offset-bg-card' : ''}
                    ${hasData ? 'text-text-primary cursor-default' : 'text-text-muted'}
                  `}
                  style={{ background: bg }}
                  title={
                    hasData
                      ? `${day.date}: ${fmtPnl(day.pnl)} (${day.count} trade${day.count !== 1 ? 's' : ''})`
                      : day.date
                  }
                >
                  {day.day}
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ background: 'rgba(0,200,150,0.6)' }} />
              Profit
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ background: 'rgba(255,77,77,0.6)' }} />
              Loss
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded border border-accent" />
              Today
            </div>
          </div>
        </div>

        {/* Pre-Market Checklist */}
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Pre-Market Checklist
            </h2>
            <span className="text-xs text-text-muted">
              {checklistDone}/{CHECKLIST_ITEMS.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-bg-secondary rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-profit rounded-full transition-all duration-300"
              style={{ width: `${(checklistDone / CHECKLIST_ITEMS.length) * 100}%` }}
            />
          </div>
          <div className="space-y-1">
            {CHECKLIST_ITEMS.map(item => (
              <button
                key={item}
                onClick={() => toggleCheck(item)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-bg-hover transition-colors text-left"
              >
                {checklist[item] ? (
                  <CheckSquare size={15} className="text-profit shrink-0" />
                ) : (
                  <Square size={15} className="text-text-muted shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    checklist[item] ? 'text-text-muted line-through' : 'text-text-primary'
                  }`}
                >
                  {item}
                </span>
              </button>
            ))}
          </div>
          {checklistDone === CHECKLIST_ITEMS.length && (
            <p className="text-center text-profit text-sm font-medium mt-3">
              ✓ Ready to trade
            </p>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Best/Worst + Recent Trades ── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Best & Worst Trades */}
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
            Best & Worst Trades
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Best */}
            <div>
              <p className="text-xs text-profit font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
                <TrendingUp size={11} />
                Top Wins
              </p>
              {bestTrades.length > 0 ? (
                bestTrades.map(t => (
                  <div
                    key={t.id}
                    onClick={() => navigate('/trade-log')}
                    className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-bg-hover cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-text-primary">{t.ticker}</span>
                      <span className="text-xs text-text-muted ml-2">{t.entry_time.slice(0, 10)}</span>
                    </div>
                    <span className="text-sm font-mono text-profit ml-2 shrink-0">{fmtPnl(t.pnl)}</span>
                  </div>
                ))
              ) : (
                <p className="text-text-muted text-xs">No wins yet</p>
              )}
            </div>
            {/* Worst */}
            <div>
              <p className="text-xs text-loss font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
                <TrendingDown size={11} />
                Worst Losses
              </p>
              {worstTrades.filter(t => t.pnl < 0).length > 0 ? (
                worstTrades.filter(t => t.pnl < 0).map(t => (
                  <div
                    key={t.id}
                    onClick={() => navigate('/trade-log')}
                    className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-bg-hover cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-text-primary">{t.ticker}</span>
                      <span className="text-xs text-text-muted ml-2">{t.entry_time.slice(0, 10)}</span>
                    </div>
                    <span className="text-sm font-mono text-loss ml-2 shrink-0">{fmtPnl(t.pnl)}</span>
                  </div>
                ))
              ) : (
                <p className="text-text-muted text-xs">No losses yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Trades */}
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Recent Trades
            </h2>
            <button
              onClick={() => navigate('/trade-log')}
              className="text-xs text-accent hover:underline underline-offset-2"
            >
              View all →
            </button>
          </div>
          {recentTrades.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs border-b border-border">
                  <th className="text-left pb-2 font-medium">Ticker</th>
                  <th className="text-left pb-2 font-medium">Date</th>
                  <th className="text-left pb-2 font-medium">Dir</th>
                  <th className="text-right pb-2 font-medium">P/L</th>
                  <th className="text-right pb-2 font-medium">R</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => navigate('/trade-log')}
                    className="hover:bg-bg-hover cursor-pointer border-b border-border/50 last:border-0"
                  >
                    <td className="py-2 font-semibold text-text-primary">{t.ticker}</td>
                    <td className="py-2 text-text-muted">{t.entry_time.slice(0, 10)}</td>
                    <td className="py-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          t.direction === 'long'
                            ? 'bg-profit/15 text-profit'
                            : 'bg-loss/15 text-loss'
                        }`}
                      >
                        {t.direction === 'long' ? 'L' : 'S'}
                      </span>
                    </td>
                    <td
                      className={`py-2 text-right font-mono font-semibold ${
                        t.pnl >= 0 ? 'text-profit' : 'text-loss'
                      }`}
                    >
                      {fmtPnl(t.pnl)}
                    </td>
                    <td className="py-2 text-right text-text-muted font-mono text-xs">
                      {t.actual_r !== null
                        ? `${t.actual_r >= 0 ? '+' : ''}${t.actual_r.toFixed(2)}R`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-28 gap-2">
              <p className="text-text-muted text-sm">No trades logged yet.</p>
              <button
                onClick={() => navigate('/new-trade')}
                className="text-sm text-accent hover:underline underline-offset-2"
              >
                Log your first trade →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
