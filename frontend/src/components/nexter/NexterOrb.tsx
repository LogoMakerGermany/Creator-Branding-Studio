import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  clampNexterAudioLevel,
  nexterOrbStatusLabel,
  resolveNexterOrbState,
  type NexterOrbState,
} from '@ucbs/shared';

const DEFAULT_PRIMARY = '#3b82f6';
const DEFAULT_SECONDARY = '#a855f7';

const INTENSITY: Record<NexterOrbState, number> = {
  idle: 0.38,
  listening: 0.72,
  thinking: 0.64,
  speaking: 0.78,
  generating: 0.84,
  success: 0.9,
  warning: 0.56,
  error: 0.74,
};

const SPEED: Record<NexterOrbState, number> = {
  idle: 0.38,
  listening: 1.02,
  thinking: 0.82,
  speaking: 1.22,
  generating: 1.12,
  success: 1.35,
  warning: 0.68,
  error: 1.48,
};

function readCssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function parseRgb(input: string, fallback: [number, number, number]): [number, number, number] {
  const raw = input.trim();
  const rgb = raw.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = raw.replace('#', '');
  if (hex.length === 3 && /^[0-9a-f]+$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  if (hex.length >= 6 && /^[0-9a-f]+$/i.test(hex.slice(0, 6))) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return fallback;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseRgb(hex, [59, 130, 246]);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseRgb(a, [59, 130, 246]);
  const [r2, g2, b2] = parseRgb(b, [248, 250, 252]);
  const m = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * m)}, ${Math.round(g1 + (g2 - g1) * m)}, ${Math.round(b1 + (b2 - b1) * m)})`;
}

function arcLife(t: number, seed: number, cycle: number): number {
  const phase = ((t * 0.22 + seed * 0.17) % cycle) / cycle;
  if (phase < 0.12) return phase / 0.12;
  if (phase > 0.78) return Math.max(0, (1 - phase) / 0.22);
  return 1;
}

export function NexterOrb({
  state = 'idle',
  size = 72,
  audioLevel = 0,
  primaryColor,
  secondaryColor,
  className,
  decorative = false,
  responsive = false,
  variant = 'plasma',
}: {
  state?: NexterOrbState | string;
  size?: number;
  audioLevel?: number;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  decorative?: boolean;
  responsive?: boolean;
  variant?: 'plasma' | 'identity';
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const audioRef = useRef(audioLevel);
  const sizeRef = useRef(size);
  const colorsRef = useRef({ primary: primaryColor, secondary: secondaryColor });
  stateRef.current = state;
  audioRef.current = audioLevel;
  sizeRef.current = size;
  colorsRef.current = { primary: primaryColor, secondary: secondaryColor };

  const resolved = resolveNexterOrbState(state);
  const identity = variant === 'identity';

  useEffect(() => {
    if (identity) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const canvasEl = canvas;
    const gfx = ctx;
    const mq =
      typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    let frame = 0;
    let raf = 0;
    let pixelSize = sizeRef.current;
    let intensity = INTENSITY.idle;
    let lastKey = '';
    let alive = true;

    function measure(): number {
      if (responsive && wrap) {
        const box = wrap.getBoundingClientRect();
        return Math.max(48, Math.round(Math.min(box.width, box.height) || sizeRef.current));
      }
      return sizeRef.current;
    }

    function palette(s: NexterOrbState): [string, string] {
      const primary =
        colorsRef.current.primary ||
        readCssColor('--nexter-orb-primary', readCssColor('--ucbs-accent-cyan', DEFAULT_PRIMARY));
      const secondary =
        colorsRef.current.secondary ||
        readCssColor('--nexter-orb-secondary', readCssColor('--ucbs-accent-purple', DEFAULT_SECONDARY));
      if (s === 'success') return [readCssColor('--ucbs-accent-green', '#34d399'), primary];
      if (s === 'warning') return [secondary, '#f59e0b'];
      if (s === 'error') return [secondary, '#fb7185'];
      return [primary, secondary];
    }

    function strokeArc(
      cx: number,
      cy: number,
      angle: number,
      inner: number,
      outer: number,
      segs: number,
      jagged: number,
      t: number,
      seed: number
    ) {
      gfx.beginPath();
      for (let k = 0; k <= segs; k++) {
        const p = k / segs;
        const reach = inner + (outer - inner) * p;
        const sway = Math.sin(t * 1.55 + seed + p * 6.4) * jagged * (0.22 + (1 - p) * 0.78);
        const drift = Math.cos(t * 0.9 + seed * 1.6 + p * 4.2) * jagged * 0.38 * (1 - p);
        const a = angle + Math.sin(t * 0.35 + seed * 0.8 + p * 1.8) * 0.11;
        const perp = a + Math.PI / 2;
        const x = cx + Math.cos(a) * reach + Math.cos(perp) * (sway + drift);
        const y = cy + Math.sin(a) * reach + Math.sin(perp) * (sway + drift);
        if (k === 0) gfx.moveTo(x, y);
        else gfx.lineTo(x, y);
      }
      gfx.stroke();
    }

    function draw(s: NexterOrbState, audio: number, reduceMotion: boolean, t: number) {
      pixelSize = measure();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = Math.round(pixelSize * dpr);
      const nextH = Math.round(pixelSize * dpr);
      if (canvasEl.width !== nextW || canvasEl.height !== nextH) {
        canvasEl.width = nextW;
        canvasEl.height = nextH;
        canvasEl.style.width = `${pixelSize}px`;
        canvasEl.style.height = `${pixelSize}px`;
        gfx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const [c1, c2] = palette(s);
      const highlight = mixHex(c1, '#f8fafc', 0.72);
      const target = INTENSITY[s] + audio * (s === 'speaking' || s === 'listening' ? 0.24 : 0.08);
      intensity = reduceMotion ? target : intensity + (target - intensity) * 0.08;
      const speed = SPEED[s];
      const breathe =
        reduceMotion
          ? 1 + intensity * 0.03
          : 1 + Math.sin(t * (s === 'idle' ? 0.72 : 1.35 + speed * 0.28)) * (0.016 + intensity * 0.03);
      const jitter = s === 'error' ? Math.sin(t * 8.4) * 0.03 : s === 'warning' ? Math.sin(t * 2.6) * 0.01 : 0;
      const cx = pixelSize / 2;
      const cy = pixelSize / 2;
      const r = pixelSize * 0.485;
      const thinking = s === 'thinking';
      const generating = s === 'generating';
      const listening = s === 'listening';
      const speaking = s === 'speaking';
      const inward = thinking || generating ? 0.22 : listening ? 0.04 : 0.1;

      gfx.clearRect(0, 0, pixelSize, pixelSize);

      const aura = gfx.createRadialGradient(cx, cy, r * 0.18, cx, cy, r * 1.12);
      aura.addColorStop(0, rgba(c1, 0.16 + intensity * 0.2));
      aura.addColorStop(0.58, rgba(c2, 0.08 + intensity * 0.07));
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = aura;
      gfx.beginPath();
      gfx.arc(cx, cy, r * 1.08 * breathe, 0, Math.PI * 2);
      gfx.fill();

      gfx.save();
      gfx.beginPath();
      gfx.arc(cx, cy, r * breathe, 0, Math.PI * 2);
      gfx.clip();

      const voidFill = gfx.createRadialGradient(cx - r * 0.18, cy - r * 0.28, r * 0.04, cx + r * 0.12, cy + r * 0.22, r);
      voidFill.addColorStop(0, 'rgba(14, 22, 42, 0.22)');
      voidFill.addColorStop(0.42, 'rgba(5, 8, 18, 0.78)');
      voidFill.addColorStop(1, 'rgba(2, 3, 8, 0.96)');
      gfx.fillStyle = voidFill;
      gfx.fillRect(cx - r, cy - r, r * 2, r * 2);

      const nebula = gfx.createRadialGradient(cx, cy, r * 0.02, cx, cy, r * (0.58 + intensity * 0.16));
      nebula.addColorStop(0, rgba(highlight, 0.28 + intensity * 0.22));
      nebula.addColorStop(0.28, rgba(c1, 0.34 + intensity * 0.28));
      nebula.addColorStop(0.62, rgba(c2, 0.16 + intensity * 0.14));
      nebula.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = nebula;
      gfx.beginPath();
      gfx.arc(cx, cy, r * (thinking ? 0.52 : 0.7) * breathe, 0, Math.PI * 2);
      gfx.fill();

      gfx.lineCap = 'round';
      gfx.lineJoin = 'round';

      const layers: Array<{ count: number; alpha: number; width: number; inner: number; outer: number; jagged: number }> = [
        { count: reduceMotion ? 3 : 7, alpha: 0.16, width: pixelSize / 52, inner: r * 0.2, outer: r * 0.72, jagged: 5.5 },
        { count: reduceMotion ? 4 : 9, alpha: 0.34, width: pixelSize / 78, inner: r * (0.12 + inward), outer: r * 0.9, jagged: 7.2 },
        { count: reduceMotion ? 2 : 4, alpha: 0.55, width: pixelSize / 110, inner: r * (0.1 + inward * 0.6), outer: r * 0.96, jagged: 4.4 },
      ];

      layers.forEach((layer, layerIndex) => {
        const extra = generating ? 1 : listening || speaking ? 1 : 0;
        const count = Math.min(layer.count + extra, 11);
        for (let i = 0; i < count; i++) {
          const seed = i * 1.618 + layerIndex * 4.1;
          const life = reduceMotion ? 0.72 : arcLife(t * speed, seed, 3.6 + (i % 4) * 0.55);
          if (life < 0.08) continue;
          const a =
            t * speed * (0.18 + layerIndex * 0.07) +
            (i * Math.PI * 2) / count +
            Math.sin(t * 0.45 + seed) * 0.28 +
            jitter;
          const outer =
            layer.outer * breathe * (1 + Math.sin(t * 1.3 + seed) * 0.045 + audio * 0.08 + (listening ? 0.05 : 0));
          const inner = layer.inner * breathe * (thinking ? 1.25 : 1);
          gfx.strokeStyle = rgba(i % 2 ? c2 : i % 3 === 0 ? highlight : c1, (layer.alpha + intensity * 0.22) * life);
          gfx.lineWidth = Math.max(0.7, layer.width);
          strokeArc(cx, cy, a, inner, outer, reduceMotion ? 3 : 7, reduceMotion ? 1.1 : layer.jagged * (0.7 + intensity * 0.5), t, seed);

          if (!reduceMotion && layerIndex > 0 && i % 2 === 0 && life > 0.45) {
            const mid = inner + (outer - inner) * 0.42;
            const fork = a + (i % 2 ? 0.42 : -0.38) * (0.7 + Math.sin(t + seed));
            gfx.strokeStyle = rgba(c1, (0.14 + intensity * 0.18) * life);
            gfx.lineWidth = Math.max(0.55, layer.width * 0.65);
            strokeArc(cx, cy, fork, mid * 0.72, mid + (outer - mid) * 0.35, 4, layer.jagged * 0.55, t, seed + 2.2);
          }
        }
      });

      const sparks = reduceMotion ? 3 : 8;
      for (let i = 0; i < sparks; i++) {
        const life = (t * (0.07 + intensity * 0.05) + i * 0.14) % 1;
        const dist = r * (0.88 - life * (0.58 + inward));
        const a = i * 0.92 + t * 0.1 * speed;
        gfx.fillStyle = rgba(i % 2 ? highlight : c2, (1 - life) * (0.18 + intensity * 0.32));
        gfx.beginPath();
        gfx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a * 1.04) * dist, Math.max(0.6, pixelSize * 0.006 * (1 - life)), 0, Math.PI * 2);
        gfx.fill();
      }

      const coreR = r * (0.13 + intensity * 0.045 + audio * 0.05 + (thinking ? 0.02 : 0)) * breathe;
      const outerCore = gfx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, coreR * 2.4);
      outerCore.addColorStop(0, rgba(highlight, 0.22 + intensity * 0.18));
      outerCore.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = outerCore;
      gfx.beginPath();
      gfx.arc(cx, cy, coreR * 2.35, 0, Math.PI * 2);
      gfx.fill();

      const core = gfx.createRadialGradient(cx - coreR * 0.3, cy - coreR * 0.38, 1, cx, cy, coreR);
      core.addColorStop(0, 'rgba(255,255,255,0.55)');
      core.addColorStop(0.28, rgba(highlight, 0.7));
      core.addColorStop(0.7, rgba(c1, 0.55));
      core.addColorStop(1, rgba(c2, 0.12));
      gfx.fillStyle = core;
      gfx.beginPath();
      gfx.arc(cx, cy, coreR, 0, Math.PI * 2);
      gfx.fill();
      gfx.restore();

      if (listening && !reduceMotion) {
        gfx.strokeStyle = rgba(c1, 0.18 + Math.sin(t * 3.2) * 0.08);
        gfx.lineWidth = Math.max(1, pixelSize * 0.008);
        gfx.beginPath();
        gfx.arc(cx, cy, r * breathe * (0.98 + Math.sin(t * 2.4) * 0.012), 0, Math.PI * 2);
        gfx.stroke();
      }

      gfx.strokeStyle = 'rgba(255,255,255,0.22)';
      gfx.lineWidth = Math.max(0.8, pixelSize * 0.007);
      gfx.beginPath();
      gfx.arc(cx, cy, r * breathe - gfx.lineWidth / 2, 0, Math.PI * 2);
      gfx.stroke();

      gfx.strokeStyle = 'rgba(8,12,24,0.28)';
      gfx.beginPath();
      gfx.arc(cx + r * 0.08, cy + r * 0.12, r * breathe * 0.97, 0.15 * Math.PI, 0.95 * Math.PI);
      gfx.stroke();
    }

    function tick() {
      if (!alive) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (hidden) {
        raf = 0;
        return;
      }
      const reduceMotion = Boolean(mq?.matches);
      const s = resolveNexterOrbState(stateRef.current);
      const audio = clampNexterAudioLevel(audioRef.current);
      const colors = `${colorsRef.current.primary || ''}|${colorsRef.current.secondary || ''}`;
      if (!reduceMotion) frame += 1;
      const t = reduceMotion ? 0.35 : frame / 52;
      const key = `${s}|${audio.toFixed(3)}|${measure()}|${reduceMotion ? 0 : frame}|${colors}`;
      if (key !== lastKey) {
        lastKey = key;
        draw(s, audio, reduceMotion, t);
      }
      raf = requestAnimationFrame(tick);
    }

    function onVis() {
      if (!alive) return;
      if (!document.hidden && raf === 0) raf = requestAnimationFrame(tick);
    }

    function onMotion() {
      lastKey = '';
    }

    tick();
    const ro = responsive && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      lastKey = '';
    }) : null;
    if (ro && wrap) ro.observe(wrap);
    document.addEventListener('visibilitychange', onVis);
    mq?.addEventListener('change', onMotion);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      raf = 0;
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener('change', onMotion);
    };
  }, [responsive, identity]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        'nexter-orb',
        responsive && 'nexter-orb--responsive',
        identity && 'nexter-orb--identity',
        className
      )}
      style={responsive || identity ? undefined : { width: size, height: size }}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Nexter ${nexterOrbStatusLabel(resolved)}`}
      aria-live={decorative ? undefined : 'polite'}
      data-state={resolved}
      role={decorative ? undefined : 'img'}
    >
      <div className="nexter-orb__glass">
        {identity ? null : <canvas ref={canvasRef} className="nexter-orb__canvas" aria-hidden="true" />}
        <span className="nexter-orb__mark" aria-hidden="true">
          N
        </span>
        {identity ? null : <span className="nexter-orb__specular" aria-hidden="true" />}
      </div>
    </div>
  );
}
