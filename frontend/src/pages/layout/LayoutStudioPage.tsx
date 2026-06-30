import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Badge, Button, NeonCard, CardTitle, Input,
} from '@/components/ui';
import {
  Layout, Plus, Trash2, Download, Save, Camera, MessageSquare,
  Bell, Type, Image, GripVertical, Frame, Layers, Upload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type LayoutElement, type StreamLayout } from '@/services/api';
import { StudioShell } from '@/v2/components/StudioShell';

const MIN_SIZE = 40;

const ELEMENT_TYPES = [
  { type: 'facecam' as const, label: 'Facecam', icon: Camera, color: '#7C3AED' },
  { type: 'chatbox' as const, label: 'Chatbox', icon: MessageSquare, color: '#3B82F6' },
  { type: 'alert' as const, label: 'Alerts', icon: Bell, color: '#F59E0B' },
  { type: 'logo' as const, label: 'Logo', icon: Image, color: '#10B981' },
  { type: 'image' as const, label: 'Bild', icon: Image, color: '#22D3EE' },
  { type: 'frame' as const, label: 'Rahmen', icon: Frame, color: '#A855F7' },
  { type: 'overlay' as const, label: 'Overlay', icon: Layers, color: '#34D399' },
  { type: 'text' as const, label: 'Text', icon: Type, color: '#EC4899' },
  { type: 'widget' as const, label: 'Widget', icon: Layout, color: '#6366F1' },
];

const PLATFORMS = ['obs', 'streamlabs', 'twitch', 'tiktok'] as const;

type ResizeHandle = 'e' | 's' | 'se';

type Interaction =
  | { mode: 'drag'; id: string; offsetX: number; offsetY: number }
  | { mode: 'resize'; id: string; handle: ResizeHandle };

function defaultSize(type: LayoutElement['type']) {
  switch (type) {
    case 'facecam': return { width: 320, height: 240 };
    case 'chatbox': return { width: 300, height: 400 };
    case 'text': return { width: 280, height: 64 };
    case 'frame': return { width: 360, height: 200 };
    case 'image':
    case 'overlay': return { width: 400, height: 225 };
    default: return { width: 200, height: 120 };
  }
}

