import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV } from '@/v2/config/navigation';
import { useUiStore } from '@/v2/store/ui-store';

export function SidebarNav() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/5 bg-[var(--ucbs-bg)]/95 backdrop-blur-xl transition-all duration-300 lg:static',
        sidebarCollapsed ? 'w-[72px]' : 'w-64',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-white/5 px-4', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold tracking-wide text-white">ULTIMATE</p>
            <p className="truncate text-[10px] uppercase tracking-[0.2em] text-[var(--ucbs-accent-cyan)]">Creator Studio</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden rounded-lg p-1.5 text-zinc-400 hover:bg-[var(--ucbs-hover)] hover:text-white lg:flex"
          aria-label={sidebarCollapsed ? 'Sidebar erweitern' : 'Sidebar einklappen'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-gradient-to-r from-[var(--ucbs-accent-cyan)]/15 to-[var(--ucbs-accent-purple)]/10 text-white shadow-[0_0_24px_-8px_rgba(34,211,238,0.4)]'
                    : 'text-zinc-400 hover:bg-[var(--ucbs-hover)] hover:text-white',
                  sidebarCollapsed && 'justify-center px-2'
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
