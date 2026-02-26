import { useState } from 'react'
import { ExternalLink, Plus, Trash2, Calendar, Newspaper, Wrench, GraduationCap } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsLink {
  id: string
  name: string
  url: string
  description: string
  category: string
}

interface CustomLink {
  id: string
  name: string
  url: string
  created_at: string
}

// ─── Default curated links ────────────────────────────────────────────────────

const DEFAULT_LINKS: NewsLink[] = [
  // News
  { id: 'bloomberg', name: 'Bloomberg', url: 'https://www.bloomberg.com/markets', description: 'Financial markets news & analysis', category: 'News' },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://www.marketwatch.com', description: 'Stock market news & real-time data', category: 'News' },
  { id: 'benzinga', name: 'Benzinga', url: 'https://www.benzinga.com', description: 'Fast-moving financial news & alerts', category: 'News' },
  { id: 'yahoo-finance', name: 'Yahoo Finance', url: 'https://finance.yahoo.com', description: 'Stock quotes, news, and financials', category: 'News' },
  { id: 'cnbc', name: 'CNBC Markets', url: 'https://www.cnbc.com/markets/', description: 'Live market news & financial television', category: 'News' },
  { id: 'wsj', name: 'WSJ Markets', url: 'https://www.wsj.com/market-data', description: 'Wall Street Journal market data', category: 'News' },
  // Calendars
  { id: 'forex-factory', name: 'Forex Factory', url: 'https://www.forexfactory.com/calendar', description: 'Economic calendar with impact ratings', category: 'Calendars' },
  { id: 'investing-cal', name: 'Investing.com Calendar', url: 'https://www.investing.com/economic-calendar/', description: 'Global economic events calendar', category: 'Calendars' },
  { id: 'earnings-whispers', name: 'Earnings Whispers', url: 'https://www.earningswhispers.com/', description: 'Earnings calendar & consensus estimates', category: 'Calendars' },
  { id: 'fed-calendar', name: 'Fed Calendar', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', description: 'Federal Reserve meeting & announcement dates', category: 'Calendars' },
  // Tools
  { id: 'finviz', name: 'Finviz', url: 'https://finviz.com', description: 'Stock screener, heat maps & market visualization', category: 'Tools' },
  { id: 'tradingview', name: 'TradingView', url: 'https://www.tradingview.com', description: 'Advanced charting & social trading network', category: 'Tools' },
  { id: 'stockcharts', name: 'StockCharts', url: 'https://stockcharts.com', description: 'Technical analysis charting tools', category: 'Tools' },
  { id: 'unusual-whales', name: 'Unusual Whales', url: 'https://unusualwhales.com', description: 'Options flow, dark pool & market intelligence', category: 'Tools' },
  { id: 'market-chameleon', name: 'Market Chameleon', url: 'https://marketchameleon.com', description: 'Options analytics & earnings data', category: 'Tools' },
  // Education
  { id: 'investopedia', name: 'Investopedia', url: 'https://www.investopedia.com', description: 'Financial definitions, tutorials & analysis', category: 'Education' },
  { id: 'fxstreet', name: 'FxStreet', url: 'https://www.fxstreet.com', description: 'Forex news, analysis & economic calendar', category: 'Education' },
  { id: 'tradestats', name: 'TraderLion', url: 'https://traderlion.com', description: 'Trading education & market research', category: 'Education' },
]

const CATEGORIES = [
  { key: 'Calendars', label: 'Economic Calendars', icon: Calendar, color: 'text-warning' },
  { key: 'News', label: 'Financial News', icon: Newspaper, color: 'text-accent' },
  { key: 'Tools', label: 'Market Tools', icon: Wrench, color: 'text-profit' },
  { key: 'Education', label: 'Education', icon: GraduationCap, color: 'text-text-secondary' },
]

// ─── Storage helpers ──────────────────────────────────────────────────────────

const CUSTOM_LINKS_KEY = 'tj_custom_news_links'

function loadCustomLinks(): CustomLink[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_LINKS_KEY) || '[]') } catch { return [] }
}

function persistCustomLinks(links: CustomLink[]): void {
  localStorage.setItem(CUSTOM_LINKS_KEY, JSON.stringify(links))
}

// ─── Open link via Tauri opener (falls back to window.open in browser mode) ──

