import { Star, ShoppingCart, CheckCircle2, Download } from 'lucide-react';
import { Badge, Button, CardTitle } from '@/components/ui';
import type { MarketplaceItem } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface MarketplaceItemCardProps {
  item: MarketplaceItem;
  owned: boolean;
  loading: boolean;
  canAfford: boolean;
  onPurchase: () => void;
  onDownload: () => void;
  accent?: 'purple' | 'cyan' | 'magenta';
}

const accentRing: Record<string, string> = {
  purple: 'hover:ring-brand-500/30',
  cyan: 'hover:ring-cyan-500/30',
  magenta: 'hover:ring-fuchsia-500/30',
};

export function MarketplaceItemCard({
  item,
  owned,
  loading,
  canAfford,
  onPurchase,
  onDownload,
  accent = 'purple',
}: MarketplaceItemCardProps) {
  return (
    <div className={cn('ucbs-neon-card overflow-hidden p-0 transition-all hover:ring-1', accentRing[accent])}>
      <img src={item.previewUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" />
      <div className="p-4">
        <CardTitle className="text-base">{item.title}</CardTitle>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{item.description}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
          <Star className="h-3 w-3 text-amber-400" />
          {item.rating > 0 ? `${item.rating} (${item.reviewCount})` : 'Neu'}
          <span>· {item.downloadCount} Downloads</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-cyan-300">{formatCoins(item.priceCoins)}</span>
          {owned ? (
            <div className="flex items-center gap-2">
              <Badge variant="brand" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Gekauft
              </Badge>
              <Button size="sm" variant="outline" className="gap-1" onClick={onDownload}>
                <Download className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="gap-1"
              loading={loading}
              disabled={!canAfford}
              onClick={onPurchase}
            >
              <ShoppingCart className="h-3 w-3" />
              Kaufen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
