import { NavLink } from 'react-router-dom';
import { Sparkles, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigationGroups, getModuleIcon } from '@/config/navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen = false, onMobileClose }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-zinc-800 bg-surface-950 transition-all duration-300',
        'fixed inset-y-0 left-0 z-50 w-64 -translate-x-full lg:relative lg:z-auto lg:translate-x-0',
        mobileOpen && 'translate-x-0',
        collapsed ? 'lg:w-[72px]' : 'lg:w-64'
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        {(!collapsed || mobileOpen) && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-zinc-100">UCBS</p>
            <p className="truncate text-[10px] text-zinc-500">Branding Studio</p>
          </div>
        )}
        <button
          type="button"
          onClick={onMobileClose}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 lg:hidden"
          aria-label="Menü schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {navigationGroups.map((group) => (
          <div key={group.label} className="mb-6">
            {(!collapsed || mobileOpen) && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = getModuleIcon(item.icon);
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      onClick={onMobileClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-brand-600/15 text-brand-300'
                            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                        )
                      }
                      title={collapsed && !mobileOpen ? item.name : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {(!collapsed || mobileOpen) && (
                        <span className="truncate">{item.name}</span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <button
        onClick={onToggle}
        className="hidden h-12 items-center justify-center border-t border-zinc-800 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 lg:flex"
        aria-label={collapsed ? 'Sidebar erweitern' : 'Sidebar einklappen'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
