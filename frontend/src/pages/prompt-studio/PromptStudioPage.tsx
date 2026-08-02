import { useEffect, useState } from 'react';
import { Copy, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader, Badge, Button, NeonCard, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { DnaRequiredBanner } from '@/v2/components/StudioAlerts';

const PURPOSES = [
  'logo',
  'banner',
  'overlay',
  'facecam',
  'short vertical video',
  'tiktok clip',
  'youtube thumbnail',
  'trailer',
  'ad creative',
] as const;

export function PromptStudioPage() {
  const { activeDna } = useAuth();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<string>('logo');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<
    { provider: string; label: string; prompt: string; notes: string }[]
  >([]);
  const [sets, setSets] = useState<
    { id: string; title: string; purpose: string; createdAt: string }[]
  >([]);

  async function refreshSets() {
    const { sets: list } = await api.prompts.list();
    setSets(list.map((s) => ({ id: s.id, title: s.title, purpose: s.purpose, createdAt: s.createdAt })));
  }

  useEffect(() => {
    refreshSets().catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    if (!title.trim()) {
      setError('Titel erforderlich');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.prompts.generate({
        title: title.trim(),
        purpose,
        topic: topic.trim() || undefined,
        save: true,
      });
      setProviders(res.providers);
      await refreshSets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    await api.prompts.delete(id);
    await refreshSets();
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div>
      <PageHeader
        title="Prompt Studio"
        description="DNA-basierte Prompts für ChatGPT, Flux, Runway, Midjourney, Imagen und Gemini"
        badge={<Badge variant="brand">UCBS</Badge>}
      />

      {!activeDna && <DnaRequiredBanner />}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title="Prompt-Set erzeugen">
          <div className="mt-4 space-y-3">
            <Input label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Twitch Logo Pack" />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Zweck</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100"
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Thema (optional)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="z.B. neon wolf clan emblem"
            />
            <Button className="gap-2" onClick={handleGenerate} loading={loading} disabled={!activeDna}>
              <Sparkles className="h-4 w-4" />
              Prompts generieren
            </Button>
          </div>
        </NeonCard>

        <NeonCard accent="purple" title="Gespeicherte Sets">
          <div className="mt-4 space-y-2">
            {sets.length === 0 && <p className="text-sm text-zinc-500">Noch keine Prompt-Sets</p>}
            {sets.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-zinc-200">{s.title}</p>
                  <p className="text-xs text-zinc-500">{s.purpose}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleDelete(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </NeonCard>
      </div>

      {providers.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {providers.map((p) => (
            <NeonCard key={p.provider} accent="green" title={p.label}>
              <p className="mt-2 text-xs text-zinc-500">{p.notes}</p>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-300">
                {p.prompt}
              </pre>
              <Button className="mt-3 gap-2" variant="outline" size="sm" onClick={() => copyText(p.prompt)}>
                <Copy className="h-3.5 w-3.5" />
                Kopieren
              </Button>
            </NeonCard>
          ))}
        </div>
      )}
    </div>
  );
}
