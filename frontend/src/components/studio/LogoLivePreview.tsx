import type { CSSProperties } from 'react';
import type { LogoGenerationOptions } from '@ucbs/shared';
import { collectMagikColors as collectLogoColors, logoLightingPreviewFactors, resolveLogoMaterial, getLogoMaterialPreset, logoMaterialPreviewStyle } from '@ucbs/shared';

interface LogoLivePreviewProps {
  form: LogoGenerationOptions;
  imageUrl?: string | null;
  loading?: boolean;
  nameAnalysis?: string | null;
}

export function LogoLivePreview({ form, imageUrl, loading, nameAnalysis }: LogoLivePreviewProps) {
  const colors = collectLogoColors(form);
  const primary = form.primaryColor ?? colors[0] ?? '#22d3ee';
  const secondary = form.secondaryColor ?? colors[1] ?? '#a855f7';
  const accent = form.accentColor ?? colors[2] ?? '#34d399';
  const glow = form.glowColor ?? accent;
  const lighting = logoLightingPreviewFactors(form);
  const materialId = resolveLogoMaterial(form);
  const materialPreset = getLogoMaterialPreset(materialId);
  const materialPreview = logoMaterialPreviewStyle(materialId);
  const gradientCss =
    form.logoGradientEnabled && form.logoGradientFrom && form.logoGradientTo
      ? `linear-gradient(${form.logoGradientAngle ?? 135}deg, ${form.logoGradientFrom}, ${form.logoGradientTo})`
      : null;
  const name = form.logoName?.trim() || 'Dein Logo';
  const isRing = form.ringLogoMode === 'yes' || (form.ringLogoMode === 'auto' && form.ringLogo);
  const is3d = form.magikLogoArt?.includes('3d') || form.dimension === '3d' || form.threeD;
  const bgTransparent = form.magikBackground === 'transparent' || form.transparentBackground;

  if (imageUrl) {
    return (
      <div className="relative h-full w-full">
        <img src={imageUrl} alt={name} className="h-full w-full object-contain" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
            Wird neu generiert…
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center p-6"
      style={{
        background: bgTransparent
          ? 'repeating-conic-gradient(#1a1f2a 0% 25%, #151b24 0% 50%) 0 0 / 16px 16px'
          : gradientCss
            ? gradientCss
            : form.backgroundType === 'gradient'
              ? `linear-gradient(135deg, ${primary}44, ${secondary}66)`
              : form.backgroundType === 'dark'
                ? 'linear-gradient(180deg, #0b0f14, #1a1f2a)'
                : form.backgroundColor ?? '#151b24',
      }}
    >
      <div
        className={`relative flex items-center justify-center transition-all ${
          isRing ? 'h-40 w-40 rounded-full border-4' : 'h-36 w-36 rounded-2xl border-2'
        } ${is3d ? 'shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]' : 'shadow-lg'}`}
        style={{
          borderColor: primary,
          borderStyle: materialPreview.borderStyle as CSSProperties['borderStyle'],
          background: materialPreview.sheen
            ? `${materialPreview.sheen}, linear-gradient(${is3d ? '145deg' : '180deg'}, ${primary}bb, ${secondary}55)`
            : `linear-gradient(${is3d ? '145deg' : '180deg'}, ${primary}bb, ${secondary}55)`,
          boxShadow: [
            is3d
              ? `0 ${8 + lighting.shadow * 16}px ${28 + lighting.bloom * 28}px -8px rgba(0,0,0,${(0.45 + lighting.shadow * 0.4).toFixed(2)})`
              : '',
            `0 0 ${18 + lighting.glow * 42}px ${glow}${lighting.glow > 0.5 ? 'cc' : '88'}`,
            lighting.rim > 0.3 ? `inset 0 0 ${Math.round(lighting.rim * 24)}px ${glow}44` : '',
          ]
            .filter(Boolean)
            .join(', '),
        }}
      >
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-white/90">
          {form.magikMode === 'character'
            ? form.magikCharacter || 'Figur'
            : form.symbol?.trim() || nameAnalysis?.split(':')[1]?.trim() || 'MAGIK AI'}
        </span>
        {isRing && (
          <div
            className="absolute inset-3 rounded-full border-2 border-dashed opacity-60"
            style={{ borderColor: accent }}
          />
        )}
      </div>

      <p
        className="mt-4 font-display text-lg font-bold tracking-tight"
        style={{
          color: primary,
          textShadow:
            form.neon || form.magikStyle === 'Neon' || lighting.glow > 0.45
              ? `0 0 ${8 + lighting.glow * 16}px ${glow}, 0 0 ${16 + lighting.bloom * 24}px ${glow}88`
              : undefined,
        }}
      >
        {name}
      </p>

      {form.clanName?.trim() && (
        <p className="mt-1 text-xs uppercase tracking-widest text-zinc-400">{form.clanName}</p>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2 text-[10px] text-zinc-500">
        {form.magikStyle && <span className="rounded-full border border-white/10 px-2 py-0.5">{form.magikStyle}</span>}
        <span className="rounded-full border border-white/10 px-2 py-0.5">{materialPreset.label}</span>
        {form.game?.trim() && <span className="rounded-full border border-white/10 px-2 py-0.5">{form.game}</span>}
        <span className="rounded-full border border-white/10 px-2 py-0.5">{is3d ? '3D' : '2D'}</span>
        {isRing && <span className="rounded-full border border-white/10 px-2 py-0.5">Ring</span>}
      </div>

      <div className="mt-3 flex gap-1.5">
        {colors.map((c) => (
          <div key={c} className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: c }} />
        ))}
      </div>

      <p className="mt-4 max-w-xs text-center text-xs text-zinc-500">
        Live-Vorschau deiner Einstellungen — nach „Logo generieren“ erscheint das KI-Ergebnis hier.
      </p>
    </div>
  );
}
