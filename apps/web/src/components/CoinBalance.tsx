import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { NeonButton } from './NeonButton';

export function CoinBalance() {
  const { data } = useQuery({
    queryKey: ['coins'],
    queryFn: async () => (await api.get('/payments/coins/balance')).data as { coins: number; testMode: boolean },
    refetchInterval: 30000,
  });

  return (
    <Link to="/coins" className="flex items-center gap-2 rounded-xl border border-neon-pink/30 bg-neon-pink/10 px-3 py-1.5 text-sm">
      <span className="text-neon-pink">🪙 {data?.coins ?? '…'}</span>
      {data?.testMode && <span className="rounded bg-neon-cyan/20 px-1.5 text-[10px] text-neon-cyan">TEST</span>}
      <NeonButton variant="ghost" className="!px-2 !py-0.5 !text-xs">+</NeonButton>
    </Link>
  );
}
