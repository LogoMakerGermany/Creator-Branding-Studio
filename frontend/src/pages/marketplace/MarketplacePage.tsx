import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, NeonCard, Input } from '@/components/ui';
import { Store, Plus, Package } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MarketplaceItem } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { MarketplaceItemCard } from '@/components/marketplace/MarketplaceItemCard';
import { StudioErrorBanner, TypeOptionButton } from '@/components/studio';

const CATEGORIES = ['logo', 'banner', 'overlay', 'intro', 'emote', 'sound', 'panel', 'vtuber'] as const;
const TABS = ['shop', 'purchases', 'sell'] as const;
type Tab = (typeof TABS)[number];

export function MarketplacePage() {
  const { user, refreshUser } = useAuth();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<MarketplaceItem[]>([]);
  const [myListings, setMyListings] = useState<MarketplaceItem[]>([]);
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);
  const [category, setCategory] = useState<string>('');
  const [tab, setTab] = useState<Tab>('shop');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sellTitle, setSellTitle] = useState('');
  const [sellDesc, setSellDesc] = useState('');
  const [sellCategory, setSellCategory] = useState<string>('logo');
  const [sellPrice, setSellPrice] = useState(25);

  useEffect(() => {
    load();
  }, [category, tab]);

  async function load() {
    if (tab === 'shop') {
      const res = await api.marketplace.list(category || undefined);
      setItems(res.items);
      setPurchasedIds(res.purchasedIds);
    } else if (tab === 'purchases') {
      const res = await api.marketplace.purchases();
      setPurchasedItems(res.items);
      setPurchasedIds(res.purchases.map((p) => p.itemId));
    } else {
      try {
        const res = await api.marketplace.myListings();
        setMyListings(res.items);
      } catch {
        setMyListings([]);
      }
    }
  }

  async function handlePurchase(item: MarketplaceItem) {
    setLoading(true);
    setError(null);
    try {
      await api.marketplace.purchase(item.id);
      setPurchasedIds((prev) => [...prev, item.id]);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kauf fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(item: MarketplaceItem) {
    const res = await api.marketplace.download(item.id);
    const link = document.createElement('a');
    link.href = res.downloadUrl;
    link.download = `${item.title}.png`;
    link.click();
  }

  async function handleCreateListing(e: React.FormEvent) {
    e.preventDefault();
    if (!sellTitle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.marketplace.createListing({
        title: sellTitle.trim(),
        description: sellDesc.trim() || sellTitle.trim(),
        category: sellCategory,
        priceCoins: sellPrice,
      });
      setSellTitle('');
      setSellDesc('');
      setTab('sell');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Listing fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const displayItems =
    tab === 'shop' ? items : tab === 'purchases' ? purchasedItems : myListings;

  return (
    <div>
      <PageHeader
        title="Marketplace"
        description="Templates, Logos, Overlays und Sounds kaufen & verkaufen"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={<Badge variant="default">{formatCoins(user?.coinBalance ?? 0)} Coins</Badge>}
      />

      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm capitalize transition-colors',
              tab === t
                ? 'border-brand-500 bg-brand-500/20 text-brand-200'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            )}
          >
            {t === 'shop' ? 'Shop' : t === 'purchases' ? 'Meine Käufe' : 'Verkaufen'}
          </button>
        ))}
      </div>

      {tab === 'shop' && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Button variant={category === '' ? 'primary' : 'outline'} size="sm" onClick={() => setCategory('')}>
            Alle
          </Button>
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              variant={category === c ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setCategory(c)}
              className="capitalize"
            >
              {c}
            </Button>
          ))}
        </div>
      )}

      {tab === 'sell' && (
        <NeonCard accent="cyan" className="mb-8">
          <h3 className="flex items-center gap-2 font-display font-semibold text-zinc-100">
            <Plus className="h-4 w-4 text-cyan-400" />
            Neues Listing erstellen
          </h3>
          <form onSubmit={handleCreateListing} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Titel" value={sellTitle} onChange={(e) => setSellTitle(e.target.value)} required />
            <Input
              label="Preis (Coins)"
              type="number"
              min={5}
              max={500}
              value={sellPrice}
              onChange={(e) => setSellPrice(Number(e.target.value))}
            />
            <Input
              label="Beschreibung"
              value={sellDesc}
              onChange={(e) => setSellDesc(e.target.value)}
              className="sm:col-span-2"
            />
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs text-zinc-500">Kategorie</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <TypeOptionButton
                    key={c}
                    active={sellCategory === c}
                    onClick={() => setSellCategory(c)}
                    className="px-3 py-1 capitalize"
                  >
                    {c}
                  </TypeOptionButton>
                ))}
              </div>
            </div>
            <Button type="submit" loading={loading} className="gap-2 sm:col-span-2">
              <Package className="h-4 w-4" />
              Im Marketplace listen
            </Button>
          </form>
        </NeonCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {displayItems.map((item, i) => (
          <MarketplaceItemCard
            key={item.id}
            item={item}
            owned={purchasedIds.includes(item.id) || tab === 'purchases'}
            loading={loading}
            canAfford={(user?.coinBalance ?? 0) >= item.priceCoins}
            onPurchase={() => handlePurchase(item)}
            onDownload={() => handleDownload(item)}
            accent={(['purple', 'cyan', 'magenta'] as const)[i % 3]}
          />
        ))}
      </div>

      {displayItems.length === 0 && (
        <div className="ucbs-neon-card flex items-center gap-3 p-8 text-zinc-500">
          <Store className="h-5 w-5 text-brand-400" />
          {tab === 'purchases'
            ? 'Noch keine Käufe — entdecke den Shop!'
            : tab === 'sell'
              ? 'Noch keine Listings — erstelle dein erstes Angebot oben.'
              : 'Keine Artikel in dieser Kategorie'}
        </div>
      )}
    </div>
  );
}
