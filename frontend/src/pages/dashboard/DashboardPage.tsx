import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Dna, FolderOpen, TrendingUp } from 'lucide-react';
import { PageHeader, StatCard, Badge, Button } from '@/components/ui';
import { DnaHubGrid } from '@/components/hub';
import { useAuth } from '@/context/AuthContext';
import { formatCoins } from '@/lib/utils';
import { api } from '@/services/api';

export function DashboardPage() {
  const { user, activeDna } = useAuth();
  const [stats, setStats] = useState({ generations: 0, projects: 0, files: 0 });

  useEffect(() => {
    api.auth.stats().then(setStats).catch(() => undefined);
  }, []);

  return (
    <div>
      <PageHeader
        title={`Willkommen, ${user?.displayName ?? 'Creator'}`}
        description="Creator DNA Engine — dein Branding-Zentrum"
        badge={<Badge variant="brand">Release v1.0</Badge>}
        actions={
          <Link to="/creator-dna">
            <Button className="gap-2">
              <Dna className="h-4 w-4" />
              {activeDna ? 'DNA ansehen' : 'Creator DNA starten'}
            </Button>
          </Link>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Coin-Guthaben" value={formatCoins(user?.coinBalance ?? 0)} icon={<Coins className="h-5 w-5" />} />
        <StatCard label="Projekte" value={String(stats.projects)} icon={<FolderOpen className="h-5 w-5" />} />
        <StatCard label="DNA" value={activeDna?.name ?? '—'} icon={<Dna className="h-5 w-5" />} />
        <StatCard label="Generierungen" value={String(stats.generations)} icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      {activeDna && (
        <div className="ucbs-neon-card ucbs-neon-card-cyan mb-8 flex flex-wrap items-center gap-4 p-4">
          <div className="flex gap-2">
            {[...activeDna.primaryColors, ...activeDna.secondaryColors].filter(Boolean).map((c) => (
              <div key={c} className="h-10 w-10 rounded-lg border border-zinc-700" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-zinc-100">{activeDna.name}</p>
            <p className="text-sm text-zinc-400">Stil: {activeDna.styleDirection}</p>
          </div>
          <Link to="/logo-studio">
            <Button variant="outline" size="sm">Logo generieren</Button>
          </Link>
        </div>
      )}

      <DnaHubGrid />
    </div>
  );
}
