import type { Trade, Rule } from '../types'
import { DEFAULT_SETUP_TAGS, DEFAULT_RULES } from '../types'

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildPrompt(trades: Trade[], rules: Rule[]): string {
  if (trades.length === 0) return ''

  const winners = trades.filter(t => t.pnl > 0)
  const losers = trades.filter(t => t.pnl < 0)
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0
  const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.pnl, 0) / losers.length : 0
  const grossWin = winners.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0
  const winRate = (winners.length / trades.length) * 100
  const avgR = trades.filter(t => t.actual_r != null).reduce((s, t) => s + (t.actual_r ?? 0), 0) /
    (trades.filter(t => t.actual_r != null).length || 1)

  // Rule violation summary
  const allRules = rules.length > 0 ? rules : DEFAULT_RULES
  const ruleStats: Record<string, { name: string; count: number; cost: number }> = {}
  for (const trade of trades) {
    for (const ruleId of trade.rules_broken_ids) {
      const rule = allRules.find(r => r.id === ruleId)
      if (!rule) continue
      if (!ruleStats[ruleId]) ruleStats[ruleId] = { name: rule.name, count: 0, cost: 0 }
      ruleStats[ruleId].count++
      ruleStats[ruleId].cost += trade.pnl
    }
  }
  const topViolations = Object.values(ruleStats)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 8)

  // Setup performance
  const setupStats: Record<string, { name: string; count: number; pnl: number; wins: number }> = {}
  for (const trade of trades) {
    const tag = DEFAULT_SETUP_TAGS.find(t => t.id === trade.setup_tag_id)
    const name = tag?.name ?? 'No setup'
    if (!setupStats[name]) setupStats[name] = { name, count: 0, pnl: 0, wins: 0 }
    setupStats[name].count++
    setupStats[name].pnl += trade.pnl
    if (trade.pnl > 0) setupStats[name].wins++
  }
  const setupLines = Object.values(setupStats)
    .sort((a, b) => b.count - a.count)
    .map(s => `  ${s.name}: ${s.count} trades, ${((s.wins / s.count) * 100).toFixed(0)}% win rate, $${s.pnl.toFixed(0)} P/L`)
    .join('\n')

  // Recent trades (last 50, condensed)
  const recentTrades = [...trades]
    .sort((a, b) => b.entry_time.localeCompare(a.entry_time))
    .slice(0, 50)
    .map(t => {
      const date = t.entry_time.slice(0, 10)
      const rBroken = t.rules_broken_ids.length
      const r = t.actual_r != null ? `${t.actual_r.toFixed(1)}R` : '—'
      return `  ${date} ${t.ticker.padEnd(6)} ${t.direction.toUpperCase().padEnd(6)} qty:${t.quantity} entry:$${t.entry_price.toFixed(2)} exit:$${t.exit_price.toFixed(2)} P/L:$${t.pnl.toFixed(2)} R:${r} rules_broken:${rBroken}`
    })
    .join('\n')

  // Emotion vs P/L
  const withEmotion = trades.filter(t => t.emotion_entry > 0)
  let emotionNote = ''
  if (withEmotion.length > 5) {
    const highEmotion = withEmotion.filter(t => t.emotion_entry >= 4)
    const lowEmotion = withEmotion.filter(t => t.emotion_entry <= 2)
    const avgHighPnl = highEmotion.length > 0 ? highEmotion.reduce((s, t) => s + t.pnl, 0) / highEmotion.length : null
    const avgLowPnl = lowEmotion.length > 0 ? lowEmotion.reduce((s, t) => s + t.pnl, 0) / lowEmotion.length : null
    if (avgHighPnl !== null && avgLowPnl !== null) {
      emotionNote = `\n## Emotion vs P/L\n  High emotion (4-5) trades: avg $${avgHighPnl.toFixed(2)} (${highEmotion.length} trades)\n  Low emotion (1-2) trades: avg $${avgLowPnl.toFixed(2)} (${lowEmotion.length} trades)`
    }
  }

  return `You are a trading coach analyzing a trader's real performance data. The trader uses the Qullamaggie (Kris Kristoffersen) momentum/breakout methodology, trading primarily long equities. Be direct, specific, and reference actual numbers from their data. Don't be generic or vague.

## Overall Statistics (${trades.length} trades analyzed)
- Win rate: ${winRate.toFixed(1)}% (${winners.length}W / ${losers.length}L)
- Total P/L: $${totalPnl.toFixed(2)}
- Profit factor: ${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
- Average win: $${avgWin.toFixed(2)}
- Average loss: $${avgLoss.toFixed(2)}
- Average R: ${avgR.toFixed(2)}R

## Rule Violations (most costly first)
${topViolations.length > 0
  ? topViolations.map(v => `  ${v.name}: broken ${v.count}x, cost $${v.cost.toFixed(2)}`).join('\n')
  : '  No rule violations logged'}

## Setup Performance
${setupLines || '  No setup tags logged'}
${emotionNote}

## Recent Trades (last ${recentTrades.split('\n').length})
${recentTrades}

---

Please provide a coaching analysis with these sections:

**1. Worst Habits** — The 2-3 most costly patterns in this data. Be specific: which rules, which setups, what's the dollar cost.

**2. What's Working** — Genuine strengths to keep doing. Reference specific setups or behaviors with positive numbers.

**3. This Week's Focus** — Exactly 3 concrete, actionable changes to make. Not generic advice — specific to this trader's data.

**4. The Bottom Line** — One paragraph summary: what's the single biggest thing holding this trader back, and what would change if they fixed it.`
}

// ─── Streaming API call ───────────────────────────────────────────────────────

export async function* streamAnalysis(
  apiKey: string,
  prompt: string,
): AsyncGenerator<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    let msg = `API error ${response.status}`
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } }
      if (parsed.error?.message) msg = parsed.error.message
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  if (!response.body) throw new Error('No response body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const event = JSON.parse(data) as {
            type: string
            delta?: { type: string; text?: string }
          }
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
            yield event.delta.text
          }
        } catch { /* ignore malformed SSE */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
