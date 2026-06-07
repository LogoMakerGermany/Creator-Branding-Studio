import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BrandDNA, StreamingPlatform } from '@cbs/shared';
import { STREAM_PLATFORM_LABELS } from '@cbs/shared';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { DNABadge, StyleLockToggle } from '../components/DNABadge';
import { MagicPromptInfo } from '../components/PlatformTools';

export function DnaPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [styleName, setStyleName] = useState('');

  const { data: dna, isLoading } = useQuery({
    queryKey: ['dna', id],
    queryFn: async () => (await api.get(`/projects/${id}/dna`)).data as BrandDNA,
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<BrandDNA>) => api.put(`/projects/${id}/dna`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dna', id] }),
  });

  const saveStyle = useMutation({
    mutationFn: (name: string) => api.post(`/projects/${id}/dna/styles`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dna', id] }),
  });

  const applyStyle = useMutation({
    mutationFn: (styleId: string) => api.post(`/projects/${id}/dna/styles/${styleId}/apply`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dna', id] }),
  });

  if (isLoading || !dna) return <div className="text-white/50">Lade DNA-Profil…</div>;

  function togglePlatform(p: StreamingPlatform) {
    const prefs = dna!.platformPreferences.includes(p)
      ? dna!.platformPreferences.filter(x => x !== p)
      : [...dna!.platformPreferences, p];
    mutation.mutate({ platformPreferences: prefs });
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Brand DNA – Style-Speicherung</h1>
      <p className="mt-2 text-white/50">Persistente Marken-DNA für alle Generatoren und die Magic Prompt Engine.</p>

      <GlassCard className="mt-6" glow="purple">
        <DNABadge dna={dna} />
        <StyleLockToggle locked={dna.styleLocked} onChange={v => mutation.mutate({ styleLocked: v })} />
        <div className="mt-4"><MagicPromptInfo /></div>
      </GlassCard>

      <GlassCard className="mt-6" glow="cyan">
        <h3 className="font-semibold">Streaming-Plattformen (Twitch / Kick / YouTube)</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['twitch', 'kick', 'youtube'] as StreamingPlatform[]).map(p => (
            <button key={p} onClick={() => togglePlatform(p)}
              className={`rounded-xl border px-4 py-2 text-sm ${dna.platformPreferences.includes(p) ? 'border-neon-cyan bg-neon-cyan/20 text-neon-cyan' : 'border-white/10 text-white/50'}`}>
              {STREAM_PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="mt-6" glow="pink">
        <h3 className="font-semibold">Gespeicherte Style-Profile</h3>
        <div className="mt-3 flex gap-2">
          <input value={styleName} onChange={e => setStyleName(e.target.value)} placeholder="Stil-Name…"
            className="flex-1 rounded-lg border border-white/10 bg-surface-3 px-3 py-2 text-sm" />
          <NeonButton onClick={() => { saveStyle.mutate(styleName || 'Neuer Stil'); setStyleName(''); }}>Speichern</NeonButton>
        </div>
        <div className="mt-4 space-y-2">
          {(dna.savedStyleProfiles || []).map(s => (
            <div key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
              <span>{s.name} · {s.brandingStyle.slice(0, 40)}…</span>
              <NeonButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => applyStyle.mutate(s.id)}>Anwenden</NeonButton>
            </div>
          ))}
          {!dna.savedStyleProfiles?.length && <p className="text-white/40 text-sm">Noch keine Stile gespeichert.</p>}
        </div>
      </GlassCard>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <GlassCard>
          <h3 className="font-semibold text-neon-pink">Primärfarben</h3>
          <ColorList colors={dna.primaryColors} onChange={c => mutation.mutate({ primaryColors: c })} />
        </GlassCard>
        <GlassCard>
          <h3 className="font-semibold text-neon-cyan">Akzentfarben</h3>
          <ColorList colors={dna.accentColors} onChange={c => mutation.mutate({ accentColors: c })} />
        </GlassCard>
        <GlassCard>
          <h3 className="font-semibold">Branding-Stil</h3>
          <input value={dna.brandingStyle} onChange={e => mutation.mutate({ brandingStyle: e.target.value })}
            className="mt-2 w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2 text-sm" />
        </GlassCard>
        <GlassCard>
          <h3 className="font-semibold">Eigenschaften</h3>
          <div className="mt-2 space-y-2 text-sm text-white/60">
            <p>Glow: {dna.glowStrength} | Neon: {dna.neonStrength}</p>
            <p>Licht: {dna.lightBehavior}</p>
            <p>Textur: {dna.textureBehavior}</p>
            <p>Fonts: {dna.fonts.heading} / {dna.fonts.body}</p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function ColorList({ colors, onChange }: { colors: string[]; onChange: (c: string[]) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {colors.map((c, i) => (
        <input key={i} type="color" value={c} onChange={e => {
          const next = [...colors];
          next[i] = e.target.value;
          onChange(next);
        }} className="h-10 w-10 cursor-pointer rounded-lg border-0 bg-transparent" />
      ))}
    </div>
  );
}
