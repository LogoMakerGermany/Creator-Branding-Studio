import type { CreatorDNA, DNAAnalysis, StyleDirection } from '@ucbs/shared';
import { getOpenAiApiKey } from '../config/env.js';
import { ServiceError } from '../lib/errors.js';

const STYLE_VALUES: StyleDirection[] = [
  'gaming', 'streaming', 'music', 'anime', 'fantasy', 'esports',
  'horror', 'neon', 'realistic', 'minimal', 'corporate',
  'cyberpunk', 'clean', 'cartoon', 'cinematic', 'custom',
];

function normalizeStyle(value: string | undefined): StyleDirection {
  if (value && STYLE_VALUES.includes(value as StyleDirection)) {
    return value as StyleDirection;
  }
  return 'gaming';
}

/** OpenAI Vision analysis — requires OPENAI_API_KEY. */
export async function analyzeImageWithVision(
  imageDataUrl: string,
  styleHint?: StyleDirection
): Promise<DNAAnalysis> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'DNA-Bildanalyse benötigt OPENAI_API_KEY'
    );
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You analyze creator branding assets. Respond ONLY with JSON matching this schema:
{
  "colorPalette": [{"hex":"#RRGGBB","name":"string","usage":"primary|secondary|accent"}],
  "detectedStyle": "gaming|streaming|music|anime|fantasy|esports|horror|neon|realistic|minimal|corporate|cyberpunk|clean|cartoon|cinematic|custom",
  "confidence": 0.0-1.0,
  "suggestions": ["string"],
  "character": "short figure description or empty",
  "characterStructured": {
    "present": true,
    "type": "animal|human|robot|fantasy|mascot|custom|none",
    "description": "string",
    "clothing": "string",
    "hair": "string",
    "face": "string",
    "accessories": "string",
    "traits": ["recurring visual trait"]
  },
  "typographyStyle": "bold sans|serif|display|script|none",
  "typography": { "character": "string", "weight": "string", "direction": "string", "nameTreatment": "string" },
  "lightingStyle": "neon glow|cinematic|flat|rim light",
  "atmosphere": { "lighting": "string", "mood": "string", "effects": ["string"], "particles": false, "glow": false, "smoke": false },
  "dimension": "2d|3d",
  "genreTags": ["fantasy","cyberpunk","clean"],
  "recurringTraits": ["string"]
}
Use structured fields. Do not dump unconstrained prose into suggestions beyond 5 short items.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this creator branding image for DNA extraction.${styleHint ? ` Style hint: ${styleHint}` : ''}`,
            },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    throw new ServiceError(502, 'AI_ANALYSIS_FAILED', `OpenAI Vision: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const raw = data.choices[0]?.message?.content;
  if (!raw) {
    throw new ServiceError(502, 'AI_ANALYSIS_FAILED', 'Keine Antwort von OpenAI Vision');
  }

  const parsed = JSON.parse(raw) as {
    colorPalette: DNAAnalysis['colorPalette'];
    detectedStyle: string;
    confidence: number;
    suggestions: string[];
    character?: string;
    characterStructured?: DNAAnalysis['characterStructured'];
    typographyStyle?: string;
    typography?: DNAAnalysis['typography'];
    lightingStyle?: string;
    atmosphere?: DNAAnalysis['atmosphere'];
    dimension?: '2d' | '3d';
    genreTags?: string[];
    recurringTraits?: string[];
  };

  const palette = Array.isArray(parsed.colorPalette) ? parsed.colorPalette.slice(0, 6) : [];
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [];

  return {
    colorPalette: palette,
    detectedStyle: normalizeStyle(parsed.detectedStyle),
    confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.8)),
    suggestions,
    analyzedAt: new Date().toISOString(),
    source: 'vision',
    character: typeof parsed.character === 'string' ? parsed.character.slice(0, 240) : undefined,
    characterStructured: parsed.characterStructured && typeof parsed.characterStructured === 'object'
      ? {
          present: Boolean(parsed.characterStructured.present),
          type: parsed.characterStructured.type?.slice(0, 40),
          description: parsed.characterStructured.description?.slice(0, 400),
          clothing: parsed.characterStructured.clothing?.slice(0, 200),
          hair: parsed.characterStructured.hair?.slice(0, 120),
          face: parsed.characterStructured.face?.slice(0, 160),
          accessories: parsed.characterStructured.accessories?.slice(0, 160),
          traits: parsed.characterStructured.traits?.slice(0, 8),
        }
      : undefined,
    typographyStyle: parsed.typographyStyle?.slice(0, 80),
    typography: parsed.typography && typeof parsed.typography === 'object'
      ? {
          character: parsed.typography.character?.slice(0, 80),
          weight: parsed.typography.weight?.slice(0, 40),
          direction: parsed.typography.direction?.slice(0, 40),
          nameTreatment: parsed.typography.nameTreatment?.slice(0, 80),
        }
      : undefined,
    lightingStyle: parsed.lightingStyle?.slice(0, 80),
    atmosphere: parsed.atmosphere && typeof parsed.atmosphere === 'object'
      ? {
          lighting: parsed.atmosphere.lighting?.slice(0, 80),
          mood: parsed.atmosphere.mood?.slice(0, 80),
          effects: parsed.atmosphere.effects?.slice(0, 8),
          particles: Boolean(parsed.atmosphere.particles),
          glow: Boolean(parsed.atmosphere.glow),
          smoke: Boolean(parsed.atmosphere.smoke),
        }
      : undefined,
    dimension: parsed.dimension === '3d' ? '3d' : parsed.dimension === '2d' ? '2d' : undefined,
    genreTags: parsed.genreTags?.slice(0, 6),
    recurringTraits: parsed.recurringTraits?.slice(0, 8),
  };
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
    return analyzeImageWithVision(input.imageDataUrl, input.styleHint);
  }
  if (input.colors?.length) {
    return analyzeColorsHeuristic(input.colors, input.styleHint);
  }
  throw new ServiceError(400, 'INVALID_INPUT', 'Farben oder Bild für Analyse erforderlich');
}
