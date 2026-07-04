import type { CSSProperties } from 'react';
import type { LogoGenerationOptions } from '@ucbs/shared';
import { collectMagikColors as collectLogoColors, logoLightingPreviewFactors, resolveLogoMaterial, getLogoMaterialPreset, logoMaterialPreviewStyle, resolveLogoEffects, getLogoEffectPreset, logoEffectsPreviewHints, resolveLogoBackground, logoBackgroundPreviewStyle, getLogoBackgroundPreset, logoCameraPreviewFactors, logoDetailsPreviewFactors, logoTypographyPreviewStyle, getLogoFontPreset, resolveLogoTypography, logoAiSettingsPreviewLabel, getLogoTemplate } from '@ucbs/shared';

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
  const effects = resolveLogoEffects(form);
  const effectHints = logoEffectsPreviewHints(effects);
  const bgId = resolveLogoBackground(form);
  const bgPreview = logoBackgroundPreviewStyle(bgId, form);
  const camera = logoCameraPreviewFactors(form);
  const details = logoDetailsPreviewFactors(form);
  const typography = resolveLogoTypography(form);
  const typographyStyle = logoTypographyPreviewStyle(form, glow);
  const fontPreset = getLogoFontPreset(typography.fontFamily);
  const aiLabel = logoAiSettingsPreviewLabel(form);
  const template = form.logoTemplate ? getLogoTemplate(form.logoTemplate) : null;
  const name = form.logoName?.trim() || 'Dein Logo';
  const isRing = form.ringLogoMode === 'yes' || (form.ringLogoMode === 'auto' && form.ringLogo);
  const is3d = form.magikLogoArt?.includes('3d') || form.dimension === '3d' || form.threeD;
  const bgTransparent = bgId === 'transparent';

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

  const bgStyle = bgTransparent
    ? 'repeating-conic-gradient(#1a1f2a 0% 25%, #151b24 0% 50%) 0 0 / 16px 16px'
    : bgPreview ?? form.backgroundColor ?? '#151b24';
  const bgBlur = camera.depthOfField > 0.55 ? (camera.depthOfField - 0.55) * 8 : 0;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: bgStyle,
          filter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
          transform: bgBlur > 0 ? 'scale(1.08)' : undefined,
        }}
        aria-hidden
      />
      <div className="relative z-10 flex flex-col items-center">
      <div
        className={`relative flex items-center justify-center transition-all ${
          isRing ? 'h-40 w-40 rounded-full border-4' : 'h-36 w-36 rounded-2xl border-2'
        } ${is3d ? 'shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]' : 'shadow-lg'}`}
        style={{
          transform: [
            `scale(${0.75 + camera.zoom * 0.45})`,
            `rotate(${camera.rotation}deg)`,
            `perspective(${400 + camera.perspective * 600}px)`,
            `rotateX(${(0.5 - camera.angle) * 35}deg)`,
          ].join(' '),
          transformStyle: 'preserve-3d',
          filter: [
            `contrast(${0.85 + details.contrast * 0.35})`,
            `saturate(${0.75 + details.saturation * 0.5})`,
            details.sharpness > 0.55 ? `drop-shadow(0 0 ${(details.sharpness - 0.55) * 3}px rgba(255,255,255,0.15))` : '',
          ]
            .filter(Boolean)
            .join(' '),
          borderWidth: details.detail > 0.6 ? (isRing ? 4 : 3) : isRing ? 4 : 2,
          borderColor: primary,
          borderStyle: materialPreview.borderStyle as CSSProperties['borderStyle'],
          background: [
            materialPreview.sheen,
            `linear-gradient(${is3d ? '145deg' : '180deg'}, ${primary}${details.realism > 0.6 ? 'ee' : 'bb'}, ${secondary}${details.realism > 0.6 ? '88' : '55'})`,
            details.texture > 0.5
              ? `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,${(details.texture - 0.5) * 0.08}) 2px, rgba(255,255,255,${(details.texture - 0.5) * 0.08}) 4px)`
              : '',
          ]
            .filter(Boolean)
            .join(', '),
          boxShadow: [
            is3d
              ? `0 ${8 + lighting.shadow * 16}px ${28 + lighting.bloom * 28}px -8px rgba(0,0,0,${(0.45 + lighting.shadow * 0.4).toFixed(2)})`
              : '',
            `0 0 ${18 + lighting.glow * 42}px ${glow}${lighting.glow > 0.5 ? 'cc' : '88'}`,
            effectHints.hasGlow ? `0 0 ${28 + lighting.bloom * 20}px ${accent}66` : '',
            effectHints.hasAtmosphere ? `0 ${12 + lighting.shadow * 8}px ${40}px rgba(0,0,0,0.35)` : '',
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
        className="mt-4 tracking-tight"
        style={{
          color: primary,
          ...typographyStyle,
          textShadow:
            typographyStyle.textShadow ??
            (form.neon || form.magikStyle === 'Neon' || lighting.glow > 0.45
              ? `0 0 ${8 + lighting.glow * 16}px ${glow}, 0 0 ${16 + lighting.bloom * 24}px ${glow}88`
              : undefined),
        }}
      >
        {name}
      </p>

      {form.clanName?.trim() && (
        <p className="mt-1 text-xs uppercase tracking-widest text-zinc-400">{form.clanName}</p>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2 text-[10px] text-zinc-500">
        {form.magikStyle && <span className="rounded-full border border-white/10 px-2 py-0.5">{form.magikStyle}</span>}
        {template && (
          <span className="rounded-full border border-[var(--ucbs-accent-purple)]/30 px-2 py-0.5 text-[var(--ucbs-accent-purple)]">
            {template.label}
          </span>
        )}
        <span className="rounded-full border border-white/10 px-2 py-0.5">{materialPreset.label}</span>
        <span className="rounded-full border border-white/10 px-2 py-0.5">
          {bgId === 'custom'
            ? 'Custom BG'
            : getLogoBackgroundPreset(bgId).label}
        </span>
        {effects.slice(0, 3).map((id) => (
          <span key={id} className="rounded-full border border-[var(--ucbs-accent-green)]/30 px-2 py-0.5 text-[var(--ucbs-accent-green)]">
            {getLogoEffectPreset(id).label}
          </span>
        ))}
        {effects.length > 3 && (
          <span className="rounded-full border border-white/10 px-2 py-0.5">+{effects.length - 3}</span>
        )}
        {form.game?.trim() && <span className="rounded-full border border-white/10 px-2 py-0.5">{form.game}</span>}
        <span className="rounded-full border border-[var(--ucbs-accent-purple)]/30 px-2 py-0.5 text-[var(--ucbs-accent-purple)]">
          Zoom {Math.round(camera.zoom * 100)}%
        </span>
        <span className="rounded-full border border-[var(--ucbs-accent-purple)]/30 px-2 py-0.5 text-[var(--ucbs-accent-purple)]">
          KI · {aiLabel}
        </span>
        <span className="rounded-full border border-[var(--ucbs-accent-cyan)]/30 px-2 py-0.5 text-[var(--ucbs-accent-cyan)]">
          {fontPreset.label}
        </span>
        <span className="rounded-full border border-[var(--ucbs-accent-green)]/30 px-2 py-0.5 text-[var(--ucbs-accent-green)]">
          Detail {Math.round(details.detail * 100)}%
        </span>
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
    </div>
  );
}
