import { useState } from 'react'
import { NavLink, Outlet } from "react-router-dom";
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
} from "lucide-react";

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

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('tj_sidebar_collapsed') === 'true'
  )

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('tj_sidebar_collapsed', String(next))
  }

  return (
    <div className="flex h-full bg-bg-primary">
      {/* Sidebar */}
      <aside
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
        <nav className="flex-1 px-2 py-2 overflow-y-auto overflow-x-hidden">
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
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
