import { useState, useEffect } from 'react'
import { NavLink, Outlet } from "react-router-dom";
import { useToast } from './Toast'
import {
  LayoutDashboard,
  PlusCircle,
  List,
  TrendingUp,
  BarChart2,
  BookOpen,
  BookMarked,
  Newspaper,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FlaskConical,
  Zap,
} from "lucide-react";
import QuickTradeModal from './QuickTradeModal'

const NAV_GROUPS = [
  {
    label: 'Trading',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
      { path: '/new-trade', icon: PlusCircle, label: 'New Trade', end: false },
      { path: '/trade-log', icon: List, label: 'Trade Log', end: false },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { path: '/review', icon: TrendingUp, label: 'Review', end: false },
      { path: '/analytics', icon: BarChart2, label: 'Analytics', end: false },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/journal', icon: BookOpen, label: 'Journal', end: false },
      { path: '/playbook', icon: BookMarked, label: 'Playbook', end: false },
      { path: '/ai-analysis', icon: Sparkles, label: 'AI Analysis', end: false },
      { path: '/simulator', icon: FlaskConical, label: 'Simulator', end: false },
      { path: '/news', icon: Newspaper, label: 'News', end: false },
    ],
  },
]

function NavItem({
  path, icon: Icon, label, end, collapsed,
}: {
  path: string; icon: React.ElementType; label: string; end: boolean; collapsed: boolean
}) {
  return (
    <NavLink
      to={path}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-accent/10 text-accent font-medium'
            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={`shrink-0 ${isActive ? 'text-accent' : ''}`} />
          {!collapsed && label}
        </>
      )}
    </NavLink>
  )
}

// ─── Sync status ──────────────────────────────────────────────────────────────

const SYNC_STATUS_KEY = 'tj_sync_status'

type SyncState = { status: 'ok' | 'error'; ts: number }

function loadSyncState(): SyncState | null {
  try {
    const raw = localStorage.getItem(SYNC_STATUS_KEY)
    return raw ? (JSON.parse(raw) as SyncState) : null
  } catch {
    return null
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('tj_sidebar_collapsed') === 'true'
  )
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const { showToast } = useToast()

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('tj_sidebar_collapsed', String(next))
  }

  const [syncState, setSyncState] = useState<SyncState | null>(() => loadSyncState())
  const [, setTick] = useState(0) // triggers re-render to update "X min ago"

  useEffect(() => {
    const onSynced = () => {
      const s: SyncState = { status: 'ok', ts: Date.now() }
      localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(s))
      setSyncState(s)
      showToast('Synced successfully', 'success')
    }
    const onError = () => {
      const s: SyncState = { status: 'error', ts: Date.now() }
      localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(s))
      setSyncState(s)
      showToast('Sync failed', 'error')
    }
    window.addEventListener('tj:synced', onSynced)
    window.addEventListener('tj:sync-error', onError)
    return () => {
      window.removeEventListener('tj:synced', onSynced)
      window.removeEventListener('tj:sync-error', onError)
    }
  // showToast is stable (useCallback) — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast])

  useEffect(() => {
    if (!syncState) return
    const timer = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(timer)
  }, [syncState])

  return (
    <div className="flex h-full bg-bg-primary">
      {/* Sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className={`flex-shrink-0 bg-bg-secondary border-r border-border flex flex-col transition-[width] duration-200 overflow-hidden ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="px-2 py-4 border-b border-border flex items-center justify-between min-h-[56px]">
          <div className={`flex items-center gap-2.5 ${collapsed ? 'mx-auto' : 'pl-1.5'}`}>
            <div className="w-8 h-8 bg-profit rounded-lg flex items-center justify-center shrink-0 shadow-profit-glow">
              <TrendingUp size={15} className="text-white" strokeWidth={2.5} />
            </div>
            {!collapsed && (
              <span className="font-semibold text-text-primary text-sm tracking-tight whitespace-nowrap">
                Trade Journal
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={toggle}
              className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav aria-label="Main navigation" className="flex-1 px-2 py-2 overflow-y-auto overflow-x-hidden">
          {/* Quick Entry button */}
          <div className="mb-2">
            <button
              onClick={() => setQuickEntryOpen(true)}
              title={collapsed ? 'Quick Entry' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all w-full
                ${collapsed ? 'justify-center' : ''}
                text-accent hover:bg-accent/10`}
            >
              <Zap size={16} className="shrink-0" />
              {!collapsed && <span className="font-medium">Quick Entry</span>}
            </button>
          </div>

          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
              {!collapsed && (
                <p className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted select-none">
                  {group.label}
                </p>
              )}
              {collapsed && gi > 0 && (
                <div className="my-2 mx-2 h-px bg-border" />
              )}
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavItem key={item.path} {...item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sync status indicator */}
        {syncState && !collapsed && (
          <div className="px-4 pb-2 flex items-center gap-1.5">
            <span className={`text-[8px] leading-none ${syncState.status === 'ok' ? 'text-profit' : 'text-loss'}`}>●</span>
            <span className="text-[11px] text-text-muted">
              {syncState.status === 'ok' ? `Synced ${timeAgo(syncState.ts)}` : 'Sync error'}
            </span>
          </div>
        )}
        {syncState && collapsed && (
          <div
            className="flex justify-center pb-2"
            title={syncState.status === 'ok' ? `Synced ${timeAgo(syncState.ts)}` : 'Sync error'}
          >
            <span className={`text-[8px] leading-none ${syncState.status === 'ok' ? 'text-profit' : 'text-loss'}`}>●</span>
          </div>
        )}

        {/* Settings + expand at bottom */}
        <div className="px-2 py-2 border-t border-border space-y-0.5">
          <NavLink
            to="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Settings size={16} className={`shrink-0 ${isActive ? 'text-accent' : ''}`} />
                {!collapsed && 'Settings'}
              </>
            )}
          </NavLink>

          {collapsed && (
            <button
              onClick={toggle}
              title="Expand sidebar"
              className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main aria-label="Main content" className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {quickEntryOpen && <QuickTradeModal onClose={() => setQuickEntryOpen(false)} />}
    </div>
  );
}
