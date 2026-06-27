import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, NeonCard, StatCard } from '@/components/ui';
import { Share2, Send, Trash2, TrendingUp, Clock } from 'lucide-react';
import { api, ApiError, type SocialPost, type SocialPlatform } from '@/services/api';
import { StudioErrorBanner, TypeOptionButton } from '@/components/studio';
import { cn } from '@/lib/utils';

const PLATFORMS: SocialPlatform[] = ['instagram', 'youtube', 'tiktok', 'twitter', 'discord', 'twitch'];

export function SocialMediaPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [stats, setStats] = useState({ totalPosts: 0, scheduled: 0, published: 0, totalEngagement: 0 });
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.social.create({
        platform,
        content: content.trim(),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      setContent('');
      setScheduledAt('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(id: string) {
    await api.social.update(id, { status: 'published' });
    await load();
  }

  async function handleDelete(id: string) {
    await api.social.delete(id);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Social Media Center"
        description="Posts planen, veröffentlichen und Engagement tracken"
        badge={<Badge variant="brand">UCBS</Badge>}
      />

      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Posts" value={stats.totalPosts} icon={<Share2 className="h-5 w-5" />} />
        <StatCard label="Geplant" value={stats.scheduled} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Veröffentlicht" value={stats.published} />
        <StatCard label="Engagement" value={stats.totalEngagement} icon={<TrendingUp className="h-5 w-5" />} />
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
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Optional: Zeitplan</label>
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
                  <Badge
                    variant={post.status === 'published' ? 'brand' : 'default'}
                    className={cn(post.status === 'scheduled' && 'text-cyan-300')}
                  >
                    {post.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{post.content}</p>
                {post.scheduledAt && post.status === 'scheduled' && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-cyan-400">
                    <Clock className="h-3 w-3" />
                    {new Date(post.scheduledAt).toLocaleString('de-DE')}
                  </p>
                )}
                {post.status === 'published' && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {post.engagement.likes} Likes · {post.engagement.views} Views
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  {(post.status === 'draft' || post.status === 'scheduled') && (
                    <Button size="sm" variant="outline" onClick={() => handlePublish(post.id)}>
                      Veröffentlichen
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
