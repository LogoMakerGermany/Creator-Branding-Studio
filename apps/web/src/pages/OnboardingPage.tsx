import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';

export function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name && !file) { setError('Bitte Name oder Logo angeben'); return; }
    setLoading(true);
    setError('');
    try {
      const { data: project } = await api.post('/projects', { name: name || 'Mein Brand' });
      const form = new FormData();
      if (name) form.append('name', name);
      if (file) form.append('file', file);
      await api.post(`/projects/${project.id}/dna/extract`, form);
      navigate(`/projects/${project.id}/dna`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-bold text-gradient">Neues Branding-Projekt</h1>
      <p className="mt-2 text-white/50">Gib einen Namen, ein Logo oder eine Grafik ein – wir erstellen deine Brand-DNA.</p>

      <GlassCard className="mt-8" glow="pink">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm text-white/60">Markenname</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Team Neon"
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-3 outline-none focus:border-neon-pink" />
          </div>
          <div>
            <label className="text-sm text-white/60">Logo / Grafik (optional)</label>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="mt-1 w-full text-sm text-white/60 file:mr-4 file:rounded-lg file:border-0 file:bg-neon-purple/20 file:px-4 file:py-2 file:text-neon-purple" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <NeonButton type="submit" loading={loading} className="w-full">DNA erstellen & starten</NeonButton>
        </form>
      </GlassCard>
    </div>
  );
}
