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

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
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

    function polar(cx: number, cy: number, angle: number, radius: number): [number, number] {
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    }

    function strokeBolt(
      cx: number,
      cy: number,
      startA: number,
      startR: number,
      endA: number,
      endR: number,
      t: number,
      seed: number,
      maxR: number
    ) {
      const clampR = (value: number) => Math.min(maxR, Math.max(2, value));
      const sR = clampR(startR);
      const eR = clampR(endR);
      const mid = 0.28 + hash(seed + 3.1) * 0.22;
      const mid2 = 0.58 + hash(seed + 8.4) * 0.2;
      const bend = (hash(seed + 1.7) - 0.5) * 0.95;
      const bend2 = (hash(seed + 4.9) - 0.5) * 0.8;
      const c1A = startA + (endA - startA) * mid + bend + Math.sin(t * 1.1 + seed) * 0.12;
      const c2A = startA + (endA - startA) * mid2 + bend2 + Math.cos(t * 0.8 + seed * 1.3) * 0.1;
      const c1R = clampR(sR + (eR - sR) * (0.22 + hash(seed + 2.2) * 0.28) + Math.sin(t * 1.4 + seed) * 6);
      const c2R = clampR(sR + (eR - sR) * (0.62 + hash(seed + 6.6) * 0.2) + Math.cos(t * 1.05 + seed) * 5);
      gfx.beginPath();
      gfx.moveTo(...polar(cx, cy, startA, sR));
      gfx.bezierCurveTo(
        ...polar(cx, cy, c1A, c1R),
        ...polar(cx, cy, c2A, c2R),
        ...polar(cx, cy, endA, eR)
      );
      gfx.stroke();
      return { midA: c1A, midR: c1R, endA, endR: eR };
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
      gfx.arc(cx, cy, r * 0.985, 0, Math.PI * 2);
      gfx.clip();

      const voidFill = gfx.createRadialGradient(cx - r * 0.18, cy - r * 0.28, r * 0.04, cx + r * 0.12, cy + r * 0.22, r);
      voidFill.addColorStop(0, 'rgba(14, 22, 42, 0.22)');
      voidFill.addColorStop(0.42, 'rgba(5, 8, 18, 0.78)');
      voidFill.addColorStop(1, 'rgba(2, 3, 8, 0.96)');
      gfx.fillStyle = voidFill;
      gfx.fillRect(cx - r, cy - r, r * 2, r * 2);

      const nebula = gfx.createRadialGradient(cx, cy, r * 0.02, cx, cy, r * (0.58 + intensity * 0.16));
      nebula.addColorStop(0, rgba(highlight, 0.22 + intensity * 0.18));
      nebula.addColorStop(0.28, rgba(c1, 0.3 + intensity * 0.24));
      nebula.addColorStop(0.62, rgba(c2, 0.14 + intensity * 0.12));
      nebula.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = nebula;
      gfx.beginPath();
      gfx.arc(cx, cy, r * (thinking ? 0.52 : 0.7) * breathe, 0, Math.PI * 2);
      gfx.fill();

      gfx.lineCap = 'round';
      gfx.lineJoin = 'round';

      const limit = r * 0.93;
      const layers: Array<{ count: number; alpha: number; width: number }> = [
        { count: reduceMotion ? 3 : 6, alpha: 0.15, width: pixelSize / 56 },
        { count: reduceMotion ? 4 : 8, alpha: 0.32, width: pixelSize / 84 },
        { count: reduceMotion ? 1 : 3, alpha: 0.5, width: pixelSize / 120 },
      ];

      layers.forEach((layer, layerIndex) => {
        const extra = generating ? 1 : listening || speaking ? 1 : 0;
        const count = Math.min(layer.count + extra, 9);
        for (let i = 0; i < count; i++) {
          const seed = 11.3 + i * 2.399 + layerIndex * 5.17;
          const life = reduceMotion ? 0.7 : arcLife(t * speed, seed, 3.8 + hash(seed) * 1.6);
          if (life < 0.08) continue;
          const kind = Math.floor(hash(seed + 0.4) * 4);
          const a0 = seed * 1.13 + t * speed * (0.09 + layerIndex * 0.04) + jitter;
          let startR: number;
          let endR: number;
          let startA: number;
          let endA: number;
          if (kind === 0) {
            startR = r * (0.14 + hash(seed + 1) * 0.12 + (thinking ? 0.04 : 0));
            endR = r * (0.55 + hash(seed + 2) * 0.32);
            startA = a0;
            endA = a0 + (hash(seed + 3) - 0.48) * 1.15;
          } else if (kind === 1) {
            startR = r * (0.34 + hash(seed + 1) * 0.18);
            endR = r * (0.36 + hash(seed + 2) * 0.22);
            startA = a0;
            endA = a0 + 0.55 + hash(seed + 3) * 1.05;
          } else if (kind === 2) {
            startR = r * (0.3 + hash(seed + 1) * 0.16);
            endR = r * (0.72 + hash(seed + 2) * 0.16 + (listening ? 0.04 : 0));
            startA = a0 + 0.2;
            endA = a0 + (hash(seed + 3) - 0.42) * 0.85;
          } else {
            startR = r * (0.18 + hash(seed + 1) * 0.1);
            endR = r * (0.42 + hash(seed + 2) * 0.18);
            startA = a0;
            endA = a0 + (hash(seed + 3) - 0.5) * 1.25;
          }
          gfx.strokeStyle = rgba(i % 2 ? c2 : i % 3 === 0 ? highlight : c1, (layer.alpha + intensity * 0.2) * life);
          gfx.lineWidth = Math.max(0.65, layer.width);
          const bolt = strokeBolt(cx, cy, startA, startR * breathe, endA, endR * breathe, t, seed, limit);

          const forks = reduceMotion ? 0 : Math.floor(hash(seed + 9.1) * 3.2);
          if (layerIndex > 0 && forks > 0 && life > 0.4) {
            for (let f = 0; f < forks; f++) {
              const fSeed = seed + 20 + f * 3.7;
              gfx.strokeStyle = rgba(c1, (0.1 + intensity * 0.14) * life);
              gfx.lineWidth = Math.max(0.5, layer.width * 0.55);
              strokeBolt(
                cx,
                cy,
                bolt.midA,
                bolt.midR,
                bolt.midA + (hash(fSeed) - 0.5) * 0.9,
                Math.min(limit, bolt.midR + r * (0.12 + hash(fSeed + 1) * 0.16)),
                t,
                fSeed,
                limit
              );
            }
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

      const coreR = r * (0.11 + intensity * 0.04 + audio * 0.05 + (thinking ? 0.025 : 0)) * breathe;
      const outerCore = gfx.createRadialGradient(cx, cy, coreR * 0.15, cx, cy, coreR * 2.8);
      outerCore.addColorStop(0, rgba(highlight, 0.2 + intensity * 0.16));
      outerCore.addColorStop(0.45, rgba(c1, 0.12 + intensity * 0.1));
      outerCore.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = outerCore;
      gfx.beginPath();
      gfx.arc(cx, cy, coreR * 2.7, 0, Math.PI * 2);
      gfx.fill();

      const core = gfx.createRadialGradient(cx - coreR * 0.28, cy - coreR * 0.34, 1, cx, cy, coreR);
      core.addColorStop(0, 'rgba(255,255,255,0.32)');
      core.addColorStop(0.35, rgba(highlight, 0.48));
      core.addColorStop(0.72, rgba(c1, 0.28));
      core.addColorStop(1, 'rgba(0,0,0,0)');
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
