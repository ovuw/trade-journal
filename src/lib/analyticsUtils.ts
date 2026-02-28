import { Trade, Tag, Rule } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StreakResult {
  currentStreak: number
  currentStreakType: 'win' | 'loss' | null
  longestWin: number
  longestLoss: number
}

export interface SetupStat {
  tagId: string
  name: string
  count: number
  wins: number
  winRate: number
  totalPnl: number
  avgPnl: number
  avgWin: number
  avgLoss: number
  avgR: number | null
  ev: number
}

export interface RuleStat {
  ruleId: string
  name: string
  count: number
  cost: number
}

// ── calcStreak ─────────────────────────────────────────────────────────────────

export function calcStreak(trades: Trade[]): StreakResult {
  const sorted = [...trades].sort((a, b) => a.entry_time.localeCompare(b.entry_time))
  if (sorted.length === 0) {
    return { currentStreak: 0, currentStreakType: null, longestWin: 0, longestLoss: 0 }
  }

  let longestWin = 0, longestLoss = 0, tempWin = 0, tempLoss = 0
  for (const t of sorted) {
    if ((t.pnl ?? 0) > 0) { tempWin++; tempLoss = 0; if (tempWin > longestWin) longestWin = tempWin }
    else { tempLoss++; tempWin = 0; if (tempLoss > longestLoss) longestLoss = tempLoss }
  }

  const lastType: 'win' | 'loss' = (sorted[sorted.length - 1].pnl ?? 0) > 0 ? 'win' : 'loss'
  let streak = 1
  for (let i = sorted.length - 2; i >= 0; i--) {
    const isWin = (sorted[i].pnl ?? 0) > 0
    if ((lastType === 'win' && isWin) || (lastType === 'loss' && !isWin)) streak++
    else break
  }

  return { currentStreak: streak, currentStreakType: lastType, longestWin, longestLoss }
}

// ── calcSetupBreakdown ─────────────────────────────────────────────────────────

function setupStats(ts: Trade[]): Omit<SetupStat, 'tagId' | 'name'> {
  const wins = ts.filter(t => (t.pnl ?? 0) > 0)
  const losses = ts.filter(t => (t.pnl ?? 0) < 0)
  const winRate = ts.length > 0 ? (wins.length / ts.length) * 100 : 0
  const totalPnl = ts.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const avgPnl = ts.length > 0 ? totalPnl / ts.length : 0
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / losses.length : 0
  const ev = (wins.length / ts.length) * avgWin - (losses.length / ts.length) * avgLoss
  const withR = ts.filter(t => t.actual_r !== null)
  const avgR = withR.length > 0 ? withR.reduce((s, t) => s + t.actual_r!, 0) / withR.length : null
  return { count: ts.length, wins: wins.length, winRate, totalPnl, avgPnl, avgWin, avgLoss, avgR, ev }
}

export function calcSetupBreakdown(trades: Trade[], setupTags: Tag[]): SetupStat[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    if (!t.setup_tag_id) continue
    const arr = map.get(t.setup_tag_id) ?? []
    arr.push(t)
    map.set(t.setup_tag_id, arr)
  }
  return setupTags
    .filter(tag => map.has(tag.id))
    .map(tag => ({ tagId: tag.id, name: tag.name, ...setupStats(map.get(tag.id)!) }))
    .sort((a, b) => b.ev - a.ev)
}

// ── calcRuleBreakdown ──────────────────────────────────────────────────────────

export function calcRuleBreakdown(trades: Trade[], rules: Rule[]): RuleStat[] {
  const map = new Map<string, { count: number; cost: number }>()
  for (const t of trades) {
    for (const ruleId of (t.rules_broken_ids || [])) {
      const cur = map.get(ruleId) ?? { count: 0, cost: 0 }
      map.set(ruleId, { count: cur.count + 1, cost: cur.cost + (t.pnl ?? 0) })
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
