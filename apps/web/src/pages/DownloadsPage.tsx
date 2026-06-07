import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { ASSET_LABELS, type AssetType } from '@cbs/shared';

export function DownloadsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: assets = [] } = useQuery({
    queryKey: ['assets', id],
    queryFn: async () => (await api.get(`/projects/${id}/assets`)).data,
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Downloads</h1>
      <p className="mt-2 text-white/50">Einzel-, Bulk- und ZIP-Downloads sowie OBS-Export.</p>

      <div className="mt-8 flex flex-wrap gap-4">
        <a href={`/api/projects/${id}/downloads/branding-pack`}><NeonButton variant="pink">Branding Pack ZIP</NeonButton></a>
        <a href={`/api/projects/${id}/downloads/zip`}><NeonButton variant="purple">Alles als ZIP</NeonButton></a>
        <a href={`/api/projects/${id}/downloads/stickers-zip`}><NeonButton variant="cyan">Sticker ZIP</NeonButton></a>
        <a href={`/api/projects/${id}/downloads/obs`}><NeonButton variant="purple">OBS Export</NeonButton></a>
      </div>

      <GlassCard className="mt-8" glow="cyan">
        <h2 className="font-semibold">Einzelne Assets ({assets.length})</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a: { id: string; assetType: AssetType; fileName: string }) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <img src={`/api/projects/${id}/assets/${a.fileName}`} alt="" className="h-12 w-12 rounded object-contain" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{ASSET_LABELS[a.assetType] || a.assetType}</p>
                <p className="truncate text-xs text-white/40">{a.fileName}</p>
              </div>
              <a href={`/api/projects/${id}/assets/${a.fileName}`} download>
                <NeonButton variant="ghost" className="!px-3 !py-1.5 text-xs">↓</NeonButton>
              </a>
            </div>
          ))}
          {assets.length === 0 && <p className="text-white/40">Noch keine Assets generiert.</p>}
        </div>
      </GlassCard>
    </div>
  );
}
