import { useState, useRef, useEffect } from 'react'
import { Sparkles, Play, Square, Key, ExternalLink, ChevronDown, History, Clock } from 'lucide-react'
import { getTrades, getRules, getAnthropicKey, saveAnthropicKey, saveAnalysis, getAnalyses, type SavedAnalysis } from '../lib/db'
import { buildPrompt, streamAnalysis } from '../lib/aiAnalysis'
import type { Trade } from '../types'

type Period = 'all' | '30d' | '90d' | 'ytd'

function filterByPeriod(trades: Trade[], period: Period): Trade[] {
  if (period === 'all') return trades
  const now = new Date()
  const cutoff = new Date()
  if (period === '30d') cutoff.setDate(now.getDate() - 30)
  else if (period === '90d') cutoff.setDate(now.getDate() - 90)
  else if (period === 'ytd') cutoff.setMonth(0, 1), cutoff.setHours(0, 0, 0, 0)
  return trades.filter(t => new Date(t.entry_time) >= cutoff)
}

// Very simple markdown renderer — handles **bold**, ## headings, and newlines
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    // Heading
    if (line.startsWith('## ') || line.startsWith('**') && line.endsWith('**')) {
      const content = line.replace(/^#+\s*/, '').replace(/\*\*/g, '')
      return <p key={i} className="text-text-primary font-semibold mt-4 mb-1 text-sm">{content}</p>
    }
    // Bold inline — render segments
    if (line.includes('**')) {
      const parts = line.split(/(\*\*[^*]+\*\*)/)
      return (
        <p key={i} className="text-text-secondary text-sm leading-relaxed">
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} className="text-text-primary font-semibold">{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      )
    }
    // Bullet
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return <p key={i} className="text-text-secondary text-sm leading-relaxed pl-3">{'• '}{line.slice(2)}</p>
    }
    // Empty line
    if (line.trim() === '' || line === '---') {
      return <div key={i} className="h-2" />
    }
    return <p key={i} className="text-text-secondary text-sm leading-relaxed">{line}</p>
  })
}

