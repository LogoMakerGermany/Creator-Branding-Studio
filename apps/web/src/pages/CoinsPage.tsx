import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import type { CoinPackage } from '@cbs/shared';

export function CoinsPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  const { data: balance } = useQuery({
    queryKey: ['coins'],
    queryFn: async () => (await api.get('/payments/coins/balance')).data,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => (await api.get('/payments/packages')).data as CoinPackage[],
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['coin-tx'],
    queryFn: async () => (await api.get('/payments/coins/transactions')).data,
  });

  async function checkout(provider: 'stripe' | 'paypal', packageId: string) {
    setLoading(packageId);
    try {
      const { data } = await api.post(`/payments/${provider}/checkout`, { packageId });
      if (data.url.startsWith('http')) window.location.href = data.url;
      else window.location.href = data.url;
      qc.invalidateQueries({ queryKey: ['coins'] });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Coin Shop</h1>
      <p className="mt-2 text-white/50">Coins für Generierungen – Bezahlung via Stripe oder PayPal.</p>

      {params.get('success') && (
        <GlassCard className="mt-4 border-neon-cyan/30" glow="cyan">
          <p className="text-neon-cyan">✓ Zahlung erfolgreich – Coins wurden gutgeschrieben!</p>
        </GlassCard>
      )}

      <GlassCard className="mt-6" glow="pink">
        <p className="text-sm text-white/50">Dein Guthaben</p>
        <p className="font-display text-4xl font-bold text-neon-pink">🪙 {balance?.coins ?? 0} Coins</p>
      </GlassCard>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {packages.map(pkg => (
          <GlassCard key={pkg.id} glow={pkg.popular ? 'purple' : 'none'}>
            {pkg.popular && <span className="text-xs text-neon-purple">Beliebt</span>}
            <h3 className="font-display text-xl font-bold">{pkg.name}</h3>
            <p className="mt-2 text-3xl font-bold text-neon-cyan">{pkg.coins} Coins</p>
            <p className="text-white/50">{pkg.priceEur.toFixed(2)} €</p>
            <div className="mt-4 flex flex-col gap-2">
              <NeonButton onClick={() => checkout('stripe', pkg.id)} loading={loading === pkg.id} className="w-full">
                Stripe
              </NeonButton>
              <NeonButton variant="cyan" onClick={() => checkout('paypal', pkg.id)} loading={loading === pkg.id} className="w-full">
                PayPal
              </NeonButton>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="mt-8">
        <h2 className="font-semibold">Transaktionen</h2>
        <div className="mt-3 space-y-2 text-sm">
          {transactions.map((t: { id: string; type: string; amount: number; reason: string; createdAt: string }) => (
            <div key={t.id} className="flex justify-between rounded bg-white/5 px-3 py-2">
              <span>{t.reason}</span>
              <span className={t.type === 'debit' ? 'text-red-400' : 'text-neon-cyan'}>
                {t.type === 'debit' ? '-' : '+'}{t.amount}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
