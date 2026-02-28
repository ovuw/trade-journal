import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, X, ExternalLink } from 'lucide-react'
import { getTrades, getJournalEntries, upsertJournalEntry } from '../lib/db'
import { JournalEntry, MarketCondition } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MOOD_LABELS: Record<number, string> = {
  1: 'Rough',
  2: 'Below Avg',
  3: 'Neutral',
  4: 'Good',
  5: 'Excellent',
}

const MOOD_COLORS: Record<number, string> = {
  1: 'bg-loss text-white',
  2: 'bg-loss/60 text-white',
  3: 'bg-warning/80 text-bg-primary',
  4: 'bg-profit/70 text-bg-primary',
  5: 'bg-profit text-bg-primary',
}

const MARKET_CONDITIONS: { value: MarketCondition; label: string }[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'choppy', label: 'Choppy' },
  { value: 'volatile', label: 'Volatile' },
  { value: 'ranging', label: 'Ranging' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string { return d.toISOString().split('T')[0] }

function fmtPnl(n: number): string {
  const abs = Math.abs(n).toFixed(2)
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00') // noon to avoid DST edge cases
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function buildCalendarDays(year: number, month: number): { dateStr: string; day: number }[][] {
  const firstDay = new Date(year, month, 1)
  const lastDate = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7 // Mon = 0

  const cells: ({ dateStr: string; day: number } | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ dateStr, day: d })
  }
  // Group into weeks
  const weeks: ({ dateStr: string; day: number } | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks.map(w => {
    while (w.length < 7) w.push(null)
    return w as ({ dateStr: string; day: number } | null)[]
  }) as { dateStr: string; day: number }[][]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Journal() {
  const navigate = useNavigate()
  const today = isoDate(new Date())

  // Calendar nav
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())

  // Selected date
  const [selectedDate, setSelectedDate] = useState(today)

  // All journal entries (refreshed after saves)
  const [allEntries, setAllEntries] = useState<JournalEntry[]>(() => getJournalEntries())

  // Current entry editing state
  const [content, setContent] = useState('')
  const [mood, setMood] = useState(0)
  const [marketCondition, setMarketCondition] = useState<MarketCondition>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Recent entries filters
  const [filterMood, setFilterMood] = useState(0)
  const [filterCondition, setFilterCondition] = useState<MarketCondition | ''>('')

  // Auto-save ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // All trades for the day panel
  const allTrades = useMemo(() => getTrades(), [])

  // ── On mount: auto-create today's entry if missing (9.6) ──────────────────
  useEffect(() => {
    const existing = allEntries.find(e => e.date === today)
    if (!existing) {
      upsertJournalEntry({ date: today, content: '', mood: 0, market_condition: '' })
      setAllEntries(getJournalEntries())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load entry when selected date changes ─────────────────────────────────
  useEffect(() => {
    const entry = allEntries.find(e => e.date === selectedDate)
    setContent(entry?.content ?? '')
    setMood(entry?.mood ?? 0)
    setMarketCondition((entry?.market_condition ?? '') as MarketCondition)
    setSaveStatus('idle')
  }, [selectedDate, allEntries])

  // ── Debounced save ─────────────────────────────────────────────────────────
  const triggerSave = (c: string, m: number, mc: MarketCondition) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    saveTimer.current = setTimeout(() => {
      upsertJournalEntry({ date: selectedDate, content: c, mood: m, market_condition: mc })
      setAllEntries(getJournalEntries())
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 700)
  }

  const handleContentChange = (v: string) => {
    setContent(v)
    triggerSave(v, mood, marketCondition)
  }

  const handleMoodChange = (v: number) => {
    const next = mood === v ? 0 : v
    setMood(next)
    triggerSave(content, next, marketCondition)
  }

  const handleConditionChange = (v: MarketCondition) => {
    const next = marketCondition === v ? '' : v
    setMarketCondition(next)
    triggerSave(content, mood, next)
  }

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr)
    // Navigate calendar to that month if needed
    const d = new Date(dateStr + 'T12:00:00')
    setCalYear(d.getFullYear())
    setCalMonth(d.getMonth())
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  const calWeeks = useMemo(() => buildCalendarDays(calYear, calMonth), [calYear, calMonth])
  const entryDateSet = useMemo(() => {
    const s = new Set<string>()
    for (const e of allEntries) if (e.content.trim() || e.mood > 0) s.add(e.date)
    return s
  }, [allEntries])
  const moodByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of allEntries) if (e.mood > 0) m.set(e.date, e.mood)
    return m
  }, [allEntries])

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  // ── Search ────────────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return allEntries
      .filter(e => e.content.toLowerCase().includes(q) || e.date.includes(q))
      .slice(0, 10)
  }, [searchQuery, allEntries])

  // ── Day trades ────────────────────────────────────────────────────────────
  const dayTrades = useMemo(
    () => allTrades.filter(t => t.entry_time.slice(0, 10) === selectedDate),
    [allTrades, selectedDate],
  )
  const dayPnl = dayTrades.reduce((s, t) => s + t.pnl, 0)

  // ── Entry has any content? ─────────────────────────────────────────────────
  const hasEntry = content.trim().length > 0 || mood > 0

  return (
    <div className="flex gap-0 h-full">

      {/* ════════════════════════════════════════
          LEFT PANEL — calendar + search
      ════════════════════════════════════════ */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col bg-bg-secondary h-full overflow-y-auto">

        {/* Calendar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <button onClick={prevMonth} className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()) }}
            className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
          >
            {MONTH_NAMES[calMonth].slice(0, 3)} {calYear}
          </button>
          <button onClick={nextMonth} className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Calendar grid */}
        <div className="px-3 py-2">
          <div className="grid grid-cols-7 mb-1">
            {DOW_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] text-text-muted py-1">{d[0]}</div>
            ))}
          </div>
          {calWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0.5 mb-0.5">
              {week.map((cell, di) => {
                if (!cell) return <div key={di} />
                const { dateStr, day } = cell
                const isSelected = dateStr === selectedDate
                const isToday = dateStr === today
                const hasMood = moodByDate.has(dateStr)
                const hasContent = entryDateSet.has(dateStr)
                const moodVal = moodByDate.get(dateStr) ?? 0

                // Mood-based subtle bg tint
                const moodBg = hasMood
                  ? moodVal >= 4 ? 'bg-profit/10' : moodVal <= 2 ? 'bg-loss/10' : 'bg-warning/10'
                  : ''

                return (
                  <button
                    key={dateStr}
                    onClick={() => handleSelectDate(dateStr)}
                    className={`relative flex flex-col items-center justify-center w-full aspect-square rounded text-xs transition-colors
                      ${isSelected ? 'bg-accent text-white font-semibold' : `${moodBg} hover:bg-bg-hover text-text-primary`}
                      ${isToday && !isSelected ? 'ring-1 ring-accent ring-offset-1 ring-offset-bg-secondary' : ''}
                    `}
                  >
                    {day}
                    {hasContent && !isSelected && (
                      <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${hasMood && moodVal >= 4 ? 'bg-profit' : hasMood && moodVal <= 2 ? 'bg-loss' : 'bg-accent'}`} />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Today button */}
        {selectedDate !== today && (
          <div className="px-3 pb-2">
            <button
              onClick={() => handleSelectDate(today)}
              className="w-full text-xs text-accent hover:underline underline-offset-2 text-center py-1"
            >
              Jump to today
            </button>
          </div>
        )}

        {/* Search */}
        <div className="border-t border-border p-3 flex-1">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Search Journal</p>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search entries..."
              className="input text-xs pl-7 pr-7"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Search results */}
          {searchQuery.trim() && (
            <div className="mt-2 space-y-1">
              {searchResults.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-3">No matches found.</p>
              ) : (
                searchResults.map(e => (
                  <button
                    key={e.date}
                    onClick={() => { handleSelectDate(e.date); setSearchQuery('') }}
                    className="w-full text-left px-2 py-2 rounded hover:bg-bg-hover transition-colors"
                  >
                    <p className="text-xs font-medium text-accent">{e.date}</p>
                    <p className="text-xs text-text-muted truncate mt-0.5">
                      {e.content.trim().slice(0, 60) || '(empty)'}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Recent entries list (when not searching) */}
          {!searchQuery && (
            <div className="mt-3">
              <p className="text-xs text-text-muted mb-2">Recent entries</p>
              <div className="flex flex-col gap-1.5 mb-2">
                <select
                  value={filterMood}
                  onChange={e => setFilterMood(Number(e.target.value))}
                  className="input text-[11px] py-1 px-2 h-7"
                >
                  <option value={0}>All moods</option>
                  {[1, 2, 3, 4, 5].map(v => (
                    <option key={v} value={v}>{v}★ {MOOD_LABELS[v]}</option>
                  ))}
                </select>
                <select
                  value={filterCondition}
                  onChange={e => setFilterCondition(e.target.value as MarketCondition | '')}
                  className="input text-[11px] py-1 px-2 h-7"
                >
                  <option value="">All conditions</option>
                  {MARKET_CONDITIONS.map(mc => (
                    <option key={mc.value} value={mc.value}>{mc.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                {allEntries
                  .filter(e => (e.content.trim() || e.mood > 0))
                  .filter(e => filterMood === 0 || e.mood === filterMood)
                  .filter(e => !filterCondition || e.market_condition === filterCondition)
                  .slice(0, 8)
                  .map(e => (
                    <button
                      key={e.date}
                      onClick={() => handleSelectDate(e.date)}
                      className={`w-full text-left px-2 py-1.5 rounded transition-colors ${e.date === selectedDate ? 'bg-accent/20 text-accent' : 'hover:bg-bg-hover text-text-secondary'}`}
                    >
                      <p className="text-xs font-medium">{e.date}</p>
                      {e.mood > 0 && (
                        <p className="text-[10px] text-text-muted">{MOOD_LABELS[e.mood]}{e.market_condition ? ` · ${e.market_condition}` : ''}</p>
                      )}
                    </button>
                  ))}
                {allEntries
                  .filter(e => (e.content.trim() || e.mood > 0))
                  .filter(e => filterMood === 0 || e.mood === filterMood)
                  .filter(e => !filterCondition || e.market_condition === filterCondition)
                  .length === 0 && (
                  <p className="text-xs text-text-muted text-center py-2">No entries match.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════
          RIGHT PANEL — editor + trades
      ════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4 max-w-3xl">

          {/* Date heading */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-text-primary">{formatFullDate(selectedDate)}</h1>
              {dayTrades.length > 0 && (
                <p className={`text-sm mt-0.5 font-mono ${dayPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''} · {fmtPnl(dayPnl)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              {saveStatus === 'saving' && <span className="text-text-muted">Saving...</span>}
              {saveStatus === 'saved' && <span className="text-profit">Saved</span>}
            </div>
          </div>

          {/* Mood + Market condition */}
          <div className="bg-bg-card border border-border rounded-lg p-4 space-y-3">
            {/* Mood */}
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Session Mood</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(v => (
                  <button
                    key={v}
                    onClick={() => handleMoodChange(v)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                      mood === v
                        ? MOOD_COLORS[v]
                        : 'bg-bg-secondary text-text-muted border border-border hover:border-text-muted hover:text-text-primary'
                    }`}
                  >
                    <span className="block text-base font-mono leading-none mb-0.5">{v}</span>
                    <span className="text-[10px] leading-none">{MOOD_LABELS[v]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Market condition */}
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Market Condition</p>
              <div className="flex gap-2 flex-wrap">
                {MARKET_CONDITIONS.map(mc => (
                  <button
                    key={mc.value}
                    onClick={() => handleConditionChange(mc.value)}
                    className={`px-3 py-1.5 rounded-full text-xs border font-medium transition-colors ${
                      marketCondition === mc.value
                        ? 'border-accent text-accent bg-accent/10'
                        : 'border-border text-text-muted hover:border-text-muted hover:text-text-primary'
                    }`}
                  >
                    {mc.label}
                  </button>
                ))}
                {marketCondition && (
                  <button
                    onClick={() => handleConditionChange('' as MarketCondition)}
                    className="text-xs text-text-muted hover:text-text-primary"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Notes textarea */}
          <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-xs text-text-muted uppercase tracking-wide">Notes</p>
              <p className="text-xs text-text-muted">Markdown supported</p>
            </div>
            <textarea
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              placeholder={`What happened today? Key observations, lessons, trade rationale...\n\nMarkdown supported:\n# Heading\n**bold** _italic_\n- bullet point`}
              rows={18}
              aria-label="Journal entry"
              className="w-full bg-transparent px-4 py-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none leading-relaxed font-mono"
            />
          </div>

          {/* Trades on this day */}
          <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-xs text-text-muted uppercase tracking-wide">
                Trades on {selectedDate}
              </p>
              {dayTrades.length > 0 && (
                <button
                  onClick={() => navigate('/trade-log')}
                  className="text-xs text-accent hover:underline underline-offset-2 flex items-center gap-1"
                >
                  View in log <ExternalLink size={10} />
                </button>
              )}
            </div>

            {dayTrades.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-text-muted text-sm">No trades on this day.</p>
                {selectedDate === today && (
                  <button
                    onClick={() => navigate('/new-trade')}
                    className="text-xs text-accent hover:underline underline-offset-2 mt-1"
                  >
                    Log a trade →
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dayTrades.map(t => (
                  <div key={t.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                    <span className="font-mono font-semibold text-text-primary w-14">{t.ticker}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      t.direction === 'long' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'
                    }`}>
                      {t.direction === 'long' ? 'Long' : 'Short'}
                    </span>
                    <span className="text-text-muted text-xs">
                      {t.quantity} shares @ ${t.entry_price.toFixed(2)} → ${t.exit_price.toFixed(2)}
                    </span>
                    {t.actual_r !== null && (
                      <span className="text-text-muted text-xs font-mono">
                        {t.actual_r >= 0 ? '+' : ''}{t.actual_r.toFixed(2)}R
                      </span>
                    )}
                    <span className={`ml-auto font-mono font-semibold ${t.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {fmtPnl(t.pnl)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary text-xs">
                  <span className="text-text-muted">{dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''}</span>
                  <span className={`font-mono font-semibold ${dayPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    Day P/L: {fmtPnl(dayPnl)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Empty state nudge */}
          {!hasEntry && selectedDate === today && (
            <p className="text-xs text-text-muted text-center pb-4">
              Start typing above to log your trading day.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
