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
];

export default function Layout() {
  return (
    <div className="flex h-full bg-bg-primary">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-bg-secondary border-r border-border flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-profit rounded flex items-center justify-center">
              <TrendingUp size={14} className="text-bg-primary" />
            </div>
            <span className="font-semibold text-text-primary text-sm tracking-wide">
              Trade Journal
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Settings at bottom */}
        <div className="px-2 py-3 border-t border-border">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`
            }
          >
            <Settings size={16} />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
