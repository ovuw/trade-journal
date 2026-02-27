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
import { AlertTriangle, TrendingUp, TrendingDown, CheckSquare, Square, Plus } from 'lucide-react'
import { getTrades, getChecklistState, saveChecklistState, getRules, getChecklistItems } from '../lib/db'
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

const PROFIT_COLOR = '#10b981'
const LOSS_COLOR = '#ef4444'
const GRID_COLOR = '#2a3347'
const TICK_COLOR = '#4a5568'

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
    .sort((a, b) => a.cost - b.cost)
}

function fmtPnl(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  const borderClass =
    color === 'profit' ? 'border-l-profit' :
    color === 'loss' ? 'border-l-loss' :
    'border-l-border'
  return (
    <div className={`stat-card border-l-2 ${borderClass}`}>
      <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-mono font-bold leading-none ${valueClass}`}>{value}</p>
      {sub && <p className="text-text-muted text-xs mt-1.5">{sub}</p>}
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
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-sm shadow-card">
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

  const checklistItems = useMemo(() => getChecklistItems().filter(i => i.is_active), [])
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

  const checklistDone = checklistItems.filter(i => checklist[i.id]).length
  const checklistPct = checklistItems.length > 0 ? (checklistDone / checklistItems.length) * 100 : 0
  const equityIsPositive = stats.netPnl >= 0

  const profitFactorDisplay =
    stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)

  const periodLabel = useMemo(() => {
    if (period === 'today') return "Today's performance"
    if (period === 'week') return "This week's performance"
    if (period === 'month') return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`
    if (period === 'custom') return customStart ? `${customStart} — ${customEnd || 'present'}` : 'Custom range'
    return 'All-time performance'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customStart, customEnd])

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-text-muted text-sm mt-0.5">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  period === p.key
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/new-trade')}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus size={14} /> New Trade
          </button>
        </div>
      </div>

      {/* ── Custom Date Range ── */}
      {period === 'custom' && (
        <div className="flex gap-3 items-center">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input w-40 text-sm" />
          <span className="text-text-muted text-sm">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input w-40 text-sm" />
        </div>
      )}

      {/* ── Rule Violation Alert ── */}
      {topViolation && topViolation.cost < -0.01 && (
        <div className="bg-loss/8 border border-loss/25 rounded-xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-loss/15 flex items-center justify-center shrink-0">
            <AlertTriangle size={14} className="text-loss" />
          </div>
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
          value={fmtPnl(stats.netPnl)}
          color={stats.netPnl > 0 ? 'profit' : stats.netPnl < 0 ? 'loss' : 'neutral'}
          sub={stats.totalTrades > 0 ? `${stats.totalTrades} trade${stats.totalTrades !== 1 ? 's' : ''}` : undefined}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          color={stats.winRate >= 50 ? 'profit' : stats.totalTrades > 0 ? 'loss' : 'neutral'}
          sub={stats.totalTrades > 0 ? `${stats.wins}W · ${stats.losses}L` : undefined}
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
      <div className="bg-bg-card border border-border rounded-xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-secondary">Equity Curve</h2>
          {stats.totalTrades > 0 && (
            <span className={`text-lg font-mono font-bold ${equityIsPositive ? 'text-profit' : 'text-loss'}`}>
              {fmtPnl(stats.netPnl)}
            </span>
          )}
        </div>
        {equityCurve.length > 1 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={equityCurve} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={equityIsPositive ? PROFIT_COLOR : LOSS_COLOR} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={equityIsPositive ? PROFIT_COLOR : LOSS_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: TICK_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: TICK_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${v}`}
                width={62}
              />
              <ReferenceLine y={0} stroke={GRID_COLOR} strokeDasharray="4 4" />
              <RechartsTooltip
                content={<EquityTooltip />}
                cursor={{ stroke: TICK_COLOR, strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={equityIsPositive ? PROFIT_COLOR : LOSS_COLOR}
                strokeWidth={2}
                fill="url(#equityGrad)"
                dot={false}
                activeDot={{ r: 4, fill: equityIsPositive ? PROFIT_COLOR : LOSS_COLOR }}
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
        <div className="bg-bg-card border border-border rounded-xl p-5 shadow-card">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">
            {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
          </h2>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-text-muted py-0.5 uppercase tracking-wide">{d}</div>
            ))}
          </div>
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
                  ? `rgba(16, 185, 129, ${intensity})`
                  : `rgba(239, 68, 68, ${intensity})`
                : 'transparent'
              return (
                <div
                  key={day.date}
                  className={`relative aspect-square rounded-md flex items-center justify-center text-xs select-none
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
          <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(16,185,129,0.65)' }} />
              Profit
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(239,68,68,0.65)' }} />
              Loss
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm border border-accent" />
              Today
            </div>
          </div>
        </div>

        {/* Pre-Market Checklist */}
        <div className="bg-bg-card border border-border rounded-xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-text-secondary">Pre-Market Checklist</h2>
            <span className={`text-xs font-medium tabular-nums ${checklistPct === 100 ? 'text-profit' : 'text-text-muted'}`}>
              {checklistDone}/{checklistItems.length}
            </span>
          </div>
          <div className="h-1 bg-bg-secondary rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-profit rounded-full transition-all duration-300"
              style={{ width: `${checklistPct}%` }}
            />
          </div>
          {checklistItems.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-4">No checklist items configured</p>
          ) : (
            <div className="space-y-0.5">
              {checklistItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-bg-hover transition-colors text-left"
                >
                  {checklist[item.id] ? (
                    <CheckSquare size={15} className="text-profit shrink-0" />
                  ) : (
                    <Square size={15} className="text-text-muted shrink-0" />
                  )}
                  <span className={`text-sm ${checklist[item.id] ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          )}
          {checklistDone === checklistItems.length && checklistItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border text-center">
              <p className="text-profit text-sm font-medium">Ready to trade</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Best/Worst + Recent Trades ── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Best & Worst Trades */}
        <div className="bg-bg-card border border-border rounded-xl p-5 shadow-card">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Best & Worst Trades</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Best */}
            <div>
              <p className="text-[11px] font-semibold text-profit uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingUp size={11} /> Top Wins
              </p>
              {bestTrades.filter(t => t.pnl > 0).length > 0 ? (
                bestTrades.filter(t => t.pnl > 0).map(t => (
                  <div
                    key={t.id}
                    onClick={() => navigate('/trade-log')}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-bg-hover cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-text-primary">{t.ticker}</span>
                      <span className="text-xs text-text-muted ml-2">{fmtDate(t.entry_time)}</span>
                    </div>
                    <span className="text-sm font-mono text-profit ml-2 shrink-0">{fmtPnl(t.pnl)}</span>
                  </div>
                ))
              ) : (
                <p className="text-text-muted text-xs px-2">No wins yet</p>
              )}
            </div>
            {/* Worst */}
            <div>
              <p className="text-[11px] font-semibold text-loss uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingDown size={11} /> Worst Losses
              </p>
              {worstTrades.filter(t => t.pnl < 0).length > 0 ? (
                worstTrades.filter(t => t.pnl < 0).map(t => (
                  <div
                    key={t.id}
                    onClick={() => navigate('/trade-log')}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-bg-hover cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-text-primary">{t.ticker}</span>
                      <span className="text-xs text-text-muted ml-2">{fmtDate(t.entry_time)}</span>
                    </div>
                    <span className="text-sm font-mono text-loss ml-2 shrink-0">{fmtPnl(t.pnl)}</span>
                  </div>
                ))
              ) : (
                <p className="text-text-muted text-xs px-2">No losses yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Trades */}
        <div className="bg-bg-card border border-border rounded-xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-secondary">Recent Trades</h2>
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
                <tr className="text-[11px] text-text-muted uppercase tracking-wider border-b border-border">
                  <th className="text-left pb-2.5 font-medium">Ticker</th>
                  <th className="text-left pb-2.5 font-medium">Date</th>
                  <th className="text-left pb-2.5 font-medium">Dir</th>
                  <th className="text-right pb-2.5 font-medium">P/L</th>
                  <th className="text-right pb-2.5 font-medium">R</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => navigate('/trade-log')}
                    className="hover:bg-bg-hover cursor-pointer border-b border-border/40 last:border-0 transition-colors"
                  >
                    <td className="py-2.5 font-semibold text-text-primary">{t.ticker}</td>
                    <td className="py-2.5 text-text-muted text-xs">{fmtDate(t.entry_time)}</td>
                    <td className="py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                        t.direction === 'long' ? 'bg-profit/12 text-profit' : 'bg-loss/12 text-loss'
                      }`}>
                        {t.direction === 'long' ? 'L' : 'S'}
                      </span>
                    </td>
                    <td className={`py-2.5 text-right font-mono font-semibold text-sm ${t.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {fmtPnl(t.pnl)}
                    </td>
                    <td className="py-2.5 text-right text-text-muted font-mono text-xs">
                      {t.actual_r !== null ? `${t.actual_r >= 0 ? '+' : ''}${t.actual_r.toFixed(2)}R` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-28 gap-2">
              <p className="text-text-muted text-sm">No trades logged yet</p>
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
