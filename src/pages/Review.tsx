import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { AlertTriangle, ChevronDown, ChevronRight, TrendingDown, Zap, ClipboardCheck, Trophy } from 'lucide-react'
import { getTrades, getRules, getChecklistState, getChecklistItems, getMistakeTags } from '../lib/db'
import { Rule, Trade } from '../types'

const DEFAULT_MISTAKE_TAGS = getMistakeTags()

// ─── Period filter (mirrors Dashboard) ────────────────────────────────────────

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

function filterTrades(trades: Trade[], period: Period, customStart: string, customEnd: string): Trade[] {
  const today = isoDate(new Date())
  if (period === 'today') return trades.filter(t => t.entry_time.slice(0, 10) === today)
  if (period === 'week') return trades.filter(t => t.entry_time.slice(0, 10) >= getMondayOfWeek())
  if (period === 'month') return trades.filter(t => t.entry_time.slice(0, 10) >= today.slice(0, 7) + '-01')
  if (period === 'custom') {
    if (!customStart) return trades
    const end = customEnd || today
    return trades.filter(t => { const d = t.entry_time.slice(0, 10); return d >= customStart && d <= end })
  }
  return trades
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPnl(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

function pnlClass(n: number) { return n >= 0 ? 'text-profit' : 'text-loss' }

// ─── Data types ───────────────────────────────────────────────────────────────

interface RuleStat {
  ruleId: string
  name: string
  timesBroken: number
  totalCost: number
  costOnLosers: number
  costOnWinners: number
  violationRate: number
  trades: Trade[]
}

interface WinLossRule {
  ruleId: string
  name: string
  rateOnWins: number
  rateOnLosses: number
  diff: number
}

interface MistakeStat {
  tagId: string
  name: string
  color: string
  count: number
  totalCost: number
  avgCost: number
}

interface WeekPoint {
  label: string
  total: number
  violated: number
  rate: number
}

interface EmotionPoint {
  x: number
  y: number
  ticker: string
  emotion: number
}

interface ChecklistGroup {
  label: string
  dayCount: number
  tradeCount: number
  totalPnl: number
  avgPnl: number
  winRate: number
  wins: number
}

interface ReportCard {
  period: string
  trades: number
  totalPnl: number
  winRate: number
  profitFactor: number
  violationRate: number
  grade: string
  gradeColor: string
}

// ─── Computation helpers ──────────────────────────────────────────────────────

function computeRuleStats(trades: Trade[], rules: Rule[]): RuleStat[] {
  const map = new Map<string, { totalCost: number; costOnLosers: number; costOnWinners: number; trades: Trade[] }>()
  for (const t of trades) {
    for (const ruleId of (t.rules_broken_ids || [])) {
      const cur = map.get(ruleId) ?? { totalCost: 0, costOnLosers: 0, costOnWinners: 0, trades: [] }
      map.set(ruleId, {
        totalCost: cur.totalCost + t.pnl,
        costOnLosers: cur.costOnLosers + (t.pnl < 0 ? t.pnl : 0),
        costOnWinners: cur.costOnWinners + (t.pnl > 0 ? t.pnl : 0),
        trades: [...cur.trades, t],
      })
    }
  }
  const total = trades.length || 1
  return rules
    .map(r => {
      const data = map.get(r.id)
      if (!data) return null
      return {
        ruleId: r.id,
        name: r.name,
        timesBroken: data.trades.length,
        totalCost: data.totalCost,
        costOnLosers: data.costOnLosers,
        costOnWinners: data.costOnWinners,
        violationRate: (data.trades.length / total) * 100,
        trades: [...data.trades].sort((a, b) => a.pnl - b.pnl),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a!.totalCost - b!.totalCost) as RuleStat[]
}

function computeWinLossComparison(trades: Trade[], rules: Rule[]): WinLossRule[] {
  const wins = trades.filter(t => t.pnl > 0)
  const losses = trades.filter(t => t.pnl <= 0)
  if (!wins.length && !losses.length) return []

  return rules.map(r => {
    const brokenOnWins = wins.filter(t => (t.rules_broken_ids || []).includes(r.id)).length
    const brokenOnLosses = losses.filter(t => (t.rules_broken_ids || []).includes(r.id)).length
    const rateOnWins = wins.length > 0 ? (brokenOnWins / wins.length) * 100 : 0
    const rateOnLosses = losses.length > 0 ? (brokenOnLosses / losses.length) * 100 : 0
    return { ruleId: r.id, name: r.name, rateOnWins, rateOnLosses, diff: rateOnLosses - rateOnWins }
  }).filter(r => r.rateOnWins > 0 || r.rateOnLosses > 0)
    .sort((a, b) => b.diff - a.diff)
}

function computeMistakeStats(trades: Trade[]): MistakeStat[] {
  const map = new Map<string, { count: number; totalCost: number }>()
  for (const t of trades) {
    for (const tagId of (t.mistake_tag_ids || [])) {
      const cur = map.get(tagId) ?? { count: 0, totalCost: 0 }
      map.set(tagId, { count: cur.count + 1, totalCost: cur.totalCost + t.pnl })
    }
  }
  return DEFAULT_MISTAKE_TAGS
    .map(tag => {
      const data = map.get(tag.id)
      if (!data) return null
      return {
        tagId: tag.id,
        name: tag.name,
        color: tag.color,
        count: data.count,
        totalCost: data.totalCost,
        avgCost: data.totalCost / data.count,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a!.totalCost - b!.totalCost) as MistakeStat[]
}

function groupByWeek(trades: Trade[]): WeekPoint[] {
  const map = new Map<string, { total: number; violated: number; dateVal: string }>()
  for (const t of trades) {
    const d = new Date(t.entry_time)
    const dow = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const key = isoDate(monday)
    const cur = map.get(key) ?? { total: 0, violated: 0, dateVal: key }
    map.set(key, {
      total: cur.total + 1,
      violated: cur.violated + ((t.rules_broken_ids || []).length > 0 ? 1 : 0),
      dateVal: key,
    })
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const monday = new Date(key)
      const label = `${monday.getMonth() + 1}/${monday.getDate()}`
      return {
        label,
        total: data.total,
        violated: data.violated,
        rate: data.total > 0 ? Math.round((data.violated / data.total) * 100) : 0,
      }
    })
}

function computeChecklistAdherence(trades: Trade[]): ChecklistGroup[] {
  const items = getChecklistItems().filter(i => i.is_active)
  if (items.length === 0) return []

  // Group trades by day
  const byDay = new Map<string, Trade[]>()
  for (const t of trades) {
    const day = t.entry_time.slice(0, 10)
    const arr = byDay.get(day) ?? []
    arr.push(t)
    byDay.set(day, arr)
  }

  const full: Trade[] = [], partial: Trade[] = [], none: Trade[] = []
  const fullDays = new Set<string>(), partialDays = new Set<string>(), noneDays = new Set<string>()

  for (const [day, dayTrades] of byDay) {
    const state = getChecklistState(day)
    const completed = items.filter(i => state[i.id]).length
    const pct = items.length > 0 ? completed / items.length : 0

    if (pct >= 1) { full.push(...dayTrades); fullDays.add(day) }
    else if (pct > 0) { partial.push(...dayTrades); partialDays.add(day) }
    else { none.push(...dayTrades); noneDays.add(day) }
  }

  function makeGroup(label: string, ts: Trade[], dayCount: number): ChecklistGroup {
    const wins = ts.filter(t => t.pnl > 0)
    const totalPnl = ts.reduce((s, t) => s + t.pnl, 0)
    return {
      label,
      dayCount,
      tradeCount: ts.length,
      totalPnl,
      avgPnl: ts.length > 0 ? totalPnl / ts.length : 0,
      winRate: ts.length > 0 ? (wins.length / ts.length) * 100 : 0,
      wins: wins.length,
    }
  }

  return [
    makeGroup('Full Checklist', full, fullDays.size),
    makeGroup('Partial Checklist', partial, partialDays.size),
    makeGroup('No Checklist', none, noneDays.size),
  ].filter(g => g.tradeCount > 0)
}

function computeGrade(winRate: number, profitFactor: number, violationRate: number): { grade: string; color: string } {
  let score = 0
  // Win rate contribution (40-70% range)
  if (winRate >= 60) score += 3
  else if (winRate >= 50) score += 2
  else if (winRate >= 40) score += 1

  // Profit factor contribution
  if (profitFactor >= 2) score += 3
  else if (profitFactor >= 1.5) score += 2
  else if (profitFactor >= 1) score += 1

  // Rule compliance (lower violation rate is better)
  if (violationRate <= 10) score += 3
  else if (violationRate <= 25) score += 2
  else if (violationRate <= 50) score += 1

  if (score >= 8) return { grade: 'A', color: 'text-profit' }
  if (score >= 6) return { grade: 'B', color: 'text-accent' }
  if (score >= 4) return { grade: 'C', color: 'text-warning' }
  if (score >= 2) return { grade: 'D', color: 'text-loss/70' }
  return { grade: 'F', color: 'text-loss' }
}

function computeReportCard(allTrades: Trade[]): ReportCard[] {
  const today = new Date()
  const cards: ReportCard[] = []

  function cardFor(label: string, ts: Trade[]): ReportCard | null {
    if (ts.length === 0) return null
    const wins = ts.filter(t => t.pnl > 0)
    const losses = ts.filter(t => t.pnl < 0)
    const totalPnl = ts.reduce((s, t) => s + t.pnl, 0)
    const winRate = (wins.length / ts.length) * 100
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0
    const tradesWith = ts.filter(t => (t.rules_broken_ids || []).length > 0).length
    const violationRate = ts.length > 0 ? (tradesWith / ts.length) * 100 : 0
    const { grade, color } = computeGrade(winRate, profitFactor, violationRate)
    return { period: label, trades: ts.length, totalPnl, winRate, profitFactor, violationRate, grade, gradeColor: color }
  }

  // This week
  const dow = today.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)
  monday.setHours(0, 0, 0, 0)
  const lastMonday = new Date(monday)
  lastMonday.setDate(monday.getDate() - 7)

  const thisWeekStr = monday.toISOString().split('T')[0]
  const lastWeekStr = lastMonday.toISOString().split('T')[0]
  const todayStr = today.toISOString().split('T')[0]

  const thisWeekTrades = allTrades.filter(t => t.entry_time.slice(0, 10) >= thisWeekStr)
  const lastWeekTrades = allTrades.filter(t => {
    const d = t.entry_time.slice(0, 10)
    return d >= lastWeekStr && d < thisWeekStr
  })

  // This month
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`
  const thisMonthTrades = allTrades.filter(t => t.entry_time.slice(0, 10) >= monthStart && t.entry_time.slice(0, 10) <= todayStr)
  const lastMonthTrades = allTrades.filter(t => {
    const d = t.entry_time.slice(0, 10)
    return d >= lastMonthStart && d < monthStart
  })

  const thisWeek = cardFor('This Week', thisWeekTrades)
  const lastWeek = cardFor('Last Week', lastWeekTrades)
  const thisMonth = cardFor('This Month', thisMonthTrades)
  const lastMonth = cardFor('Last Month', lastMonthTrades)

  if (thisWeek) cards.push(thisWeek)
  if (lastWeek) cards.push(lastWeek)
  if (thisMonth) cards.push(thisMonth)
  if (lastMonth) cards.push(lastMonth)
  return cards
}

function buildEmotionScatter(trades: Trade[]): EmotionPoint[] {
  return trades
    .filter(t => t.emotion_entry > 0)
    .map(t => ({
      // Stable jitter using trade id to prevent re-renders
      x: t.emotion_entry + (t.id.charCodeAt(0) % 20 - 10) / 60,
      y: Math.round(t.pnl * 100) / 100,
      ticker: t.ticker,
      emotion: t.emotion_entry,
    }))
}

// ─── Custom Recharts tooltips ─────────────────────────────────────────────────

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WeekPoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-1">Week of {d.label}</p>
      <p className="text-text-primary">{d.violated}/{d.total} trades had violations</p>
      <p className={d.rate > 50 ? 'text-loss font-semibold' : 'text-profit font-semibold'}>
        {d.rate}% violation rate
      </p>
    </div>
  )
}

function EmotionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: EmotionPoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const labels = ['', 'Anxious', 'Uneasy', 'Neutral', 'Confident', 'Optimal']
  return (
    <div className="bg-bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-text-primary">{d.ticker}</p>
      <p className="text-text-secondary">Emotion: {labels[d.emotion]} ({d.emotion}/5)</p>
      <p className={d.y >= 0 ? 'text-profit font-semibold' : 'text-loss font-semibold'}>
        {fmtPnl(d.y)}
      </p>
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

// ─── Empty state ──────────────────────────────────────────────────────────────

function Empty({ message }: { message: string }) {
  return <p className="text-text-muted text-sm text-center py-6">{message}</p>
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Review() {
  const [period, setPeriod] = useState<Period>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [expandedRule, setExpandedRule] = useState<string | null>(null)

  const allTrades = useMemo(() => getTrades(), [])
  const rules = useMemo(() => getRules(), [])
  const filtered = useMemo(
    () => filterTrades(allTrades, period, customStart, customEnd),
    [allTrades, period, customStart, customEnd],
  )

  const ruleStats = useMemo(() => computeRuleStats(filtered, rules), [filtered, rules])
  const winLossRules = useMemo(() => computeWinLossComparison(filtered, rules), [filtered, rules])
  const mistakeStats = useMemo(() => computeMistakeStats(filtered), [filtered])
  const weeklyTrend = useMemo(() => groupByWeek(allTrades), [allTrades]) // always all-time for trend
  const emotionScatter = useMemo(() => buildEmotionScatter(filtered), [filtered])
  const checklistAdherence = useMemo(() => computeChecklistAdherence(filtered), [filtered])
  const reportCards = useMemo(() => computeReportCard(allTrades), [allTrades])

  const wins = filtered.filter(t => t.pnl > 0)
  const losses = filtered.filter(t => t.pnl <= 0)
  const avgRulesOnWins = wins.length > 0
    ? wins.reduce((s, t) => s + (t.rules_broken_ids || []).length, 0) / wins.length
    : 0
  const avgRulesOnLosses = losses.length > 0
    ? losses.reduce((s, t) => s + (t.rules_broken_ids || []).length, 0) / losses.length
    : 0

  // Worst habits: top 3 most costly patterns across rules + mistakes
  const worstHabits = useMemo(() => {
    const items: { label: string; count: number; cost: number; type: 'rule' | 'mistake' }[] = [
      ...ruleStats.map(r => ({ label: r.name, count: r.timesBroken, cost: r.totalCost, type: 'rule' as const })),
      ...mistakeStats.map(m => ({ label: m.name, count: m.count, cost: m.totalCost, type: 'mistake' as const })),
    ]
    return items.filter(h => h.cost < 0).sort((a, b) => a.cost - b.cost).slice(0, 3)
  }, [ruleStats, mistakeStats])

  const totalViolations = ruleStats.reduce((s, r) => s + r.timesBroken, 0)

  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* ── Header + Period Selector ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Review</h1>
          <p className="text-text-secondary text-sm">Rule violations, mistake patterns, and improvement over time</p>
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

      {period === 'custom' && (
        <div className="flex gap-3 items-center">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input w-40" />
          <span className="text-text-muted text-sm">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input w-40" />
        </div>
      )}

      {/* ── Worst Habits Card ── */}
      {worstHabits.length > 0 && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} className="text-loss" />
            <h2 className="text-sm font-semibold text-loss uppercase tracking-wide">
              Top {worstHabits.length} Worst Habits This Period
            </h2>
          </div>
          {worstHabits.map((h, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-loss font-bold text-sm w-4 shrink-0">{i + 1}.</span>
              <p className="text-sm text-text-primary">
                <span className="font-medium">
                  {h.type === 'rule' ? `Breaking "${h.label}"` : `${h.label} trades`}
                </span>
                {' '}cost you{' '}
                <span className="font-semibold text-loss">{fmtPnl(h.cost)}</span>
                {' '}this period
                <span className="text-text-muted ml-2">({h.count}×)</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-text-muted">No trades in this period. Log some trades to see your review.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* ════════════════════════════════════
              7.1 + 7.2 — Rule Violations + Drill-down
          ════════════════════════════════════ */}
          <Section
            title="Rule Violations"
            sub={`${totalViolations} violation${totalViolations !== 1 ? 's' : ''} across ${filtered.length} trade${filtered.length !== 1 ? 's' : ''} · click a row to see the trades`}
          >
            {ruleStats.length === 0 ? (
              <Empty message="No rule violations this period. Great discipline!" />
            ) : (
              <div className="space-y-1">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_100px_110px_110px_80px] gap-2 px-3 py-1.5 text-xs text-text-muted uppercase tracking-wide">
                  <span>Rule</span>
                  <span className="text-right">Broken</span>
                  <span className="text-right">Total Cost</span>
                  <span className="text-right">Cost (Losers)</span>
                  <span className="text-right">Cost (Winners)</span>
                  <span className="text-right">Rate</span>
                </div>

                {ruleStats.map(rule => (
                  <div key={rule.ruleId}>
                    {/* Rule row */}
                    <button
                      onClick={() => setExpandedRule(expandedRule === rule.ruleId ? null : rule.ruleId)}
                      className="w-full grid grid-cols-[1fr_80px_100px_110px_110px_80px] gap-2 px-3 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-hover transition-colors text-sm items-center"
                    >
                      <span className="flex items-center gap-1.5 text-left">
                        {expandedRule === rule.ruleId
                          ? <ChevronDown size={13} className="text-text-muted shrink-0" />
                          : <ChevronRight size={13} className="text-text-muted shrink-0" />}
                        <span className="text-text-primary font-medium">{rule.name}</span>
                      </span>
                      <span className="text-right font-mono text-text-primary">{rule.timesBroken}</span>
                      <span className={`text-right font-mono font-semibold ${pnlClass(rule.totalCost)}`}>
                        {fmtPnl(rule.totalCost)}
                      </span>
                      <span className={`text-right font-mono ${rule.costOnLosers < 0 ? 'text-loss' : 'text-text-muted'}`}>
                        {rule.costOnLosers !== 0 ? fmtPnl(rule.costOnLosers) : '—'}
                      </span>
                      <span className={`text-right font-mono ${rule.costOnWinners > 0 ? 'text-profit' : 'text-text-muted'}`}>
                        {rule.costOnWinners !== 0 ? fmtPnl(rule.costOnWinners) : '—'}
                      </span>
                      <span className={`text-right font-mono text-xs ${rule.violationRate > 50 ? 'text-loss' : 'text-text-secondary'}`}>
                        {rule.violationRate.toFixed(0)}%
                      </span>
                    </button>

                    {/* Drill-down */}
                    {expandedRule === rule.ruleId && (
                      <div className="mt-1 mb-2 ml-4 border-l-2 border-loss/40 pl-3 space-y-1">
                        <p className="text-xs text-text-muted mb-2 pt-1">
                          {rule.trades.length} trade{rule.trades.length !== 1 ? 's' : ''} where this rule was broken:
                        </p>
                        {rule.trades.map(t => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between bg-bg-secondary rounded px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-text-primary w-12">{t.ticker}</span>
                              <span className="text-text-muted">{t.entry_time.slice(0, 10)}</span>
                              <span className={`px-1.5 py-0.5 rounded font-medium ${
                                t.direction === 'long' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'
                              }`}>
                                {t.direction === 'long' ? 'Long' : 'Short'}
                              </span>
                              {t.notes && (
                                <span className="text-text-muted italic truncate max-w-[200px]">{t.notes.slice(0, 60)}{t.notes.length > 60 ? '…' : ''}</span>
                              )}
                            </div>
                            <span className={`font-mono font-semibold ${pnlClass(t.pnl)}`}>
                              {fmtPnl(t.pnl)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ════════════════════════════════════
              7.3 — Win vs Loss Comparison
          ════════════════════════════════════ */}
          <Section
            title="Rules Broken: Wins vs Losses"
            sub="Are you breaking more rules on losing trades than winning ones?"
          >
            {wins.length === 0 && losses.length === 0 ? (
              <Empty message="No trade data to compare." />
            ) : (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-bg-secondary rounded-lg p-3 text-center">
                    <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Avg rules broken</p>
                    <p className="text-lg font-mono font-semibold text-profit">{avgRulesOnWins.toFixed(2)}</p>
                    <p className="text-xs text-text-muted">on winning trades</p>
                  </div>
                  <div className="bg-bg-secondary rounded-lg p-3 text-center">
                    <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Avg rules broken</p>
                    <p className="text-lg font-mono font-semibold text-loss">{avgRulesOnLosses.toFixed(2)}</p>
                    <p className="text-xs text-text-muted">on losing trades</p>
                  </div>
                  <div className="bg-bg-secondary rounded-lg p-3 text-center">
                    <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Difference</p>
                    <p className={`text-lg font-mono font-semibold ${avgRulesOnLosses > avgRulesOnWins ? 'text-loss' : 'text-profit'}`}>
                      {avgRulesOnLosses > avgRulesOnWins ? '+' : ''}{(avgRulesOnLosses - avgRulesOnWins).toFixed(2)}
                    </p>
                    <p className="text-xs text-text-muted">more on losers</p>
                  </div>
                </div>

                {winLossRules.length > 0 && (
                  <>
                    {/* Per-rule breakdown */}
                    <div className="grid grid-cols-[1fr_100px_110px_100px] gap-2 px-3 py-1.5 text-xs text-text-muted uppercase tracking-wide">
                      <span>Rule</span>
                      <span className="text-right">Rate on Wins</span>
                      <span className="text-right">Rate on Losses</span>
                      <span className="text-right">Difference</span>
                    </div>
                    <div className="space-y-1">
                      {winLossRules.map(r => (
                        <div
                          key={r.ruleId}
                          className={`grid grid-cols-[1fr_100px_110px_100px] gap-2 px-3 py-2 rounded-lg text-sm ${
                            r.diff > 20 ? 'bg-loss/10 border border-loss/20' : 'bg-bg-secondary'
                          }`}
                        >
                          <span className="text-text-primary flex items-center gap-2">
                            {r.diff > 20 && <AlertTriangle size={12} className="text-loss shrink-0" />}
                            {r.name}
                          </span>
                          <span className="text-right font-mono text-profit">{r.rateOnWins.toFixed(0)}%</span>
                          <span className="text-right font-mono text-loss">{r.rateOnLosses.toFixed(0)}%</span>
                          <span className={`text-right font-mono font-semibold ${r.diff > 0 ? 'text-loss' : 'text-profit'}`}>
                            {r.diff > 0 ? '+' : ''}{r.diff.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                      Rules highlighted in red are broken significantly more often on losing trades.
                    </p>
                  </>
                )}
              </>
            )}
          </Section>

          {/* ════════════════════════════════════
              7.4 — Mistake Tag Analysis
          ════════════════════════════════════ */}
          <Section
            title="Mistake Analysis"
            sub="What behavioral mistakes are costing you the most?"
          >
            {mistakeStats.length === 0 ? (
              <Empty message="No mistake tags logged this period." />
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_70px_110px_110px] gap-2 px-3 py-1.5 text-xs text-text-muted uppercase tracking-wide">
                  <span>Mistake</span>
                  <span className="text-right">Count</span>
                  <span className="text-right">Total Cost</span>
                  <span className="text-right">Avg Per Trade</span>
                </div>
                {mistakeStats.map(m => (
                  <div
                    key={m.tagId}
                    className="grid grid-cols-[1fr_70px_110px_110px] gap-2 px-3 py-2.5 rounded-lg bg-bg-secondary text-sm items-center"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: m.color }}
                      />
                      <span className="text-text-primary">{m.name}</span>
                    </span>
                    <span className="text-right font-mono text-text-primary">{m.count}</span>
                    <span className={`text-right font-mono font-semibold ${pnlClass(m.totalCost)}`}>
                      {fmtPnl(m.totalCost)}
                    </span>
                    <span className={`text-right font-mono text-sm ${pnlClass(m.avgCost)}`}>
                      {fmtPnl(m.avgCost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ════════════════════════════════════
              7.5 — Improvement Trend
          ════════════════════════════════════ */}
          <Section
            title="Improvement Trend"
            sub="Rule violation rate per week across all your trading history — are you getting better?"
          >
            {weeklyTrend.length < 2 ? (
              <Empty message="Not enough data yet. Log more trades across multiple weeks to see your trend." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#4a5568', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#4a5568', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `${v}%`}
                      domain={[0, 100]}
                      width={36}
                    />
                    <ReferenceLine y={50} stroke="#d29922" strokeDasharray="4 4" />
                    <RechartsTooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar
                      dataKey="rate"
                      radius={[3, 3, 0, 0]}
                    >
                      {weeklyTrend.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.rate > 50 ? '#ef4444' : entry.rate > 25 ? '#f59e0b' : '#10b981'}
                          fillOpacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-profit opacity-85" /> {'<'}25% — great</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-warning opacity-85" /> 25–50% — watch it</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-loss opacity-85" /> {'>'}50% — needs work</div>
                  <div className="flex items-center gap-1.5 ml-2"><div className="w-6 border-t border-dashed border-warning" /> 50% threshold</div>
                </div>
              </>
            )}
          </Section>

          {/* ════════════════════════════════════
              7.6 — Emotion vs P/L Scatter
          ════════════════════════════════════ */}
          <Section
            title="Emotion at Entry vs P/L"
            sub="Does your emotional state before a trade predict its outcome?"
          >
            {emotionScatter.length < 3 ? (
              <Empty message="Log at least 3 trades with an emotion rating to see this chart." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={[0.5, 5.5]}
                      ticks={[1, 2, 3, 4, 5]}
                      tickFormatter={v => (['', 'Anxious', 'Uneasy', 'Neutral', 'Confident', 'Optimal'])[Math.round(v)] ?? ''}
                      tick={{ fill: '#4a5568', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      name="Emotion"
                    />
                    <YAxis
                      dataKey="y"
                      type="number"
                      tickFormatter={v => `$${v}`}
                      tick={{ fill: '#4a5568', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={62}
                      name="P/L"
                    />
                    <ReferenceLine y={0} stroke="#2a3347" strokeDasharray="4 4" />
                    <RechartsTooltip content={<EmotionTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#4a5568' }} />
                    <Scatter data={emotionScatter} isAnimationActive={false}>
                      {emotionScatter.map((point, i) => (
                        <Cell
                          key={i}
                          fill={point.y >= 0 ? '#10b981' : '#ef4444'}
                          fillOpacity={0.75}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                  <TrendingDown size={12} className="text-text-muted" />
                  Each dot is one trade. Hover for details. Jitter applied to separate overlapping trades at the same emotion level.
                </div>
              </>
            )}
          </Section>

          {/* ════════════════════════════════════
              Checklist Adherence Analysis
          ════════════════════════════════════ */}
          <Section
            title="Checklist Adherence vs Performance"
            sub="Do you trade better on days you complete your pre-market checklist?"
          >
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck size={15} className="text-accent" />
              <span className="text-xs text-text-muted">Compares trading days by checklist completion in the selected period</span>
            </div>
            {checklistAdherence.length === 0 ? (
              <Empty message="No checklist data found. Complete your pre-market checklist on the Dashboard to see this analysis." />
            ) : (
              <>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${checklistAdherence.length}, 1fr)` }}>
                  {checklistAdherence.map(group => (
                    <div
                      key={group.label}
                      className={`rounded-lg p-4 border ${
                        group.label === 'Full Checklist'
                          ? 'border-profit/30 bg-profit/5'
                          : group.label === 'Partial Checklist'
                          ? 'border-warning/30 bg-warning/5'
                          : 'border-loss/30 bg-loss/5'
                      }`}
                    >
                      <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${
                        group.label === 'Full Checklist' ? 'text-profit'
                        : group.label === 'Partial Checklist' ? 'text-warning'
                        : 'text-loss'
                      }`}>
                        {group.label}
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-muted text-xs">Trading days</span>
                          <span className="font-mono text-text-primary">{group.dayCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted text-xs">Trades</span>
                          <span className="font-mono text-text-primary">{group.tradeCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted text-xs">Win Rate</span>
                          <span className={`font-mono ${group.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                            {group.winRate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted text-xs">Avg P/L</span>
                          <span className={`font-mono font-semibold ${group.avgPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {group.avgPnl >= 0 ? '+' : ''}${group.avgPnl.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted text-xs">Total P/L</span>
                          <span className={`font-mono font-semibold ${group.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {group.totalPnl >= 0 ? '+' : ''}${group.totalPnl.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {checklistAdherence.length >= 2 && (() => {
                  const full = checklistAdherence.find(g => g.label === 'Full Checklist')
                  const noCheck = checklistAdherence.find(g => g.label === 'No Checklist')
                  if (!full || !noCheck) return null
                  const diff = full.avgPnl - noCheck.avgPnl
                  return (
                    <p className={`text-xs mt-3 ${diff > 0 ? 'text-profit' : 'text-text-muted'}`}>
                      {diff > 0
                        ? `When you complete your checklist, your avg trade is $${Math.abs(diff).toFixed(2)} better than days you skip it.`
                        : 'Not enough contrast yet — keep logging checklist completions to see the pattern.'}
                    </p>
                  )
                })()}
              </>
            )}
          </Section>
        </>
      )}

      {/* ════════════════════════════════════
          Report Card (always visible, not period-filtered)
      ════════════════════════════════════ */}
      {reportCards.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Trophy size={15} className="text-accent" />
            <h2 className="text-base font-semibold text-text-primary">Performance Report Card</h2>
            <span className="text-xs text-text-muted ml-1">Graded on win rate, profit factor &amp; rule compliance</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4">
              {reportCards.map(card => (
                <div key={card.period} className="bg-bg-secondary rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-text-primary">{card.period}</span>
                    <span className={`text-3xl font-black ${card.gradeColor}`}>{card.grade}</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Trades</span>
                      <span className="font-mono text-text-primary">{card.trades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Total P/L</span>
                      <span className={`font-mono font-semibold ${card.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {card.totalPnl >= 0 ? '+' : ''}${card.totalPnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Win Rate</span>
                      <span className={`font-mono ${card.winRate >= 50 ? 'text-profit' : 'text-loss'}`}>
                        {card.winRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Profit Factor</span>
                      <span className={`font-mono ${card.profitFactor >= 1 ? 'text-profit' : 'text-loss'}`}>
                        {card.profitFactor >= 999 ? '∞' : card.profitFactor.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Violation Rate</span>
                      <span className={`font-mono ${card.violationRate <= 25 ? 'text-profit' : card.violationRate <= 50 ? 'text-warning' : 'text-loss'}`}>
                        {card.violationRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-3">
              Grade: A = excellent (win rate 60%+, PF 2+, violations &lt;10%) · F = needs immediate attention. Always uses all-time data.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
