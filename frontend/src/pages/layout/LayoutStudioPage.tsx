import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PageHeader, Badge, Button, NeonCard, CardTitle, Input,
} from '@/components/ui';
import {
  Layout, Plus, Trash2, Download, Save, Camera, MessageSquare,
  Bell, Type, Image, GripVertical,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type LayoutElement, type StreamLayout } from '@/services/api';

const ELEMENT_TYPES = [
  { type: 'facecam' as const, label: 'Facecam', icon: Camera, color: '#7C3AED' },
  { type: 'chatbox' as const, label: 'Chatbox', icon: MessageSquare, color: '#3B82F6' },
  { type: 'alert' as const, label: 'Alerts', icon: Bell, color: '#F59E0B' },
  { type: 'logo' as const, label: 'Logo', icon: Image, color: '#10B981' },
  { type: 'text' as const, label: 'Text', icon: Type, color: '#EC4899' },
  { type: 'widget' as const, label: 'Widget', icon: Layout, color: '#6366F1' },
];

const PLATFORMS = ['obs', 'streamlabs', 'twitch', 'tiktok'] as const;

export function LayoutStudioPage() {
  const { activeDna } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [layouts, setLayouts] = useState<StreamLayout[]>([]);
  const [current, setCurrent] = useState<StreamLayout | null>(null);
  const [name, setName] = useState('Mein Stream Layout');
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('obs');
  const [elements, setElements] = useState<LayoutElement[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scale = 0.5;
  const canvasW = 1920;
  const canvasH = 1080;

  useEffect(() => {
    api.layout.list().then((r) => setLayouts(r.layouts)).catch(() => {});
  }, []);

  function addElement(type: LayoutElement['type']) {
    const def = ELEMENT_TYPES.find((e) => e.type === type);
    setElements((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type,
        x: 100 + prev.length * 20,
        y: 100 + prev.length * 20,
        width: type === 'facecam' ? 320 : type === 'chatbox' ? 300 : 200,
        height: type === 'facecam' ? 240 : type === 'chatbox' ? 400 : 80,
        label: def?.label,
        color: def?.color ?? activeDna?.primaryColors[0] ?? '#7C3AED',
      },
    ]);
  }

  const handleMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    const el = elements.find((x) => x.id === id);
    if (!el || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDragging(id);
    setDragOffset({
      x: e.clientX - rect.left - el.x * scale,
      y: e.clientY - rect.top - el.y * scale,
    });
  }, [elements, scale]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvasW - 50, (e.clientX - rect.left - dragOffset.x) / scale));
    const y = Math.max(0, Math.min(canvasH - 50, (e.clientY - rect.top - dragOffset.y) / scale));
    setElements((prev) => prev.map((el) => el.id === dragging ? { ...el, x: Math.round(x), y: Math.round(y) } : el));
  }, [dragging, dragOffset, scale, canvasW, canvasH]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      if (current) {
        const res = await api.layout.update(current.id, { name, platform, elements });
        setCurrent(res.layout);
      } else {
        const res = await api.layout.create({ name, platform, canvas: { width: canvasW, height: canvasH }, elements });
        setCurrent(res.layout);
        setLayouts((prev) => [res.layout, ...prev]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(fmt: 'obs' | 'streamlabs' | 'json') {
    if (!current) {
      await handleSave();
    }
    const layoutId = current?.id;
    if (!layoutId) return;
    const res = await api.layout.export(layoutId, fmt);
    const blob = new Blob([res.export], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s/g, '_')}.${fmt === 'json' ? 'json' : fmt}.json`;
    a.click();
  }

  function loadLayout(layout: StreamLayout) {
    setCurrent(layout);
    setName(layout.name);
    setPlatform(layout.platform);
    setElements(layout.elements);
  }

  return (
    <div>
      <PageHeader
        title="Layout Studio"
        description="Drag-and-Drop Editor für OBS, Streamlabs, Twitch und TikTok Live"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleExport('obs')} disabled={elements.length === 0}>
              <Download className="h-4 w-4" /> OBS
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport('streamlabs')} disabled={elements.length === 0}>
              <Download className="h-4 w-4" /> Streamlabs
            </Button>
            <Button size="sm" onClick={handleSave} loading={loading} disabled={elements.length === 0}>
              <Save className="h-4 w-4" /> Speichern
            </Button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-4">
        <NeonCard accent="cyan" className="lg:col-span-1">
          <CardTitle className="text-sm">Elemente</CardTitle>
          <div className="mt-3 space-y-1">
            {ELEMENT_TYPES.map(({ type, label, icon: Icon, color }) => (
              <button
                key={type}
                type="button"
                onClick={() => addElement(type)}
                className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/50"
              >
                <Icon className="h-4 w-4" style={{ color }} />
                {label}
                <Plus className="ml-auto h-3 w-3 text-zinc-500" />
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <Input label="Layout Name" value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Plattform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as typeof platform)}
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm"
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          {layouts.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-zinc-500">Gespeicherte Layouts</p>
              {layouts.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => loadLayout(l)}
                  className={`mb-1 w-full rounded px-2 py-1.5 text-left text-xs ${current?.id === l.id ? 'bg-brand-600/20 text-brand-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </NeonCard>

        <NeonCard accent="purple" className="lg:col-span-3 overflow-hidden p-4">
          <div
            ref={canvasRef}
            className="relative mx-auto border border-zinc-700 bg-zinc-900"
            style={{ width: canvasW * scale, height: canvasH * scale }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {elements.map((el) => {
              const def = ELEMENT_TYPES.find((e) => e.type === el.type);
              const Icon = def?.icon ?? Layout;
              return (
                <div
                  key={el.id}
                  className="absolute flex cursor-move items-center justify-center border-2 border-dashed text-xs font-medium text-white/80"
                  style={{
                    left: el.x * scale,
                    top: el.y * scale,
                    width: el.width * scale,
                    height: el.height * scale,
                    backgroundColor: `${el.color}40`,
                    borderColor: el.color,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, el.id)}
                >
                  <GripVertical className="absolute left-1 top-1 h-3 w-3 opacity-50" />
                  <Icon className="mr-1 h-4 w-4" />
                  {el.label}
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded p-0.5 hover:bg-black/30"
                    onClick={(e) => { e.stopPropagation(); setElements((p) => p.filter((x) => x.id !== el.id)); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            {elements.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                Elemente aus der Sidebar hinzufügen
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">
            Canvas: {canvasW}×{canvasH} · {elements.length} Elemente
          </p>
        </NeonCard>
      </div>
    </div>
  );
}
