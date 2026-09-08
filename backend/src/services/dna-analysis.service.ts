import type { DNAAnalysis, StyleDirection } from '@ucbs/shared';
import { getOpenAiApiKey } from '../config/env.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { DNA_VISION_BLOCKED_MESSAGE } from '../lib/provider-gate.js';

/** OpenAI Vision analysis is provider-gated until a confirmed cost policy exists. */
export async function analyzeImageWithVision(
  imageDataUrl: string,
  styleHint?: StyleDirection
): Promise<DNAAnalysis> {
  void imageDataUrl;
  void styleHint;
  if (isPaidProviderTestBlocked() || !getOpenAiApiKey()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'DNA-Bildanalyse benötigt OPENAI_API_KEY'
    );
  }
  throw new ServiceError(503, 'AI_NOT_CONFIGURED', DNA_VISION_BLOCKED_MESSAGE);
}

/** Color-only extraction — not a substitute for Vision analysis. */
export function analyzeColorsHeuristic(
  colors: string[],
  styleHint?: StyleDirection
): DNAAnalysis {
  const palette = colors.slice(0, 6).map((hex, i) => ({
    hex,
    name: `Color ${i + 1}`,
    usage: (i === 0 ? 'primary' : i < 3 ? 'secondary' : 'accent') as 'primary' | 'secondary' | 'accent',
  }));

  const detectedStyle = styleHint ?? detectStyleFromColors(colors);

  return {
    colorPalette: palette,
    detectedStyle,
    confidence: Math.min(0.55, 0.3 + colors.length * 0.05),
    suggestions: [
      'Lade ein Referenzbild hoch für eine vollständige KI-Vision-Analyse',
      'Primärfarbe für Logo und CTAs festlegen',
      'Kontrast für Stream-Overlays prüfen',
    ],
    analyzedAt: new Date().toISOString(),
    source: 'colors',
  };
}

function detectStyleFromColors(colors: string[]): StyleDirection {
  if (colors.length === 0) return 'gaming';
  const hex = colors[0].replace('#', '');
  if (hex.length < 6) return 'gaming';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  if (r > 200 && g < 100 && b > 200) return 'neon';
  if (r < 80 && g < 80 && b < 80) return 'horror';
  if (b > r && b > g) return 'gaming';
  if (r > 180 && g > 100 && b < 80) return 'esports';
  return 'streaming';
}

export async function analyzeCreatorAssets(input: {
  colors?: string[];
  imageDataUrl?: string;
  styleHint?: StyleDirection;
}): Promise<DNAAnalysis> {
  if (input.imageDataUrl?.startsWith('data:image/')) {
    try {
      return await analyzeImageWithVision(input.imageDataUrl, input.styleHint);
    } catch {
      if (input.colors?.length) {
        return analyzeColorsHeuristic(input.colors, input.styleHint);
      }
      throw new ServiceError(503, 'AI_NOT_CONFIGURED', DNA_VISION_BLOCKED_MESSAGE);
    }
  }
  if (input.colors?.length) {
    return analyzeColorsHeuristic(input.colors, input.styleHint);
  }
  throw new ServiceError(400, 'INVALID_INPUT', 'Farben oder Bild für Analyse erforderlich');
}