function supportsImage(type: LayoutElement['type']) {
  return type === 'image' || type === 'frame' || type === 'overlay' || type === 'logo';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

export function LayoutStudioPage() {
  const { activeDna } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [layouts, setLayouts] = useState<StreamLayout[]>([]);
  const [current, setCurrent] = useState<StreamLayout | null>(null);
  const [name, setName] = useState('Mein Stream Layout');
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('obs');
  const [elements, setElements] = useState<LayoutElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scale = 0.5;
  const canvasW = 1920;
  const canvasH = 1080;

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    api.layout.list().then((r) => setLayouts(r.layouts)).catch(() => {});
  }, []);

  const updateElement = useCallback((id: string, patch: Partial<LayoutElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  }, []);

  function addElement(type: LayoutElement['type']) {
    const def = ELEMENT_TYPES.find((e) => e.type === type);
    const size = defaultSize(type);
    const id = crypto.randomUUID();
    setElements((prev) => [
      ...prev,
      {
        id,
        type,
        x: 80 + prev.length * 24,
        y: 80 + prev.length * 24,
        ...size,
        label: def?.label,
        color: def?.color ?? activeDna?.primaryColors[0] ?? '#7C3AED',
        borderWidth: type === 'frame' ? 4 : undefined,
        borderColor: type === 'frame' ? def?.color : undefined,
        borderRadius: type === 'frame' ? 12 : undefined,
        opacity: 1,
      },
    ]);
    setSelectedId(id);
  }

  const canvasPoint = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }, [scale]);

  useEffect(() => {
    if (!interaction) return;
    const active = interaction;

    function onMove(e: MouseEvent) {
      const { x, y } = canvasPoint(e.clientX, e.clientY);

      if (active.mode === 'drag') {
        setElements((prev) =>
          prev.map((el) => {
            if (el.id !== active.id) return el;
            const nx = Math.round(Math.max(0, Math.min(canvasW - el.width, x - active.offsetX)));
            const ny = Math.round(Math.max(0, Math.min(canvasH - el.height, y - active.offsetY)));
            return { ...el, x: nx, y: ny };
          })
        );
        return;
      }

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== active.id) return el;
          let { width, height } = el;
          if (active.handle === 'e' || active.handle === 'se') {
            width = Math.round(Math.max(MIN_SIZE, Math.min(canvasW - el.x, x - el.x)));
          }
          if (active.handle === 's' || active.handle === 'se') {
            height = Math.round(Math.max(MIN_SIZE, Math.min(canvasH - el.y, y - el.y)));
          }
          return { ...el, width, height };
        })
      );
    }

    function onUp() {
      setInteraction(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [interaction, canvasPoint, canvasW, canvasH]);

  function startDrag(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const el = elements.find((x) => x.id === id);
    if (!el) return;
    const { x, y } = canvasPoint(e.clientX, e.clientY);
    setSelectedId(id);
    setInteraction({ mode: 'drag', id, offsetX: x - el.x, offsetY: y - el.y });
  }

  function startResize(e: React.MouseEvent, id: string, handle: ResizeHandle) {
    e.stopPropagation();
    setSelectedId(id);
    setInteraction({ mode: 'resize', id, handle });
  }

  async function handleImageUpload(file: File, targetId?: string) {
    const id = targetId ?? selectedId;
    if (!id) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Bild max. 5 MB');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      try {
        const res = await api.files.upload({
          name: file.name,
          mimeType: file.type || 'image/png',
          category: 'overlay',
          dataUrl,
        });
        updateElement(id, { imageUrl: res.file.downloadUrl ?? dataUrl });
      } catch {
        updateElement(id, { imageUrl: dataUrl });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  }

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
    let layoutId = current?.id;
    if (!layoutId) {
      setLoading(true);
      try {
        const res = await api.layout.create({ name, platform, canvas: { width: canvasW, height: canvasH }, elements });
        setCurrent(res.layout);
        setLayouts((prev) => [res.layout, ...prev]);
        layoutId = res.layout.id;
      } finally {
        setLoading(false);
      }
    }
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
    setSelectedId(layout.elements[0]?.id ?? null);
  }

  function renderElement(el: LayoutElement) {
    const def = ELEMENT_TYPES.find((e) => e.type === el.type);
    const Icon = def?.icon ?? Layout;
    const isSelected = selectedId === el.id;
    const showImage = el.imageUrl && supportsImage(el.type);
    const frameStyle = el.type === 'frame'
      ? {
          borderWidth: el.borderWidth ?? 4,
          borderStyle: 'solid' as const,
          borderColor: el.borderColor ?? el.color ?? '#A855F7',
          borderRadius: el.borderRadius ?? 12,
        }
      : {};

    return (
      <div
        key={el.id}
        className={`absolute overflow-hidden text-xs font-medium text-white/90 ${
          isSelected ? 'ring-2 ring-[var(--ucbs-accent-cyan)] ring-offset-1 ring-offset-zinc-900' : ''
        }`}
        style={{
          left: el.x * scale,
          top: el.y * scale,
          width: el.width * scale,
          height: el.height * scale,
          opacity: el.opacity ?? 1,
          backgroundColor: showImage && el.type !== 'frame' ? 'transparent' : `${el.color ?? '#7C3AED'}40`,
          border: el.type === 'frame' ? undefined : `2px dashed ${el.color ?? '#7C3AED'}`,
          ...frameStyle,
        }}
        onMouseDown={(e) => startDrag(e, el.id)}
        onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
      >
        {showImage && (
          <img
            src={el.imageUrl}
            alt={el.label ?? el.type}
            className="pointer-events-none h-full w-full object-contain"
            draggable={false}
          />
        )}

        {!showImage && el.type === 'text' && el.content && (
          <div className="flex h-full items-center justify-center p-2 text-center text-sm">{el.content}</div>
        )}

        {!showImage && el.type !== 'text' && (
          <div className="flex h-full items-center justify-center gap-1 p-1">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{el.label}</span>
          </div>
        )}

        <div className="absolute left-1 top-1 cursor-move rounded bg-black/40 p-0.5">
          <GripVertical className="h-3 w-3 opacity-80" />
        </div>

        <button
          type="button"
          className="absolute right-1 top-1 rounded bg-black/40 p-0.5 hover:bg-red-500/60"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setElements((p) => p.filter((x) => x.id !== el.id));
            if (selectedId === el.id) setSelectedId(null);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>

        {isSelected && (
          <>
            <div
              className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-sm bg-[var(--ucbs-accent-cyan)]"
              onMouseDown={(e) => startResize(e, el.id, 'se')}
            />
            <div
              className="absolute right-0 top-1/2 h-6 w-2 -translate-y-1/2 cursor-e-resize rounded-sm bg-[var(--ucbs-accent-cyan)]/80"
              onMouseDown={(e) => startResize(e, el.id, 'e')}
            />
            <div
              className="absolute bottom-0 left-1/2 h-2 w-6 -translate-x-1/2 cursor-s-resize rounded-sm bg-[var(--ucbs-accent-cyan)]/80"
              onMouseDown={(e) => startResize(e, el.id, 's')}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <StudioShell
      title="Layout Studio"
      description="Drag-and-Drop Editor — Elemente verschieben, Größe ändern, Bilder & Rahmen einfügen"
      badge={<Badge variant="brand">UCBS</Badge>}
      actions={
        <div className="flex flex-wrap gap-2">
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
    >
      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
          e.target.value = '';
        }}
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-1">
          <NeonCard accent="cyan">
            <CardTitle className="text-sm">Elemente hinzufügen</CardTitle>
            <div className="mt-3 space-y-1">
              {ELEMENT_TYPES.map(({ type, label, icon: Icon, color }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addElement(type)}
                  className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-white/20 hover:bg-white/5"
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                  {label}
                  <Plus className="ml-auto h-3 w-3 text-zinc-500" />
                </button>
              ))}
            </div>
          </NeonCard>

          {selected && (
            <NeonCard accent="purple">
              <CardTitle className="text-sm">Eigenschaften</CardTitle>
              <p className="mt-1 text-xs text-zinc-500">{selected.label ?? selected.type}</p>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Breite"
                    type="number"
                    min={MIN_SIZE}
                    value={selected.width}
                    onChange={(e) => updateElement(selected.id, { width: Number(e.target.value) || MIN_SIZE })}
                  />
                  <Input
                    label="Höhe"
                    type="number"
                    min={MIN_SIZE}
                    value={selected.height}
                    onChange={(e) => updateElement(selected.id, { height: Number(e.target.value) || MIN_SIZE })}
                  />
                  <Input
                    label="X"
                    type="number"
                    min={0}
                    value={selected.x}
                    onChange={(e) => updateElement(selected.id, { x: Number(e.target.value) || 0 })}
                  />
                  <Input
                    label="Y"
                    type="number"
                    min={0}
                    value={selected.y}
                    onChange={(e) => updateElement(selected.id, { y: Number(e.target.value) || 0 })}
                  />
                </div>

                <Input
                  label="Label"
                  value={selected.label ?? ''}
                  onChange={(e) => updateElement(selected.id, { label: e.target.value })}
                />

                {selected.type === 'text' && (
                  <Input
                    label="Textinhalt"
                    value={selected.content ?? ''}
                    onChange={(e) => updateElement(selected.id, { content: e.target.value })}
                  />
                )}

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Farbe</label>
                  <input
                    type="color"
                    value={selected.color ?? '#7C3AED'}
                    onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                    className="h-9 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                  />
                </div>

                {selected.type === 'frame' && (
                  <>
                    <Input
                      label="Rahmenbreite"
                      type="number"
                      min={1}
                      max={24}
                      value={selected.borderWidth ?? 4}
                      onChange={(e) => updateElement(selected.id, { borderWidth: Number(e.target.value) || 4 })}
                    />
                    <Input
                      label="Eckenradius"
                      type="number"
                      min={0}
                      max={64}
                      value={selected.borderRadius ?? 12}
                      onChange={(e) => updateElement(selected.id, { borderRadius: Number(e.target.value) || 0 })}
                    />
                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">Rahmenfarbe</label>
                      <input
                        type="color"
                        value={selected.borderColor ?? selected.color ?? '#A855F7'}
                        onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })}
                        className="h-9 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                      />
                    </div>
                  </>
                )}

                {supportsImage(selected.type) && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      loading={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      Bild einfügen
                    </Button>
                    {selected.imageUrl && (
                      <button
                        type="button"
                        className="w-full text-xs text-red-400 hover:underline"
                        onClick={() => updateElement(selected.id, { imageUrl: undefined })}
                      >
                        Bild entfernen
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Deckkraft ({Math.round((selected.opacity ?? 1) * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={selected.opacity ?? 1}
                    onChange={(e) => updateElement(selected.id, { opacity: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            </NeonCard>
          )}

          <NeonCard accent="green">
            <Input label="Layout Name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="mt-3">
              <label className="mb-1 block text-xs text-zinc-400">Plattform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as typeof platform)}
                className="w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </div>

            {layouts.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-zinc-500">Gespeicherte Layouts</p>
                {layouts.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => loadLayout(l)}
                    className={`mb-1 w-full rounded px-2 py-1.5 text-left text-xs ${
                      current?.id === l.id ? 'bg-brand-600/20 text-brand-300' : 'text-zinc-400 hover:bg-white/5'
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </NeonCard>
        </div>

        <NeonCard accent="purple" className="lg:col-span-3 overflow-hidden p-4">
          <div
            ref={canvasRef}
            className="relative mx-auto border border-white/10 bg-zinc-950"
            style={{ width: canvasW * scale, height: canvasH * scale }}
            onMouseDown={() => setSelectedId(null)}
          >
            {elements.map(renderElement)}
            {elements.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-600">
                <span>Elemente aus der Sidebar hinzufügen</span>
                <span className="text-xs">Verschieben · Größe ziehen · Bilder & Rahmen</span>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">
            Canvas {canvasW}×{canvasH} · {elements.length} Elemente
            {selected ? ` · Ausgewählt: ${selected.label ?? selected.type}` : ''}
          </p>
        </NeonCard>
      </div>
    </StudioShell>
  );
}
