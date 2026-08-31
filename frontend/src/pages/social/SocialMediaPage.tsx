import { useEffect, useState } from 'react';
import { plannerStatusLabel, normalizePlannerStatus } from '@ucbs/shared';
import { PageHeader, Badge, Button, NeonCard, StatCard } from '@/components/ui';
import { Share2, Send, Trash2, Clock, Image } from 'lucide-react';
import { api, ApiError, type SocialPost, type SocialPlatform, type SocialStats } from '@/services/api';
import { StudioErrorBanner, TypeOptionButton } from '@/components/studio';

const PLATFORMS: SocialPlatform[] = ['instagram', 'youtube', 'tiktok', 'twitter', 'discord', 'twitch'];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

export function SocialMediaPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [stats, setStats] = useState<SocialStats>({ totalPosts: 0, scheduled: 0, draft: 0, ready: 0 });
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.social.list();
    setPosts(res.posts);
    setStats(res.stats);
  }

  async function handleMediaSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaPreview(await readFileAsDataUrl(file));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const mediaDataUrl = mediaFile ? await readFileAsDataUrl(mediaFile) : undefined;
      await api.social.create({
        platform,
        content: content.trim(),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        mediaDataUrl,
      });
      setContent('');
      setScheduledAt('');
      setMediaFile(null);
      setMediaPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleReady(id: string) {
    await api.social.update(id, { status: 'ready' });
    await load();
  }

  async function handleDelete(id: string) {
    await api.social.delete(id);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Interner Content-Planer"
        description="Nur interne Entwürfe und Termine. NEXTER veröffentlicht nichts auf TikTok, YouTube oder Instagram."
        badge={<Badge variant="brand">Intern</Badge>}
      />

      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Posts" value={stats.totalPosts} icon={<Share2 className="h-5 w-5" />} />
        <StatCard label="Intern geplant" value={stats.scheduled} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Entwürfe" value={stats.draft ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title="Neuer Post">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <TypeOptionButton
                  key={p}
                  active={platform === p}
                  onClick={() => setPlatform(p)}
                  className="px-3 py-1 capitalize"
                >
                  {p}
                </TypeOptionButton>
              ))}
            </div>
            <textarea
              className="w-full rounded-lg border border-zinc-800 bg-surface-950 p-3 text-sm text-zinc-200 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
              rows={4}
              placeholder="Was möchtest du posten?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-xs text-zinc-500">
                <Image className="h-3 w-3" />
                Medien (optional)
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleMediaSelect}
                className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-brand-500/20 file:px-3 file:py-1.5 file:text-brand-200"
              />
              {mediaPreview && (
                <img src={mediaPreview} alt="Vorschau" className="mt-2 h-24 rounded border border-zinc-700 object-cover" />
              )}
            </label>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Optional: Zeitplan (erscheint auch im Content-Kalender)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-surface-950 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <Button type="submit" loading={loading} className="gap-2">
              <Send className="h-4 w-4" />
              {scheduledAt ? 'Planen' : 'Als Entwurf speichern'}
            </Button>
          </form>
        </NeonCard>

        <NeonCard accent="magenta" title="Posts">
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {posts.map((post) => (
              <div key={post.id} className="ucbs-neon-card p-3">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="capitalize">{post.platform}</Badge>
                  <Badge variant="default">
                    {post.plannerLabel ?? plannerStatusLabel(normalizePlannerStatus(post.status))}
                  </Badge>
                </div>
                {post.mediaUrl && (
                  <img src={post.mediaUrl} alt="" className="mt-2 h-28 w-full rounded object-cover" />
                )}
                <p className="mt-2 text-sm text-zinc-300">{post.content}</p>
                {post.scheduledAt && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-cyan-400">
                    <Clock className="h-3 w-3" />
                    {new Date(post.scheduledAt).toLocaleString('de-DE')}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  {(post.plannerStatus === 'draft' || post.status === 'draft') && (
                    <Button size="sm" variant="outline" onClick={() => handleReady(post.id)}>
                      Als bereit markieren (nicht veröffentlicht)
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleDelete(post.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {posts.length === 0 && <p className="text-sm text-zinc-500">Noch keine Posts</p>}
          </div>
        </NeonCard>
      </div>
    </div>
  );
}
