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
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { path: "/new-trade", icon: PlusCircle, label: "New Trade", end: false },
  { path: "/trade-log", icon: List, label: "Trade Log", end: false },
  { path: "/review", icon: TrendingUp, label: "Review", end: false },
  { path: "/analytics", icon: BarChart2, label: "Analytics", end: false },
  { path: "/journal", icon: BookOpen, label: "Journal", end: false },
  { path: "/playbook", icon: BookMarked, label: "Playbook", end: false },
  { path: "/news", icon: Newspaper, label: "News", end: false },
  { path: "/ai-analysis", icon: Sparkles, label: "AI Analysis", end: false },
];

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
        <div className="px-2 py-5 border-b border-border flex items-center justify-between min-h-[60px]">
          <div className={`flex items-center gap-2 ${collapsed ? 'mx-auto' : 'pl-2'}`}>
            <div className="w-7 h-7 bg-profit rounded flex items-center justify-center shrink-0">
              <TrendingUp size={14} className="text-bg-primary" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-text-primary text-sm tracking-wide whitespace-nowrap">
                Trade Journal
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={toggle}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map(({ path, icon: Icon, label, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        {/* Settings + expand toggle at bottom */}
        <div className="px-2 py-3 border-t border-border space-y-0.5">
          <NavLink
            to="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`
            }
          >
            <Settings size={16} className="shrink-0" />
            {!collapsed && 'Settings'}
          </NavLink>

          {collapsed && (
            <button
              onClick={toggle}
              title="Expand sidebar"
              className="flex items-center justify-center w-full px-3 py-2 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
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
