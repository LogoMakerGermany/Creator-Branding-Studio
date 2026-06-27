import { useState, useEffect } from 'react';
import {
  PageHeader, Badge, Button, NeonCard, CardTitle, Input,
} from '@/components/ui';
import { Users, Dna, Plus, Crown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type Team, type CreatorDNA } from '@/services/api';

const TEAM_TYPES = ['clan', 'esports', 'streaming', 'music', 'content'] as const;

export function TeamDNAPage() {
  const { activeDna, refreshUser } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<Team | null>(null);
  const [teamDna, setTeamDna] = useState<CreatorDNA | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<typeof TEAM_TYPES[number]>('esports');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { loadTeams(); }, []);

  async function loadTeams() {
    const res = await api.team.list();
    setTeams(res.teams);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.team.create({ name, type, description });
      setTeams((prev) => [res.team, ...prev]);
      setShowCreate(false);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectTeam(team: Team) {
    setSelected(team);
    const res = await api.team.get(team.id);
    setTeamDna(res.dna);
  }

  async function handleCreateDna() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await api.team.createDna(selected.id, activeDna?.id);
      setSelected(res.team);
      setTeamDna(res.dna);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Team & Clan DNA"
        description="Gemeinsame Markenidentität für Teams, Clans und Esports-Gruppen"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Team erstellen
          </Button>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

      {showCreate && (
        <NeonCard accent="cyan" className="mb-6" title="Neues Team">
          <form onSubmit={handleCreate} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Team Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Typ</label>
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm">
                {TEAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} className="sm:col-span-2" />
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={loading}>Erstellen</Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            </div>
          </form>
        </NeonCard>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <NeonCard accent="purple">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-400" />
            Meine Teams
          </CardTitle>
          {teams.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Noch keine Teams erstellt.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => handleSelectTeam(team)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === team.id ? 'border-brand-500 bg-brand-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}
                >
                  <p className="font-medium text-zinc-200">{team.name}</p>
                  <p className="text-xs text-zinc-500">{team.type} · {team.memberCount} Mitglieder</p>
                </button>
              ))}
            </div>
          )}
        </NeonCard>

        <NeonCard accent="magenta" className="lg:col-span-2">
          {selected ? (
            <>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-400" />
                {selected.name}
              </CardTitle>
              {teamDna ? (
                <div className="mt-4">
                  <p className="text-sm text-zinc-400">Team DNA: {teamDna.name}</p>
                  <p className="text-xs text-zinc-500">Stil: {teamDna.styleDirection}</p>
                  <div className="mt-3 flex gap-2">
                    {[...teamDna.primaryColors, ...teamDna.secondaryColors].map((c) => (
                      <div key={c} className="h-10 w-10 rounded-lg border border-zinc-700" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-zinc-400">Noch keine Team DNA erstellt.</p>
                  <Button className="mt-3 gap-2" onClick={handleCreateDna} loading={loading}>
                    <Dna className="h-4 w-4" />
                    Team DNA generieren
                    {activeDna && ' (basierend auf deiner DNA)'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Wähle ein Team aus der Liste.</p>
          )}
        </NeonCard>
      </div>
    </div>
  );
}
