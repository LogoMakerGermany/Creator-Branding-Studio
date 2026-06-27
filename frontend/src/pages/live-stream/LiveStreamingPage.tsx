import { useEffect, useState } from 'react';
import {
  PageHeader, Badge, Button, Card, CardTitle, Input, StatCard,
} from '@/components/ui';
import {
  Radio, Copy, RefreshCw, Play, Square, CheckCircle2, Eye, Key,
} from 'lucide-react';
import {
  api, ApiError,
  type LiveStreamConfig, type LiveStreamSession, type StreamPlatform,
} from '@/services/api';

const PLATFORMS: StreamPlatform[] = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook'];

export function LiveStreamingPage() {
  const [config, setConfig] = useState<LiveStreamConfig | null>(null);
  const [session, setSession] = useState<LiveStreamSession | null>(null);
  const [activeSession, setActiveSession] = useState<LiveStreamSession | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'key' | 'url' | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await api.liveStream.get();
    setConfig(res.config);
    setActiveSession(res.activeSession);
    if (res.sessions[0] && !session) setSession(res.sessions[0]);
  }

  async function handleCreateSession() {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.liveStream.createSession(title.trim(), config?.platforms);
      setSession(res.session);
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function toggleChecklist(itemId: string, done: boolean) {
    if (!session) return;
    const res = await api.liveStream.updateChecklist(session.id, itemId, done);
    setSession(res.session);
  }

  async function handleStart() {
    if (!session) return;
    setLoading(true);
    try {
      const res = await api.liveStream.start(session.id);
      setSession(res.session);
      setActiveSession(res.session);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd() {
    if (!session) return;
    setLoading(true);
    try {
      const res = await api.liveStream.end(session.id);
      setSession(res.session);
      setActiveSession(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateKey() {
    const res = await api.liveStream.regenerateKey();
    setConfig(res.config);
  }

  async function togglePlatform(platform: StreamPlatform) {
    if (!config) return;
    const platforms = config.platforms.includes(platform)
      ? config.platforms.filter((p) => p !== platform)
      : [...config.platforms, platform];
    const res = await api.liveStream.updateConfig({ platforms });
    setConfig(res.config);
  }

  async function copyText(text: string, type: 'key' | 'url') {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  const current = activeSession ?? session;

  return (
    <div>
      <PageHeader
        title="Live Streaming Tools"
        description="RTMP-Setup, Overlays, Alerts und Multistream-Steuerung für Twitch, YouTube & Co."
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={
          current?.status === 'live' ? (
            <Badge variant="brand" className="animate-pulse">● LIVE</Badge>
          ) : undefined
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Status" value={current?.status ?? 'offline'} icon={<Radio className="h-5 w-5" />} />
        <StatCard label="Zuschauer" value={current?.viewerCount ?? 0} icon={<Eye className="h-5 w-5" />} />
        <StatCard label="Plattformen" value={config?.platforms.length ?? 0} />
        <StatCard label="Multistream" value={config?.multistreamEnabled ? 'An' : 'Aus'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2"><Key className="h-4 w-4" /> RTMP-Konfiguration</CardTitle>
          {config && (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-zinc-500">RTMP Server</p>
                <p className="font-mono text-sm text-zinc-300">{config.rtmpServer}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Stream Key</p>
                <div className="flex items-center gap-2">
                  <p className="truncate font-mono text-sm text-zinc-300">{config.streamKey}</p>
                  <Button size="sm" variant="outline" onClick={() => copyText(config.streamKey, 'key')}>
                    <Copy className="h-3 w-3" />
                    {copied === 'key' ? 'OK' : ''}
                  </Button>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={handleRegenerateKey}>
                <RefreshCw className="h-3 w-3" /> Key erneuern
              </Button>
              <div>
                <p className="mb-2 text-xs text-zinc-500">Plattformen</p>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`rounded-lg border px-3 py-1 text-xs capitalize ${
                        config.platforms.includes(p) ? 'border-brand-500 bg-brand-500/10' : 'border-zinc-800'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {(['overlayPackEnabled', 'alertsEnabled', 'chatOverlayEnabled', 'multistreamEnabled'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={config[key]}
                      onChange={async (e) => {
                        const res = await api.liveStream.updateConfig({ [key]: e.target.checked });
                        setConfig(res.config);
                      }}
                    />
                    {key.replace(/Enabled$/, '').replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Stream-Session</CardTitle>
          {!session ? (
            <div className="mt-4 space-y-3">
              <Input placeholder="Stream-Titel..." value={title} onChange={(e) => setTitle(e.target.value)} />
              <Button onClick={handleCreateSession} loading={loading} className="gap-2">
                <Play className="h-4 w-4" />
                Session erstellen
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <p className="font-medium text-zinc-200">{session.title}</p>
                <p className="text-xs text-zinc-500 capitalize">{session.status} · {session.platforms.join(', ')}</p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">Go-Live Checkliste</p>
                <div className="space-y-1">
                  {session.checklist.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm text-zinc-400">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) => toggleChecklist(item.id, e.target.checked)}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                {session.status !== 'live' && session.status !== 'ended' && (
                  <Button onClick={handleStart} loading={loading} className="gap-2">
                    <Play className="h-4 w-4" />
                    Go Live
                  </Button>
                )}
                {session.status === 'live' && (
                  <Button variant="outline" onClick={handleEnd} loading={loading} className="gap-2">
                    <Square className="h-4 w-4" />
                    Stream beenden
                  </Button>
                )}
                {session.rtmpUrl && (
                  <Button size="sm" variant="outline" onClick={() => copyText(session.rtmpUrl, 'url')}>
                    <Copy className="h-3 w-3" />
                    {copied === 'url' ? 'Kopiert' : 'RTMP URL'}
                  </Button>
                )}
              </div>

              {session.status === 'live' && (
                <p className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Live seit {session.startedAt ? new Date(session.startedAt).toLocaleTimeString('de-DE') : '—'}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
