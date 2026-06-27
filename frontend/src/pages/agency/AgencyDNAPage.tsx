import { useState, useEffect } from 'react';
import {
  PageHeader, Badge, Button, Card, CardTitle, Input,
} from '@/components/ui';
import { Building2, Dna, Plus, Briefcase } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type Agency, type CreatorDNA } from '@/services/api';

export function AgencyDNAPage() {
  const { activeDna, refreshUser } = useAuth();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selected, setSelected] = useState<Agency | null>(null);
  const [agencyDna, setAgencyDna] = useState<CreatorDNA | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { loadAgencies(); }, []);

  async function loadAgencies() {
    const res = await api.agency.list();
    setAgencies(res.agencies);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.agency.create({ name, description });
      setAgencies((prev) => [res.agency, ...prev]);
      setShowCreate(false);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectAgency(agency: Agency) {
    setSelected(agency);
    const res = await api.agency.get(agency.id);
    setAgencyDna(res.dna);
  }

  async function handleCreateDna() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await api.agency.createDna(selected.id, activeDna?.id);
      setSelected(res.agency);
      setAgencyDna(res.dna);
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
        title="Agentur DNA"
        description="Agentur-spezifische Markenidentität, Vorlagen und Team-Branding"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Agentur erstellen
          </Button>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

      {showCreate && (
        <Card className="mb-6">
          <CardTitle>Neue Agentur</CardTitle>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <Input label="Agentur Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" loading={loading}>Erstellen</Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-400" />
            Meine Agenturen
          </CardTitle>
          {agencies.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Noch keine Agenturen erstellt.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {agencies.map((agency) => (
                <button
                  key={agency.id}
                  type="button"
                  onClick={() => handleSelectAgency(agency)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === agency.id ? 'border-brand-500 bg-brand-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}
                >
                  <p className="font-medium text-zinc-200">{agency.name}</p>
                  <p className="text-xs text-zinc-500">{agency.memberCount} Mitarbeiter · {agency.clientCount} Kunden</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          {selected ? (
            <>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-brand-400" />
                {selected.name}
              </CardTitle>
              {selected.description && (
                <p className="mt-2 text-sm text-zinc-400">{selected.description}</p>
              )}
              {agencyDna ? (
                <div className="mt-4">
                  <p className="text-sm text-zinc-400">Agentur DNA: {agencyDna.name}</p>
                  <p className="text-xs text-zinc-500">Stil: {agencyDna.styleDirection}</p>
                  <div className="mt-3 flex gap-2">
                    {[...agencyDna.primaryColors, ...agencyDna.secondaryColors].map((c) => (
                      <div key={c} className="h-10 w-10 rounded-lg border border-zinc-700" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-zinc-400">Noch keine Agentur DNA erstellt.</p>
                  <Button className="mt-3 gap-2" onClick={handleCreateDna} loading={loading}>
                    <Dna className="h-4 w-4" />
                    Agentur DNA generieren
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Wähle eine Agentur aus der Liste.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
