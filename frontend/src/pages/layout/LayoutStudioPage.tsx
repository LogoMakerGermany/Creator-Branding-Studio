import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Badge, Button, NeonCard, CardTitle, Input,
} from '@/components/ui';
import { StudioErrorBanner } from '@/components/studio';
import {
  Layout, Plus, Trash2, Download, Save, Camera, MessageSquare,
  Bell, Type, Image, GripVertical, Frame, Layers, Upload, Undo2, Redo2, Copy, EyeOff, Lock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type LayoutElement, type StreamLayout } from '@/services/api';
import { StudioShell } from '@/v2/components/StudioShell';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import {
  MIN_ELEMENT_SIZE,
  RESIZE_HANDLES,
  HANDLE_CURSORS,
  computeResizedRect,
  getElementsBounds,
  applyGroupResize,
  applyGroupDrag,
  handlePosition,
  elementToRect,
  clampRect,
  type ResizeHandle,
  type Rect,
} from './layout-editor';
import { useLayoutHistory } from './useLayoutHistory';
import { STREAM_LAYOUT_PRESETS } from '@ucbs/shared';

const ELEMENT_TYPES = [
  { type: 'gameplay' as const, label: 'Gameplay', icon: Layout, color: '#22C55E' },
  { type: 'facecam' as const, label: 'Facecam', icon: Camera, color: '#7C3AED' },
  { type: 'chatbox' as const, label: 'Chat', icon: MessageSquare, color: '#3B82F6' },
  { type: 'alert' as const, label: 'Alerts', icon: Bell, color: '#F59E0B' },
  { type: 'logo' as const, label: 'Logo', icon: Image, color: '#10B981' },
  { type: 'image' as const, label: 'Bild', icon: Image, color: '#22D3EE' },
  { type: 'frame' as const, label: 'Rahmen', icon: Frame, color: '#A855F7' },
  { type: 'overlay' as const, label: 'Overlay', icon: Layers, color: '#34D399' },
  { type: 'text' as const, label: 'Text', icon: Type, color: '#EC4899' },
  { type: 'widget' as const, label: 'Widget', icon: Layout, color: '#6366F1' },
];

const PLATFORMS = ['obs', 'streamlabs', 'twitch', 'tiktok', 'youtube', 'custom'] as const;

type Interaction =
  | {
      mode: 'drag';
      ids: string[];
      startPointer: { x: number; y: number };
      snapshots: Record<string, Rect>;
    }
  | {
      mode: 'resize';
      ids: string[];
      handle: ResizeHandle;
      groupStart: Rect;
      snapshots: Record<string, Rect>;
      startPointer: { x: number; y: number };
    };

function defaultSize(type: LayoutElement['type']) {
  switch (type) {
    case 'facecam': return { width: 320, height: 240 };
    case 'chatbox': return { width: 300, height: 400 };
    case 'gameplay': return { width: 960, height: 540 };
    case 'text': return { width: 280, height: 64 };
    case 'frame': return { width: 360, height: 200 };
    case 'image':
    case 'overlay': return { width: 400, height: 225 };
    default: return { width: 200, height: 120 };
  }
}

function supportsImage(type: LayoutElement['type']) {
  return type === 'image' || type === 'frame' || type === 'overlay' || type === 'logo' || type === 'facecam';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

function buildSnapshots(elements: LayoutElement[], ids: string[]): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  for (const id of ids) {
    const el = elements.find((e) => e.id === id);
    if (el) out[id] = elementToRect(el);
  }
  return out;
}

