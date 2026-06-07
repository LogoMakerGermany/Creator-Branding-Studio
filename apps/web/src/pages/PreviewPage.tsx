import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';

const PLATFORMS = [
  { id: 'twitch', label: 'Twitch', color: '#9146FF' },
  { id: 'kick', label: 'Kick', color: '#53FC18' },
  { id: 'discord', label: 'Discord', color: '#5865F2' },
  { id: 'youtube', label: 'YouTube', color: '#FF0000' },
  { id: 'tiktok', label: 'TikTok', color: '#00F5FF' },
];

export function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: assets = [] } = useQuery({
    queryKey: ['assets', id],
    queryFn: async () => (await api.get(`/projects/${id}/assets`)).data,
  });

  const banner = assets.find((a: { assetType: string }) => a.assetType === 'banner');
  const logo = assets.find((a: { assetType: string }) => a.assetType === 'logo');

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Asset Vorschau</h1>
      <p className="mt-2 text-white/50">Branding direkt auf Plattform-Mockups.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {PLATFORMS.map(p => (
          <GlassCard key={p.id} glow="cyan">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="font-semibold">{p.label}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-3">
              <div className="relative h-32" style={{ background: `linear-gradient(135deg, ${p.color}33, #0d0d14)` }}>
                {banner?.fileName && (
                  <img src={`/api/projects/${id}/assets/${banner.fileName}`} alt="" className="h-full w-full object-cover opacity-80" />
                )}
              </div>
              <div className="flex items-center gap-3 p-3">
                <div className="h-12 w-12 overflow-hidden rounded-full border-2" style={{ borderColor: p.color }}>
                  {logo?.fileName ? (
                    <img src={`/api/projects/${id}/assets/${logo.fileName}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs">Logo</div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">Dein Kanal</p>
                  <p className="text-xs text-white/40">{p.label} Mockup</p>
                </div>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