async function openLink(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// ─── Link Card ────────────────────────────────────────────────────────────────

function LinkCard({ name, url, description }: { name: string; url: string; description: string }) {
  const hostname = (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return url } })()
  return (
    <button
      onClick={() => openLink(url)}
      className="flex flex-col gap-1.5 bg-bg-secondary border border-border rounded-lg p-4 text-left hover:border-accent/50 hover:bg-bg-hover transition-colors group w-full"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm text-text-primary group-hover:text-accent transition-colors leading-tight">
          {name}
        </span>
        <ExternalLink size={13} className="text-text-muted group-hover:text-accent transition-colors shrink-0 mt-0.5" />
      </div>
      <p className="text-xs text-text-muted leading-relaxed">{description}</p>
      <p className="text-[10px] text-text-muted/60 mt-0.5">{hostname}</p>
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function News() {
  const [customLinks, setCustomLinks] = useState<CustomLink[]>(loadCustomLinks)
  const [addForm, setAddForm] = useState({ name: '', url: '' })
  const [showAddForm, setShowAddForm] = useState(false)
  const [addError, setAddError] = useState('')

  const handleAddLink = () => {
    const name = addForm.name.trim()
    let url = addForm.url.trim()

    if (!name) { setAddError('Name is required'); return }
    if (!url) { setAddError('URL is required'); return }

    // Auto-prepend https:// if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url

    try { new URL(url) } catch { setAddError('Enter a valid URL'); return }

    const newLink: CustomLink = { id: `cl-${Date.now()}`, name, url, created_at: new Date().toISOString() }
    const updated = [...customLinks, newLink]
    setCustomLinks(updated)
    persistCustomLinks(updated)
    setAddForm({ name: '', url: '' })
    setShowAddForm(false)
    setAddError('')
  }

  const handleDeleteLink = (id: string) => {
    const updated = customLinks.filter(l => l.id !== id)
    setCustomLinks(updated)
    persistCustomLinks(updated)
  }

  return (
    <div className="p-6 space-y-7 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">News & Resources</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Links open in your system browser. Check these before the market opens.
        </p>
      </div>

      {/* ── Curated links by category ── */}
      {CATEGORIES.map(cat => {
        const links = DEFAULT_LINKS.filter(l => l.category === cat.key)
        const Icon = cat.icon
        return (
          <div key={cat.key}>
            <div className="flex items-center gap-2 mb-3">
              <Icon size={15} className={cat.color} />
              <h2 className="text-sm font-semibold text-text-primary">{cat.label}</h2>
              <div className="flex-1 h-px bg-border ml-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {links.map(link => (
                <LinkCard key={link.id} name={link.name} url={link.url} description={link.description} />
              ))}
            </div>
          </div>
        )
      })}

      {/* ── Custom Links (10.3) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-text-primary">My Links</h2>
          <div className="flex-1 h-px bg-border mx-1" />
          <button
            onClick={() => { setShowAddForm(f => !f); setAddError(''); setAddForm({ name: '', url: '' }) }}
            className="flex items-center gap-1.5 text-xs text-accent hover:underline underline-offset-2"
          >
            <Plus size={13} />
            Add link
          </button>
        </div>

        {/* Add link form */}
        {showAddForm && (
          <div className="bg-bg-card border border-border rounded-lg p-4 mb-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Name</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={e => { setAddForm(f => ({ ...f, name: e.target.value })); setAddError('') }}
                  placeholder="My Broker"
                  className="input text-sm"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">URL</label>
                <input
                  type="text"
                  value={addForm.url}
                  onChange={e => { setAddForm(f => ({ ...f, url: e.target.value })); setAddError('') }}
                  placeholder="https://..."
                  className="input text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                />
              </div>
            </div>
            {addError && <p className="text-xs text-loss">{addError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowAddForm(false); setAddError('') }}
                className="btn-secondary text-sm py-1.5 px-3"
              >
                Cancel
              </button>
              <button onClick={handleAddLink} className="btn-primary text-sm py-1.5 px-4">
                Add Link
              </button>
            </div>
          </div>
        )}

        {customLinks.length === 0 && !showAddForm && (
          <p className="text-text-muted text-sm py-4 text-center bg-bg-card border border-border rounded-lg">
            No custom links yet.{' '}
            <button onClick={() => setShowAddForm(true)} className="text-accent hover:underline underline-offset-2">
              Add your first link →
            </button>
          </p>
        )}

        {customLinks.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {customLinks.map(link => {
              const hostname = (() => { try { return new URL(link.url).hostname.replace('www.', '') } catch { return link.url } })()
              return (
                <div
                  key={link.id}
                  className="relative flex flex-col gap-1.5 bg-bg-secondary border border-border rounded-lg p-4 group"
                >
                  <button
                    onClick={() => openLink(link.url)}
                    className="flex items-start justify-between gap-2 text-left w-full"
                  >
                    <span className="font-semibold text-sm text-text-primary group-hover:text-accent transition-colors">
                      {link.name}
                    </span>
                    <ExternalLink size={13} className="text-text-muted group-hover:text-accent transition-colors shrink-0 mt-0.5" />
                  </button>
                  <p className="text-[10px] text-text-muted/60">{hostname}</p>
                  <button
                    onClick={() => handleDeleteLink(link.id)}
                    className="absolute top-2 right-8 p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-loss hover:bg-loss/10 rounded transition-all"
                    title="Remove link"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