export default function AIAnalysis() {
  const [apiKey, setApiKey] = useState(() => getAnthropicKey())
  const [keyInput, setKeyInput] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [tradeCount, setTradeCount] = useState(0)
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>(() => getAnalyses())
  const [viewingAnalysis, setViewingAnalysis] = useState<SavedAnalysis | null>(null)
  const abortRef = useRef<boolean>(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trades = filterByPeriod(getTrades(), period)
    setTradeCount(trades.length)
  }, [period])

  // Auto-scroll as output streams in
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  function handleSaveKey() {
    const trimmed = keyInput.trim()
    if (!trimmed.startsWith('sk-')) {
      setError('Key should start with sk-')
      return
    }
    saveAnthropicKey(trimmed)
    setApiKey(trimmed)
    setKeyInput('')
    setError('')
  }

  async function handleRun() {
    if (!apiKey || status === 'running') return
    const trades = filterByPeriod(getTrades(), period)
    if (trades.length === 0) {
      setError('No trades in the selected period.')
      return
    }

    const rules = getRules()
    const prompt = buildPrompt(trades, rules)

    setStatus('running')
    setOutput('')
    setError('')
    setViewingAnalysis(null)
    abortRef.current = false

    let accumulated = ''
    try {
      for await (const chunk of streamAnalysis(apiKey, prompt)) {
        if (abortRef.current) break
        accumulated += chunk
        setOutput(accumulated)
      }
      setStatus('done')
      if (accumulated.length > 0) {
        saveAnalysis({
          date: new Date().toISOString().slice(0, 10),
          period: periodLabel[period],
          content: accumulated,
        })
        setAnalyses(getAnalyses())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  function handleStop() {
    abortRef.current = true
    setStatus('done')
  }

  const periodLabel: Record<Period, string> = {
    all: 'All Time',
    '30d': 'Last 30 Days',
    '90d': 'Last 90 Days',
    ytd: 'Year to Date',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-accent" />
              <h1 className="text-2xl font-semibold text-text-primary">AI Trade Analysis</h1>
            </div>
            <p className="text-text-secondary text-sm mt-0.5">
              Plain-English breakdown of your trading patterns, powered by Claude
            </p>
          </div>

          {apiKey && (
            <div className="flex items-center gap-2">
              {/* Period selector */}
              <div className="relative">
                <select
                  value={period}
                  onChange={e => setPeriod(e.target.value as Period)}
                  className="input text-sm pr-8 appearance-none cursor-pointer"
                >
                  {(Object.keys(periodLabel) as Period[]).map(p => (
                    <option key={p} value={p}>{periodLabel[p]}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>

              {status === 'running' ? (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-loss/20 text-loss hover:bg-loss/30 transition-colors"
                >
                  <Square size={13} /> Stop
                </button>
              ) : (
                <button
                  onClick={() => { void handleRun() }}
                  disabled={tradeCount === 0}
                  className="flex items-center gap-1.5 btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play size={13} />
                  Analyze {tradeCount} Trade{tradeCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex gap-0">

        {/* History sidebar */}
        {analyses.length > 0 && (
          <div className="w-56 shrink-0 border-r border-border flex flex-col bg-bg-secondary h-full overflow-y-auto">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <History size={13} className="text-text-muted" />
              <p className="text-xs font-medium text-text-secondary">Previous Analyses</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {analyses.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setViewingAnalysis(a); setOutput('') }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${viewingAnalysis?.id === a.id ? 'bg-accent/10 text-accent' : 'hover:bg-bg-hover text-text-secondary'}`}
                >
                  <p className="text-xs font-medium leading-none mb-1">{a.period}</p>
                  <p className="text-[10px] text-text-muted flex items-center gap-1"><Clock size={9} />{a.date}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">

        {/* API key setup */}
        {!apiKey && (
          <div className="bg-bg-card border border-border rounded-xl p-6 max-w-lg mx-auto mt-8">
            <div className="flex items-center gap-2 mb-3">
              <Key size={18} className="text-accent" />
              <h2 className="text-base font-semibold text-text-primary">Connect Anthropic API</h2>
            </div>
            <p className="text-text-secondary text-sm mb-4">
              Paste your Anthropic API key to enable AI analysis. Your key is stored locally on this device only.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="password"
                value={keyInput}
                onChange={e => { setKeyInput(e.target.value); setError('') }}
                placeholder="sk-ant-..."
                className="input text-sm font-mono flex-1"
                onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
                autoFocus
              />
              <button
                onClick={handleSaveKey}
                disabled={!keyInput.trim()}
                className="btn-primary text-sm px-4 disabled:opacity-40"
              >
                Save
              </button>
            </div>
            {error && <p className="text-xs text-loss mb-2">{error}</p>}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <ExternalLink size={11} /> Get your API key at console.anthropic.com
            </a>
          </div>
        )}

        {/* Change key link */}
        {apiKey && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-text-muted">API key configured</span>
            <button
              onClick={() => { saveAnthropicKey(''); setApiKey(''); setOutput(''); setStatus('idle') }}
              className="text-xs text-text-muted hover:text-loss transition-colors"
            >
              Remove
            </button>
          </div>
        )}

        {/* Error */}
        {error && status === 'error' && (
          <div className="bg-loss/10 border border-loss/30 rounded-lg px-4 py-3 text-sm text-loss flex-shrink-0">
            {error}
          </div>
        )}

        {/* Saved analysis viewer */}
        {viewingAnalysis && (
          <div className="flex-1 overflow-y-auto bg-bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
              <History size={13} className="text-text-muted" />
              <span className="text-xs text-text-secondary font-medium">{viewingAnalysis.period} · {viewingAnalysis.date}</span>
              <button onClick={() => setViewingAnalysis(null)} className="ml-auto text-xs text-text-muted hover:text-text-primary">New analysis →</button>
            </div>
            <div className="space-y-0.5">
              {renderMarkdown(viewingAnalysis.content)}
            </div>
          </div>
        )}

        {/* Output */}
        {apiKey && !viewingAnalysis && (
          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto bg-bg-card border border-border rounded-xl p-6"
          >
            {status === 'idle' && output === '' && (
              <div className="flex flex-col items-center justify-center h-full text-center py-10">
                <Sparkles size={36} className="text-text-muted mb-3" />
                <p className="text-text-primary font-medium">Ready to analyze</p>
                <p className="text-text-secondary text-sm mt-1">
                  Select a time period and click Analyze to get your coaching breakdown
                </p>
              </div>
            )}

            {output && (
              <div className="space-y-0.5">
                {renderMarkdown(output)}
                {status === 'running' && (
                  <span className="inline-block w-1.5 h-4 bg-accent animate-pulse ml-0.5" />
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
