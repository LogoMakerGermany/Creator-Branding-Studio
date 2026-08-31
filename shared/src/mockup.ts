export type MockupProductCategory =
  | 'mug'
  | 'tshirt'
  | 'hoodie'
  | 'cap'
  | 'phone'
  | 'poster'
  | 'tote';

export const MOCKUP_CATEGORIES: { id: MockupProductCategory; label: string }[] = [
  { id: 'mug', label: 'Tassen' },
  { id: 'tshirt', label: 'T-Shirts' },
  { id: 'hoodie', label: 'Hoodies' },
  { id: 'cap', label: 'Caps' },
  { id: 'phone', label: 'Phone Cases' },
  { id: 'poster', label: 'Poster' },
  { id: 'tote', label: 'Mehr' },
];

export const MOCKUP_COLORS = [
  { id: 'white', hex: '#F5F5F5', label: 'Weiß' },
  { id: 'black', hex: '#111111', label: 'Schwarz' },
  { id: 'gray', hex: '#3F3F46', label: 'Grau' },
  { id: 'purple', hex: '#7C3AED', label: 'Lila' },
  { id: 'magenta', hex: '#C026D3', label: 'Magenta' },
] as const;

export const MOCKUP_MODELS: Record<MockupProductCategory, string[]> = {
  mug: ['Classic 11oz', 'Latte'],
  tshirt: ['Unisex Classic', 'Oversize'],
  hoodie: ['Pullover', 'Zip'],
  cap: ['Snapback', 'Dad Cap'],
  phone: ['iPhone', 'Universal'],
  poster: ['A3 Hochformat', 'Quadrat'],
  tote: ['Canvas Bag', 'Shopper'],
};

export type MockupPlacement = 'front' | 'wrap' | 'corner' | 'center';

export interface MockupGenerateInput {
  category: MockupProductCategory;
  colorId: string;
  modelLabel: string;
  placement: MockupPlacement;
  scalePercent: number;
  designUrl: string;
  lifestyle?: boolean;
  projectId?: string;
}

export interface MockupJob {
  id: string;
  userId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  category: MockupProductCategory;
  colorId: string;
  modelLabel: string;
  placement: MockupPlacement;
  scalePercent: number;
  designUrl: string;
  imageUrl?: string;
  lifestyle: boolean;
  provider?: string;
  error?: string;
  projectId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface MockupIntent {
  category: MockupProductCategory;
  colorId: string;
}

export function mockupColorHex(colorId: string): string {
  return MOCKUP_COLORS.find((c) => c.id === colorId)?.hex ?? '#F5F5F5';
}

export function parseMockupIntent(message: string): MockupIntent {
  const lower = message.toLowerCase();
  let category: MockupProductCategory = 'mug';
  if (/hoodie|kapuzen/.test(lower)) category = 'hoodie';
  else if (/t-?shirt|shirt/.test(lower)) category = 'tshirt';
  else if (/\bcap|kappe|mütze/.test(lower)) category = 'cap';
  else if (/phone|handy|case/.test(lower)) category = 'phone';
  else if (/poster|plakat/.test(lower)) category = 'poster';
  else if (/tote|beutel|tasche/.test(lower) && !/tasse/.test(lower)) category = 'tote';
  else if (/tasse|mug|becher/.test(lower)) category = 'mug';

  let colorId = 'white';
  if (/schwarz|black/.test(lower)) colorId = 'black';
  else if (/grau|gray|grey/.test(lower)) colorId = 'gray';
  else if (/lila|violet|purple/.test(lower)) colorId = 'purple';
  else if (/magenta|pink/.test(lower)) colorId = 'magenta';
  else if (/weiß|weiss|white/.test(lower)) colorId = 'white';

  return { category, colorId };
}
