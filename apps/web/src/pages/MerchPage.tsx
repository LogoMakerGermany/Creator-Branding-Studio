import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';

const PRODUCTS = [
  { id: 'hoodie', label: 'Hoodie', emoji: '🧥' },
  { id: 'tshirt', label: 'T-Shirt', emoji: '👕' },
  { id: 'mug', label: 'Tasse', emoji: '☕' },
  { id: 'mousepad', label: 'Mousepad', emoji: '🖱' },
  { id: 'sticker', label: 'Sticker', emoji: '🏷' },
  { id: 'poster', label: 'Poster', emoji: '🖼' },
];

export function MerchPage() {
  const { id } = useParams<{ id: string }>();
  const { data: assets = [] } = useQuery({
    queryKey: ['assets', id],
    queryFn: async () => (await api.get(`/projects/${id}/assets`)).data,
  });

  const merch = assets.find((a: { assetType: string }) => a.assetType === 'merchandise');
  const logo = assets.find((a: { assetType: string }) => a.assetType === 'logo');

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Merchandise Studio</h1>
      <p className="mt-2 text-white/50">Automatische Vorschau auf Produkte im DNA-Stil.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map(p => (
          <GlassCard key={p.id} glow="purple">
            <div className="flex flex-col items-center py-6">
              <span className="text-5xl">{p.emoji}</span>
              <p className="mt-3 font-semibold">{p.label}</p>
              <div className="relative mt-4 flex h-32 w-32 items-center justify-center rounded-xl bg-white/5">
                {(merch || logo)?.fileName && (
                  <img src={`/api/projects/${id}/assets/${(merch || logo).fileName}`} alt=""
                    className="max-h-24 max-w-24 object-contain opacity-90" />
                )}
              </div>
              <p className="mt-2 text-xs text-white/40">DNA-Vorschau</p>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
