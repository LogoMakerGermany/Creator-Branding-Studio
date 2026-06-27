import { Link } from 'react-router-dom';
import { Coins, Search, User, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatCoins } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, activeDna, logout } = useAuth();

  return (
    <header className="flex h-16 items-center gap-3 border-b border-zinc-800 bg-surface-950/80 px-4 backdrop-blur-sm sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 lg:hidden"
        aria-label="Menü öffnen"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative min-w-0 flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          placeholder="Suchen…"
          className="w-full rounded-lg border border-zinc-800 bg-surface-900 py-2 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {activeDna && (
          <Link
            to="/creator-dna"
            className="hidden items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-700 md:flex"
          >
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="max-w-[100px] truncate">{activeDna.name}</span>
          </Link>
        )}

        <Link to="/coins">
          <Button variant="outline" size="sm" className="gap-1.5 px-2 sm:px-3">
            <Coins className="h-4 w-4" />
            <span className="hidden sm:inline">{formatCoins(user?.coinBalance ?? 0)} Coins</span>
            <span className="sm:hidden">Coins</span>
          </Button>
        </Link>

        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-2 rounded-lg border border-zinc-800 bg-surface-900 px-3 py-1.5 text-sm sm:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600/30 text-brand-300">
              <User className="h-4 w-4" />
            </div>
            <span className="max-w-[120px] truncate text-zinc-300">
              {user?.displayName ?? 'Creator'}
            </span>
          </div>
          <button
            onClick={() => logout()}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
