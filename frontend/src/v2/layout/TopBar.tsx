import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Menu, Coins, Crown, User, LogOut, FolderKanban } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatCoins } from '@/lib/utils';
import { useUiStore } from '@/v2/store/ui-store';
import { useProjectStore } from '@/v2/store/project-store';
import { api } from '@/services/api';
import { PRIMARY_NAV, BRANDING_MODULES, AI_CREATOR_MODULES } from '@/v2/config/navigation';

const SEARCH_ITEMS = [
  ...PRIMARY_NAV.map((n) => ({ title: n.label, path: n.path })),
  ...BRANDING_MODULES.map((m) => ({ title: m.title, path: m.path })),
  ...AI_CREATOR_MODULES.map((m) => ({ title: m.title, path: m.path })),
  { title: 'Ultimate Creator', path: '/ultimate-creator' },
  { title: 'Export Center', path: '/export-center' },
];

export function TopBar() {
  const { user, logout } = useAuth();
  const { setMobileNavOpen, searchOpen, setSearchOpen } = useUiStore();
  const { projects, activeProjectId, setProjects, setActiveProjectId, activeProject } = useProjectStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.ultimateCreator.listProjects().then(setProjects).catch(() => {});
  }, [setProjects]);

  const currentProject = activeProject();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_ITEMS.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/5 bg-[var(--ucbs-bg)]/80 px-4 backdrop-blur-xl sm:px-6">
      <button
        type="button"
        className="rounded-lg p-2 text-zinc-400 hover:bg-[var(--ucbs-hover)] lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Menü öffnen"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          placeholder="Module suchen…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          className="w-full rounded-xl border border-white/8 bg-[var(--ucbs-card)] py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 focus:border-[var(--ucbs-accent-cyan)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--ucbs-accent-cyan)]/30"
        />
        {searchOpen && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[var(--ucbs-card)] shadow-2xl">
            {results.map((r) => (
              <button
                key={r.path}
                type="button"
                className="block w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-[var(--ucbs-hover)]"
                onMouseDown={() => {
                  navigate(r.path);
                  setQuery('');
                  setSearchOpen(false);
                }}
              >
                {r.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {projects.length > 0 && (
        <div className="hidden items-center gap-1.5 md:flex">
          <FolderKanban className="h-4 w-4 text-zinc-500" />
          <select
            value={activeProjectId ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              setActiveProjectId(id);
              navigate(`/export-center?project=${id}`);
            }}
            className="max-w-[140px] truncate rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-2 py-1.5 text-xs text-zinc-300 focus:outline-none lg:max-w-[180px]"
            aria-label="Aktives Projekt"
          >
            {!activeProjectId && <option value="">Projekt…</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {currentProject && (
            <span className="hidden text-[10px] text-zinc-600 lg:inline">{currentProject.status}</span>
          )}
        </div>
      )}

      <Link
        to="/coins"
        className="hidden items-center gap-1.5 rounded-xl border border-[var(--ucbs-accent-purple)]/30 bg-[var(--ucbs-accent-purple)]/10 px-3 py-1.5 text-sm font-medium text-[var(--ucbs-accent-purple)] sm:flex"
      >
        <Coins className="h-4 w-4" />
        {formatCoins(user?.coinBalance ?? 0)}
      </Link>

      <div className="hidden items-center gap-1 rounded-xl border border-[var(--ucbs-accent-green)]/25 bg-[var(--ucbs-accent-green)]/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ucbs-accent-green)] sm:flex">
        <Crown className="h-3.5 w-3.5" />
        Creator
      </div>

      <div className="relative group">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[var(--ucbs-card)] text-zinc-300"
          aria-label="Profil"
        >
          <User className="h-4 w-4" />
        </button>
        <div className="invisible absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-white/10 bg-[var(--ucbs-card)] py-1 opacity-0 shadow-xl transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
          <div className="border-b border-white/5 px-4 py-2">
            <p className="truncate text-sm font-medium text-white">{user?.displayName}</p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>
          <Link to="/settings" className="block px-4 py-2 text-sm text-zinc-300 hover:bg-[var(--ucbs-hover)]">
            Einstellungen
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-[var(--ucbs-hover)]"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </button>
        </div>
      </div>
    </header>
  );
}
