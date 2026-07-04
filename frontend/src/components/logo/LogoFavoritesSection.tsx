import { useEffect, useState } from 'react';
import { Pencil, Save, Star, Trash2, Upload } from 'lucide-react';
import {
  buildLogoFavoriteName,
  type LogoGenerationOptions,
  type SavedLogoFavorite,
} from '@ucbs/shared';
import { GlassCard } from '@/v2/components/GlassCard';
import { Button } from '@/components/ui';
import {
  deleteLogoFavorite,
  listLogoFavorites,
  renameLogoFavorite,
  saveLogoFavorite,
  updateLogoFavoriteOptions,
} from '@/lib/logo-favorites-storage';

type LogoFavoritesSectionProps = {
  form: LogoGenerationOptions;
  activeFavoriteId: string | null;
  onLoadFavorite: (favorite: SavedLogoFavorite) => void;
  onClearActiveFavorite: () => void;
};

export function LogoFavoritesSection({
  form,
  activeFavoriteId,
  onLoadFavorite,
  onClearActiveFavorite,
}: LogoFavoritesSectionProps) {
  const [favorites, setFavorites] = useState<SavedLogoFavorite[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    setFavorites(listLogoFavorites());
  }, []);

  function refresh() {
    setFavorites(listLogoFavorites());
  }

  function handleSaveNew() {
    const defaultName = buildLogoFavoriteName(form);
    const name = window.prompt('Name für Favorit:', defaultName);
    if (!name?.trim()) return;
    const saved = saveLogoFavorite({ name, options: form });
    refresh();
    onLoadFavorite(saved);
  }

  function handleUpdateActive() {
    if (!activeFavoriteId) return;
    const fav = favorites.find((f) => f.id === activeFavoriteId);
    if (!fav) return;
    const updated = updateLogoFavoriteOptions(activeFavoriteId, form);
    if (updated) {
      refresh();
      onLoadFavorite(updated);
    }
  }

  function handleRename(id: string) {
    const fav = favorites.find((f) => f.id === id);
    if (!fav) return;
    setEditingId(id);
    setEditName(fav.name);
  }

  function commitRename() {
    if (!editingId || !editName.trim()) {
      setEditingId(null);
      return;
    }
    renameLogoFavorite(editingId, editName);
    refresh();
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (!window.confirm('Favorit wirklich löschen?')) return;
    deleteLogoFavorite(id);
    if (activeFavoriteId === id) onClearActiveFavorite();
    refresh();
  }

  return (
    <GlassCard accent="green" hover={false} className="space-y-4 !p-4">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-green)]">
          <Star className="h-3.5 w-3.5" />
          Schritt 15 · Favoriten
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Aktuelle Einstellungen als Favorit speichern, laden, umbenennen oder löschen — lokal auf diesem Gerät.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5 text-[11px]" onClick={handleSaveNew}>
          <Save className="h-3.5 w-3.5" />
          Neu speichern
        </Button>
        {activeFavoriteId && (
          <Button size="sm" variant="outline" className="gap-1.5 text-[11px]" onClick={handleUpdateActive}>
            <Save className="h-3.5 w-3.5" />
            Aktiven aktualisieren
          </Button>
        )}
      </div>

      <div className="max-h-52 space-y-2 overflow-y-auto">
        {favorites.length === 0 ? (
          <p className="text-[10px] text-zinc-600">Noch keine Favoriten — speichere deine erste Konfiguration.</p>
        ) : (
          favorites.map((fav) => (
            <div
              key={fav.id}
              className={`rounded-lg border p-2.5 ${
                activeFavoriteId === fav.id
                  ? 'border-[var(--ucbs-accent-green)]/40 bg-[var(--ucbs-accent-green)]/5'
                  : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {editingId === fav.id ? (
                <div className="flex gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded border border-white/10 bg-[var(--ucbs-bg)] px-2 py-1 text-[11px] text-zinc-200"
                    onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                  />
                  <Button size="sm" variant="outline" className="text-[10px]" onClick={commitRename}>
                    OK
                  </Button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-zinc-200">{fav.name}</p>
                    <p className="mt-0.5 text-[9px] text-zinc-600">
                      {fav.options.logoName?.trim() || 'Ohne Name'} · {fav.options.magikStyle ?? 'Stil'} ·{' '}
                      {new Date(fav.updatedAt).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => onLoadFavorite(fav)}
                      className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-[var(--ucbs-accent-green)]"
                      title="Laden"
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRename(fav.id)}
                      className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                      title="Umbenennen"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(fav.id)}
                      className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-red-400"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}