export function LayoutStudioPage() {
  const { activeDna } = useAuth();
  const [searchParams] = useSearchParams();
  const { projects: ownedFacecams } = useStudioProjects('facecam');
  const { projects: ownedOverlays } = useStudioProjects('overlay');
  const { projects: ownedStickers } = useStudioProjects('sticker');
  const { projects: ownedLogos } = useStudioProjects('logo');
  const [previewMode, setPreviewMode] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [layouts, setLayouts] = useState<StreamLayout[]>([]);
  const [current, setCurrent] = useState<StreamLayout | null>(null);
  const [name, setName] = useState('Mein Stream Layout');
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('twitch');
  const [canvasW, setCanvasW] = useState(1920);
  const [canvasH, setCanvasH] = useState(1080);
  const [background, setBackground] = useState<{ mode: 'transparent' | 'solid'; color?: string }>({ mode: 'transparent' });
  const [projectId, setProjectId] = useState<string>('');
  const [brandProjects, setBrandProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [cloudFiles, setCloudFiles] = useState<Array<{ id: string; name: string; category: string; available?: boolean; sourceJobId?: string }>>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [scale, setScale] = useState(0.35);
  const {
    elements,
    setElements,
    setElementsTransient,
    beginInteraction,
    endInteraction,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  } = useLayoutHistory([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const interactionRef = useRef<Interaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function fit() {
      const maxW = Math.min(window.innerWidth - 48, 1100);
      setScale(Math.max(0.18, Math.min(0.5, maxW / canvasW)));
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [canvasW]);

  const primarySelectedId = selectedIds[selectedIds.length - 1] ?? null;
  const selected = elements.find((e) => e.id === primarySelectedId) ?? null;
  const selectionBounds = getElementsBounds(elements, selectedIds);

  useEffect(() => {
    api.layout.list().then((r) => setLayouts(r.layouts)).catch(() => {});
    setAssetsLoading(true);
    Promise.all([
      api.projects.list().then((r) => setBrandProjects(r.projects.map((p) => ({ id: p.id, name: p.name })))),
      api.files.list({ kind: 'image', limit: 40, sort: 'newest' }).then((r) =>
        setCloudFiles(r.files.map((f) => ({ id: f.id, name: f.name, category: f.category, available: f.available, sourceJobId: f.sourceJobId })))
      ),
    ])
      .catch(() => setError((prev) => prev || 'Assets laden fehlgeschlagen'))
      .finally(() => setAssetsLoading(false));
  }, []);

  useEffect(() => {
    const id = searchParams.get('layoutId');
    if (!id) return;
    api.layout
      .get(id)
      .then((r) => loadLayout(r.layout))
      .catch(() => setError('Layout nicht gefunden'));
  }, [searchParams]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        setElements((prev) => prev.filter((el) => el.locked || !selectedIds.includes(el.id)));
        setSelectedIds((ids) => ids.filter((id) => elements.some((el) => el.id === id && el.locked)));
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setElements((prev) =>
          prev.map((el) => {
            if (!selectedIds.includes(el.id) || el.locked) return el;
            return { ...el, ...clampRect({ x: el.x + dx, y: el.y + dy, width: el.width, height: el.height }, canvasW, canvasH) };
          })
        );
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedIds, setElements, elements, canvasW, canvasH]);

  const updateElement = useCallback(
    (id: string, patch: Partial<LayoutElement>) => {
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== id) return el;
          const next = { ...el, ...patch };
          return {
            ...next,
            ...clampRect(
              { x: next.x, y: next.y, width: next.width, height: next.height },
              canvasW,
              canvasH
            ),
          };
        })
      );
    },
    [setElements, canvasW, canvasH]
  );

  function selectElement(id: string, additive: boolean) {
    if (additive) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  }

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
        color: def?.color ?? activeDna?.primaryColors?.[0] ?? '#7C3AED',
        borderWidth: type === 'frame' ? 4 : undefined,
        borderColor: type === 'frame' ? def?.color : undefined,
        borderRadius: type === 'frame' ? 12 : undefined,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: prev.length,
        fontSize: type === 'text' ? 28 : undefined,
        fontWeight: type === 'text' ? 700 : undefined,
        textAlign: type === 'text' ? 'center' : undefined,
      },
    ]);
    setSelectedIds([id]);
  }

  const canvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale]
  );

  const getModifiers = useCallback((e: PointerEvent | React.PointerEvent) => ({
    maintainAspect: e.shiftKey,
    fromCenter: e.altKey,
    disableSnap: e.ctrlKey || e.metaKey,
  }), []);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const active = interactionRef.current;
      if (!active) return;

      const ptr = canvasPoint(e.clientX, e.clientY);
      const mods = getModifiers(e);

      if (active.mode === 'drag') {
        const dx = ptr.x - active.startPointer.x;
        const dy = ptr.y - active.startPointer.y;
        setElementsTransient((prev) =>
          applyGroupDrag(prev, active.ids, active.snapshots, dx, dy, canvasW, canvasH)
        );
        return;
      }

      const groupNext = computeResizedRect(
        active.groupStart,
        active.startPointer,
        ptr,
        active.handle,
        canvasW,
        canvasH,
        mods
      );

      setElementsTransient((prev) =>
        applyGroupResize(prev, active.ids, active.snapshots, active.groupStart, groupNext)
      );
    }

    function onPointerUp() {
      if (!interactionRef.current) return;
      endInteraction();
      interactionRef.current = null;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [canvasPoint, canvasW, canvasH, getModifiers, setElementsTransient, endInteraction]);

  function startDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    const el = elements.find((x) => x.id === id);
    if (el?.locked) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const ids = (selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id]).filter(
      (sid) => !elements.find((e) => e.id === sid)?.locked
    );
    if (!ids.length) return;
    if (!selectedIds.includes(id)) setSelectedIds([id]);

    const ptr = canvasPoint(e.clientX, e.clientY);
    beginInteraction(elements);
    const nextInteraction: Interaction = {
      mode: 'drag',
      ids,
      startPointer: ptr,
      snapshots: buildSnapshots(elements, ids),
    };
    interactionRef.current = nextInteraction;
  }

  function startResize(e: React.PointerEvent, handle: ResizeHandle) {
    if (e.button !== 0 || selectedIds.length === 0) return;
    if (elements.some((el) => selectedIds.includes(el.id) && el.locked)) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const bounds = getElementsBounds(elements, selectedIds);
    if (!bounds) return;

    const ptr = canvasPoint(e.clientX, e.clientY);
    beginInteraction(elements);
    const nextInteraction: Interaction = {
      mode: 'resize',
      ids: selectedIds,
      handle,
      groupStart: bounds,
      snapshots: buildSnapshots(elements, selectedIds),
      startPointer: ptr,
    };
    interactionRef.current = nextInteraction;
  }

  async function handleImageUpload(file: File, targetId?: string) {
    const id = targetId ?? primarySelectedId;
    if (!id) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Bild max. 5 MB');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api.files.upload({
        name: file.name,
        mimeType: file.type || 'image/png',
        category: 'overlay',
        dataUrl,
        rightsConfirmed: true,
      });
      updateElement(id, { fileId: res.file.id, imageUrl: res.file.downloadUrl, assetMissing: false });
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
        const res = await api.layout.update(current.id, {
          name,
          platform,
          canvas: { width: canvasW, height: canvasH },
          elements,
          background,
          projectId: projectId || undefined,
        });
        setCurrent(res.layout);
      } else {
        const res = await api.layout.create({
          name,
          platform,
          canvas: { width: canvasW, height: canvasH },
          elements,
          background,
          projectId: projectId || undefined,
        });
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

  async function handleExportFile() {
    setLoading(true);
    setError(null);
    try {
      let layoutId = current?.id;
      if (!layoutId) {
        const res = await api.layout.create({
          name,
          platform,
          canvas: { width: canvasW, height: canvasH },
          elements,
          background,
          projectId: projectId || undefined,
        });
        setCurrent(res.layout);
        setLayouts((prev) => [res.layout, ...prev]);
        layoutId = res.layout.id;
      } else {
        await api.layout.update(layoutId, {
          name,
          platform,
          canvas: { width: canvasW, height: canvasH },
          elements,
          background,
          projectId: projectId || undefined,
        });
      }
      const exported = await api.layout.exportFile(layoutId);
      setError(null);
      setCloudFiles((prev) => [{ id: exported.fileId, name: exported.filename, category: 'project', available: true }, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  function loadLayout(layout: StreamLayout) {
    setCurrent(layout);
    setName(layout.name);
    setPlatform(layout.platform);
    setCanvasW(layout.canvas?.width ?? 1920);
    setCanvasH(layout.canvas?.height ?? 1080);
    setBackground(layout.background ?? { mode: 'transparent' });
    setProjectId(layout.projectId ?? '');
    resetHistory(layout.elements);
    setSelectedIds(layout.elements[0]?.id ? [layout.elements[0].id] : []);
    setError(null);
  }

  async function openSavedLayout(id: string) {
    setLoading(true);
    try {
      const res = await api.layout.get(id);
      loadLayout(res.layout);
    } catch {
      setError('Layout nicht gefunden');
    } finally {
      setLoading(false);
    }
  }

  function newEmptyLayout() {
    setCurrent(null);
    setName('Mein Stream Layout');
    setPlatform('twitch');
    setCanvasW(1920);
    setCanvasH(1080);
    setBackground({ mode: 'transparent' });
    setProjectId('');
    resetHistory([]);
    setSelectedIds([]);
    setError(null);
  }

  function applyStreamLayoutPreset(id: 'twitch' | 'tiktok' | 'youtube') {
    const preset = STREAM_LAYOUT_PRESETS[id];
    if (!preset) return;
    setPlatform(id);
    setCanvasW(preset.width);
    setCanvasH(preset.height);
    const mapped: LayoutElement[] = preset.slots.map((slot, index) => ({
      id: crypto.randomUUID(),
      type: slot.type === 'chat' ? 'chatbox' : slot.type === 'facecam' ? 'facecam' : slot.type === 'gameplay' ? 'gameplay' : 'overlay',
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      label: slot.label,
      visible: true,
      locked: false,
      zIndex: index,
      color: activeDna?.primaryColors?.[0],
    }));
    resetHistory(mapped);
    setSelectedIds(mapped[0]?.id ? [mapped[0].id] : []);
  }

  function renderElement(el: LayoutElement) {
    if (previewMode && el.visible === false) return null;
    const def = ELEMENT_TYPES.find((e) => e.type === el.type);
    const Icon = def?.icon ?? Layout;
    const isSelected = selectedIds.includes(el.id);
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
        className={`absolute touch-none overflow-hidden text-xs font-medium text-white/90 ${
          isSelected && !previewMode ? 'ring-2 ring-[var(--ucbs-accent-cyan)]' : ''
        } ${el.visible === false ? 'opacity-40' : ''}`}
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
        onPointerDown={(e) => startDrag(e, el.id)}
        onClick={(e) => {
          e.stopPropagation();
          selectElement(el.id, e.shiftKey);
        }}
      >
        {el.assetMissing && (
          <div className="flex h-full items-center justify-center bg-amber-500/20 p-2 text-center text-[11px] text-amber-100">
            Asset nicht verfügbar
          </div>
        )}
        {showImage && !el.assetMissing && (
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

        {!previewMode && (
        <div className="absolute left-1 top-1 cursor-move rounded bg-black/40 p-0.5">
          <GripVertical className="h-3 w-3 opacity-80" />
        </div>
        )}

        {!previewMode && (
        <button
          type="button"
          className="absolute right-1 top-1 min-h-11 min-w-11 rounded bg-black/40 p-0.5 hover:bg-red-500/60"
          aria-label={`${el.label ?? el.type} entfernen`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setElements((p) => p.filter((x) => x.id !== el.id));
            setSelectedIds((prev) => prev.filter((x) => x !== el.id));
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
        )}
      </div>
    );
  }

  function renderSelectionOverlay() {
    if (previewMode || !selectionBounds || selectedIds.length === 0) return null;

    return (
      <div
        className="pointer-events-none absolute z-50 border-2 border-[var(--ucbs-accent-cyan)]"
        style={{
          left: selectionBounds.x * scale,
          top: selectionBounds.y * scale,
          width: selectionBounds.width * scale,
          height: selectionBounds.height * scale,
        }}
      >
        {RESIZE_HANDLES.map((handle) => (
          <div
            key={handle}
            data-layout-handle={handle}
            className="pointer-events-auto touch-none rounded-sm border-2 border-zinc-900 bg-[var(--ucbs-accent-cyan)] shadow-lg hover:scale-110"
            style={{
              ...handlePosition(handle, selectionBounds.width, selectionBounds.height, scale),
              cursor: HANDLE_CURSORS[handle],
            }}
            onPointerDown={(e) => startResize(e, handle)}
          />
        ))}
      </div>
    );
  }

  return (
    <StudioShell
      title="Layout Studio"
      description="Eigene Assets zu einem Stream-Layout zusammensetzen — Position, Größe, Ebenen. Keine Bild-KI."
      badge={<Badge variant="brand">UCBS</Badge>}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={undo} disabled={!canUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={redo} disabled={!canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" className="min-h-11" aria-pressed={previewMode} onClick={() => setPreviewMode((v) => !v)}>
            {previewMode ? 'Editor' : 'Vorschau'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('obs')} disabled={elements.length === 0}>
            <Download className="h-4 w-4" /> OBS
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('streamlabs')} disabled={elements.length === 0}>
            <Download className="h-4 w-4" /> Streamlabs
          </Button>
          <Button size="sm" className="min-h-11" onClick={() => void handleExportFile()} loading={loading} disabled={elements.length === 0} aria-label="Layout als SVG in Datei Cloud exportieren">
            <Download className="h-4 w-4" /> SVG Datei Cloud
          </Button>
          <Button size="sm" className="min-h-11" onClick={handleSave} loading={loading} aria-label="Layout speichern">
            <Save className="h-4 w-4" /> Speichern
          </Button>
        </div>
      }
    >
      {error && (
        <div role="alert">
          <StudioErrorBanner message={error} />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        aria-label="Bilddatei für Layout-Element"
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
              <p className="mt-1 text-xs text-zinc-500">
                {selectedIds.length > 1
                  ? `${selectedIds.length} Elemente ausgewählt`
                  : (selected.label ?? selected.type)}
              </p>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Breite"
                    type="number"
                    min={MIN_ELEMENT_SIZE}
                    value={selectedIds.length > 1 ? selectionBounds?.width ?? selected.width : selected.width}
                    onChange={(e) => {
                      const w = Number(e.target.value) || MIN_ELEMENT_SIZE;
                      if (selectedIds.length > 1 && selectionBounds) {
                        const ratio = w / selectionBounds.width;
                        setElements((prev) =>
                          prev.map((el) => {
                            if (!selectedIds.includes(el.id)) return el;
                            return {
                              ...el,
                              width: Math.round(el.width * ratio),
                              height: Math.round(el.height * ratio),
                            };
                          })
                        );
                      } else {
                        updateElement(selected.id, { width: w });
                      }
                    }}
                  />
                  <Input
                    label="Höhe"
                    type="number"
                    min={MIN_ELEMENT_SIZE}
                    value={selectedIds.length > 1 ? selectionBounds?.height ?? selected.height : selected.height}
                    onChange={(e) => {
                      const h = Number(e.target.value) || MIN_ELEMENT_SIZE;
                      if (selectedIds.length > 1 && selectionBounds) {
                        const ratio = h / selectionBounds.height;
                        setElements((prev) =>
                          prev.map((el) => {
                            if (!selectedIds.includes(el.id)) return el;
                            return {
                              ...el,
                              width: Math.round(el.width * ratio),
                              height: Math.round(el.height * ratio),
                            };
                          })
                        );
                      } else {
                        updateElement(selected.id, { height: h });
                      }
                    }}
                  />
                  <Input
                    label="X"
                    type="number"
                    min={0}
                    value={selectedIds.length > 1 ? selectionBounds?.x ?? selected.x : selected.x}
                    disabled={selectedIds.length > 1}
                    onChange={(e) => updateElement(selected.id, { x: Number(e.target.value) || 0 })}
                  />
                  <Input
                    label="Y"
                    type="number"
                    min={0}
                    value={selectedIds.length > 1 ? selectionBounds?.y ?? selected.y : selected.y}
                    disabled={selectedIds.length > 1}
                    onChange={(e) => updateElement(selected.id, { y: Number(e.target.value) || 0 })}
                  />
                </div>

                {selectedIds.length === 1 && (
                  <>
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
                        {selected.type === 'facecam' && (
                          <div>
                            <label className="mb-1 block text-xs text-zinc-400">Eigene Facecam</label>
                            <select
                              aria-label="Eigene Facecam wählen"
                              className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                              value={selected.sourceFacecamJobId ?? ''}
                              onChange={(e) => {
                                const job = ownedFacecams.find((p) => p.id === e.target.value);
                                updateElement(selected.id, {
                                  sourceFacecamJobId: job?.id,
                                  fileId: job?.fileId,
                                  imageUrl: job?.imageUrl,
                                  assetMissing: Boolean(job && (job.fileMissing || !job.imageUrl)),
                                });
                              }}
                            >
                              <option value="">Keine Facecam</option>
                              {ownedFacecams
                                .filter((p) => p.status === 'completed' && !p.fileMissing)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.platform ?? 'Facecam'} {p.width && p.height ? `${p.width}×${p.height}` : ''} v{p.version ?? 1}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                        {selected.type === 'overlay' && (
                          <div>
                            <label className="mb-1 block text-xs text-zinc-400" htmlFor="layout-overlay">Eigenes Overlay</label>
                            <select
                              id="layout-overlay"
                              aria-label="Eigenes Overlay wählen"
                              className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                              value={selected.sourceOverlayJobId ?? ''}
                              onChange={(e) => {
                                const job = ownedOverlays.find((p) => p.id === e.target.value);
                                updateElement(selected.id, {
                                  sourceOverlayJobId: job?.id,
                                  imageUrl: job?.imageUrl,
                                  fileId: job?.fileId,
                                });
                              }}
                            >
                              <option value="">Kein Overlay</option>
                              {ownedOverlays
                                .filter((p) => p.status === 'completed' && !p.fileMissing)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.platform ?? 'Overlay'} {p.layoutPreset ? `${p.layoutPreset} ` : ''}
                                    {p.width && p.height ? `${p.width}×${p.height}` : ''} v{p.version ?? 1}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-xs text-zinc-400" htmlFor="layout-cloud-file">Datei Cloud</label>
                          <select
                            id="layout-cloud-file"
                            aria-label="Eigene Datei Cloud Datei wählen"
                            className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                            value={selected.fileId ?? ''}
                            onChange={(e) => {
                              const file = cloudFiles.find((f) => f.id === e.target.value);
                              if (!file || file.available === false) return;
                              updateElement(selected.id, { fileId: file.id, assetMissing: false });
                              api.files.downloadUrl(file.id).then((r) => updateElement(selected.id, { imageUrl: r.downloadUrl, fileId: file.id })).catch(() => setError('Signed URL fehlgeschlagen'));
                            }}
                          >
                            <option value="">{assetsLoading ? 'Dateien werden geladen…' : cloudFiles.length ? 'Eigene Datei wählen' : 'Keine passenden Assets'}</option>
                            {cloudFiles.filter((f) => f.available !== false).map((f) => (
                              <option key={f.id} value={f.id}>{f.name} ({f.category})</option>
                            ))}
                          </select>
                        </div>
                        {(selected.type === 'logo' || selected.type === 'image') && (
                          <div>
                            <label className="mb-1 block text-xs text-zinc-400" htmlFor="layout-logo">Eigenes Logo</label>
                            <select
                              id="layout-logo"
                              aria-label="Eigenes Logo wählen"
                              className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                              value={selected.sourceLogoJobId ?? ''}
                              onChange={(e) => {
                                const job = ownedLogos.find((p) => p.id === e.target.value);
                                updateElement(selected.id, {
                                  sourceLogoJobId: job?.id,
                                  fileId: job?.fileId,
                                  imageUrl: job?.imageUrl,
                                  assetMissing: Boolean(job && (job.fileMissing || !job.imageUrl)),
                                });
                              }}
                            >
                              <option value="">Kein Logo</option>
                              {ownedLogos.filter((p) => p.status === 'completed' && !p.fileMissing).map((p) => (
                                <option key={p.id} value={p.id}>Logo v{p.version ?? 1}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {(selected.type === 'image' || selected.type === 'overlay' || selected.type === 'frame') && (
                          <div>
                            <label className="mb-1 block text-xs text-zinc-400" htmlFor="layout-streamset">Streamset-Dateien</label>
                            <select
                              id="layout-streamset"
                              aria-label="Eigenes Streamset-Asset wählen"
                              className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                              value={selected.fileId ?? ''}
                              onChange={(e) => {
                                const file = cloudFiles.find((f) => f.id === e.target.value);
                                if (!file || file.available === false) return;
                                updateElement(selected.id, { fileId: file.id, assetMissing: false });
                                api.files.downloadUrl(file.id).then((r) => updateElement(selected.id, { imageUrl: r.downloadUrl, fileId: file.id })).catch(() => setError('Signed URL fehlgeschlagen'));
                              }}
                            >
                              <option value="">{cloudFiles.some((f) => f.category === 'overlay') ? 'Streamset-/Overlay-Datei' : 'Keine Streamset-Assets'}</option>
                              {cloudFiles.filter((f) => f.available !== false && f.category === 'overlay').map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {(selected.type === 'image' || selected.type === 'logo') && (
                          <div>
                            <label className="mb-1 block text-xs text-zinc-400" htmlFor="layout-sticker">Eigener Sticker</label>
                            <select
                              id="layout-sticker"
                              aria-label="Eigenen Sticker wählen"
                              className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                              value={selected.sourceStickerJobId ?? ''}
                              onChange={(e) => {
                                const job = ownedStickers.find((p) => p.id === e.target.value);
                                updateElement(selected.id, {
                                  sourceStickerJobId: job?.id,
                                  imageUrl: job?.imageUrl,
                                  fileId: job?.fileId,
                                });
                              }}
                            >
                              <option value="">Kein Sticker</option>
                              {ownedStickers.filter((p) => p.status === 'completed' && !p.fileMissing).map((p) => (
                                <option key={p.id} value={p.id}>Sticker v{p.version ?? 1}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {selected.type !== 'facecam' && selected.type !== 'overlay' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 w-full gap-2"
                          loading={uploading}
                          aria-label="Bild hochladen"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-4 w-4" />
                          Bild hochladen
                        </Button>
                        )}
                        {(selected.imageUrl || selected.fileId) && (
                          <button
                            type="button"
                            className="min-h-11 w-full text-xs text-red-400 hover:underline"
                            onClick={() =>
                              updateElement(selected.id, {
                                imageUrl: undefined,
                                fileId: undefined,
                                sourceFacecamJobId: undefined,
                                sourceOverlayJobId: undefined,
                                sourceStickerJobId: undefined,
                                sourceLogoJobId: undefined,
                              })
                            }
                          >
                            Bild entfernen (Datei bleibt in der Cloud)
                          </button>
                        )}
                      </div>
                    )}

                    {selected.type === 'text' && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input label="Schriftgröße" type="number" min={8} max={400} value={selected.fontSize ?? 28} onChange={(e) => updateElement(selected.id, { fontSize: Number(e.target.value) || 28 })} />
                        <label className="block text-xs font-medium text-zinc-400" htmlFor="layout-weight">
                          Gewicht
                          <select id="layout-weight" className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 text-sm" value={String(selected.fontWeight ?? 700)} onChange={(e) => updateElement(selected.id, { fontWeight: Number(e.target.value) || 700 })}>
                            <option value="400">Regular</option>
                            <option value="600">Semibold</option>
                            <option value="700">Bold</option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-zinc-400" htmlFor="layout-align">
                          Ausrichtung
                          <select id="layout-align" className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 text-sm" value={selected.textAlign ?? 'center'} onChange={(e) => updateElement(selected.id, { textAlign: e.target.value as LayoutElement['textAlign'] })}>
                            <option value="left">Links</option>
                            <option value="center">Mitte</option>
                            <option value="right">Rechts</option>
                          </select>
                        </label>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="min-h-11" aria-pressed={selected.visible === false} onClick={() => updateElement(selected.id, { visible: selected.visible === false })}>
                        <EyeOff className="h-3 w-3" /> {selected.visible === false ? 'Einblenden' : 'Ausblenden'}
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-11" aria-pressed={Boolean(selected.locked)} onClick={() => updateElement(selected.id, { locked: !selected.locked })}>
                        <Lock className="h-3 w-3" /> {selected.locked ? 'Entsperren' : 'Sperren'}
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-11" aria-label="Ebene nach vorne" onClick={() => setElements((prev) => {
                        const i = prev.findIndex((e) => e.id === selected.id);
                        if (i < 0 || i >= prev.length - 1) return prev;
                        const next = [...prev];
                        const tmp = next[i]!;
                        next[i] = next[i + 1]!;
                        next[i + 1] = tmp;
                        return next.map((el, idx) => ({ ...el, zIndex: idx }));
                      })}>Nach vorne</Button>
                      <Button size="sm" variant="outline" className="min-h-11" aria-label="Ebene nach hinten" onClick={() => setElements((prev) => {
                        const i = prev.findIndex((e) => e.id === selected.id);
                        if (i <= 0) return prev;
                        const next = [...prev];
                        const tmp = next[i]!;
                        next[i] = next[i - 1]!;
                        next[i - 1] = tmp;
                        return next.map((el, idx) => ({ ...el, zIndex: idx }));
                      })}>Nach hinten</Button>
                      <Button size="sm" variant="outline" className="min-h-11" aria-label="Element duplizieren" onClick={() => {
                        const copy = { ...selected, id: crypto.randomUUID(), x: selected.x + 24, y: selected.y + 24 };
                        setElements((prev) => [...prev, copy]);
                        setSelectedIds([copy.id]);
                      }}><Copy className="h-3 w-3" /> Duplizieren</Button>
                    </div>

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
                  </>
                )}
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
                aria-label="Plattform"
                className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  data-testid="layout-preset-twitch"
                  onClick={() => applyStreamLayoutPreset('twitch')}
                >
                  Twitch 16:9
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  data-testid="layout-preset-tiktok"
                  onClick={() => applyStreamLayoutPreset('tiktok')}
                >
                  TikTok 9:16
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  data-testid="layout-preset-youtube"
                  onClick={() => applyStreamLayoutPreset('youtube')}
                >
                  YouTube 16:9
                </Button>
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={newEmptyLayout}>
                  Neues Layout
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => { setPlatform('twitch'); setCanvasW(1920); setCanvasH(1080); }}>1920×1080</Button>
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => { setPlatform('tiktok'); setCanvasW(1080); setCanvasH(1920); }}>1080×1920</Button>
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => { setPlatform('custom'); setCanvasW(1080); setCanvasH(1080); }}>1080×1080</Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Input id="layout-canvas-w" label="Canvas Breite" type="number" min={320} max={3840} className="min-h-11" value={canvasW} onChange={(e) => setCanvasW(Math.max(320, Math.min(3840, Number(e.target.value) || 1920)))} />
                <Input id="layout-canvas-h" label="Canvas Höhe" type="number" min={320} max={3840} className="min-h-11" value={canvasH} onChange={(e) => setCanvasH(Math.max(320, Math.min(3840, Number(e.target.value) || 1080)))} />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-zinc-400" htmlFor="layout-bg">Hintergrund</label>
                <select id="layout-bg" aria-label="Hintergrund" className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 text-sm" value={background.mode} onChange={(e) => setBackground({ mode: e.target.value as 'transparent' | 'solid', color: background.color || '#000000' })}>
                  <option value="transparent">Transparent</option>
                  <option value="solid">Farbe</option>
                </select>
                {background.mode === 'solid' && (
                  <input aria-label="Hintergrundfarbe" type="color" className="mt-2 h-11 w-full" value={background.color || '#000000'} onChange={(e) => setBackground({ mode: 'solid', color: e.target.value })} />
                )}
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-zinc-400" htmlFor="layout-project">Projekt</label>
                <select id="layout-project" aria-label="Projekt zuordnen" className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Kein Projekt</option>
                  {brandProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {layouts.length === 0 && (
              <p className="mt-4 text-xs text-zinc-500">Noch kein Layout — Preset wählen oder Elemente hinzufügen.</p>
            )}
            {layouts.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-zinc-500">Gespeicherte Layouts</p>
                {layouts.map((l) => (
                  <div key={l.id} className="mb-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void openSavedLayout(l.id)}
                      className={`min-h-11 min-w-0 flex-1 rounded px-2 py-1.5 text-left text-xs ${
                        current?.id === l.id ? 'bg-brand-600/20 text-brand-300' : 'text-zinc-400 hover:bg-white/5'
                      }`}
                    >
                      {l.name} · {l.platform} · {l.canvas.width}×{l.canvas.height}
                      <span className="block text-[10px] text-zinc-500">{new Date(l.updatedAt).toLocaleString('de-DE')}</span>
                    </button>
                    <Button size="sm" variant="outline" className="min-h-11" aria-label={`${l.name} duplizieren`} onClick={() => void api.layout.duplicate(l.id).then((r) => { setLayouts((prev) => [r.layout, ...prev]); loadLayout(r.layout); })}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="min-h-11" aria-label={`${l.name} löschen`} onClick={() => void api.layout.delete(l.id).then(() => { setLayouts((prev) => prev.filter((x) => x.id !== l.id)); if (current?.id === l.id) { setCurrent(null); resetHistory([]); } })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </NeonCard>

          <p className="text-[10px] leading-relaxed text-zinc-600">
            Shift = Seitenverhältnis · Alt = von Mitte · Strg = Snap aus · Shift+Klick = Mehrfachauswahl
          </p>
        </div>

        <NeonCard accent="purple" className="lg:col-span-3 overflow-hidden p-4">
          {loading && <p className="mb-2 text-sm text-zinc-500" role="status">{current ? 'Layout wird gespeichert…' : 'Layout wird geladen…'}</p>}
          <div
            ref={canvasRef}
            className="relative mx-auto max-w-full touch-none overflow-hidden border border-white/10"
            aria-label={`Layout-Canvas ${canvasW} mal ${canvasH} Pixel, ${previewMode ? 'Vorschau' : 'Editor'}`}
            style={{
              width: canvasW * scale,
              height: canvasH * scale,
              background: background.mode === 'solid' ? background.color || '#000' : 'transparent',
              backgroundImage: background.mode === 'transparent' ? 'linear-gradient(45deg,#18181b 25%,transparent 25%),linear-gradient(-45deg,#18181b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#18181b 75%),linear-gradient(-45deg,transparent 75%,#18181b 75%)' : undefined,
              backgroundSize: background.mode === 'transparent' ? '24px 24px' : undefined,
              backgroundPosition: background.mode === 'transparent' ? '0 0, 0 12px, 12px -12px, -12px 0' : undefined,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelectedIds([]);
            }}
          >
            {platform === 'tiktok' && !previewMode && (
              <div
                data-testid="layout-safe-area"
                className="pointer-events-none absolute inset-[6%] rounded border border-dashed border-cyan-400/40"
                aria-hidden="true"
              />
            )}
            {[...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(renderElement)}
            {renderSelectionOverlay()}
            {elements.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-600">
                <span>Layout hat keine Elemente</span>
                <span className="text-xs">Preset wählen oder Gameplay / Facecam / Chat hinzufügen</span>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">
            Canvas {canvasW}×{canvasH} · {elements.length} Elemente
            {selectedIds.length > 0 ? ` · ${selectedIds.length} ausgewählt` : ''}
            {selected ? ` · ${selected.label ?? selected.type}${selected.locked ? ' (gesperrt)' : ''}${selected.visible === false ? ' (ausgeblendet)' : ''}` : ''}
          </p>
        </NeonCard>
      </div>
    </StudioShell>
  );
}
