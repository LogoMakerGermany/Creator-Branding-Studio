import { NavLink, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Coins } from 'lucide-react';
import { cn, formatCoins } from '@/lib/utils';
import { PRIMARY_NAV } from '@/v2/config/navigation';
import { useUiStore } from '@/v2/store/ui-store';
import { useAuth } from '@/context/AuthContext';
import { NexterMark } from '@/components/nexter/NexterMark';
import { isAdminRole, UserRole } from '@ucbs/shared';

const GROUPS: { id: 'core' | 'studios' | 'library'; label?: string }[] = [
  { id: 'core' },
  { id: 'studios' },
  { id: 'library' },
];

export function SidebarNav() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUiStore();
  const { user } = useAuth();
  const showAdmin = user?.role && isAdminRole(user.role as UserRole);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/5 bg-[var(--ucbs-bg)]/95 backdrop-blur-xl transition-all duration-300 lg:static',
        sidebarCollapsed ? 'w-[72px]' : 'w-64',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-white/5 px-3', sidebarCollapsed ? 'justify-center' : 'gap-2')}>
        <NexterMark size={sidebarCollapsed ? 32 : 40} />
        {!sidebarCollapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold tracking-wide text-white">NEXTER</p>
            <p className="truncate text-[10px] uppercase tracking-[0.16em] text-violet-300">Creator Studio</p>
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

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {GROUPS.map((group) => (
          <div key={group.id} className="space-y-1">
            {PRIMARY_NAV.filter((item) => item.group === group.id).map((item) => {
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
                        ? 'bg-gradient-to-r from-violet-600/25 to-fuchsia-600/15 text-white shadow-[0_0_24px_-8px_rgba(168,85,247,0.5)]'
                        : 'text-zinc-400 hover:bg-[var(--ucbs-hover)] hover:text-white',
                      sidebarCollapsed && 'justify-center px-2'
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                          {item.badge}
                        </span>
                      )}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
        {showAdmin && (
          <NavLink
            to="/admin"
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 hover:bg-[var(--ucbs-hover)] hover:text-white',
                isActive && 'bg-white/10 text-white',
                sidebarCollapsed && 'justify-center px-2'
              )
            }
          >
            <span className="text-xs font-bold">AD</span>
            {!sidebarCollapsed && <span>Admin</span>}
          </NavLink>
        )}
      </nav>

      <div className={cn('border-t border-white/5 p-3', sidebarCollapsed && 'px-2')}>
        {!sidebarCollapsed ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Deine Coins</p>
            <div className="mt-1 flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="font-display text-lg font-bold text-white">{formatCoins(user?.coinBalance ?? 0)}</span>
            </div>
            <Link
              to="/coins"
              onClick={() => setMobileNavOpen(false)}
              className="mt-3 block rounded-lg bg-violet-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-violet-500"
            >
              Coins aufladen
            </Link>
          </div>
        ) : (
          <Link to="/coins" className="flex justify-center text-amber-400" aria-label="Coins">
            <Coins className="h-5 w-5" />
          </Link>
        )}
      </div>
    </aside>
  );
}
