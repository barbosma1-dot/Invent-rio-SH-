import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageOff, MapPin, Package, ScanLine, Search } from 'lucide-react';
import { PageHeader } from '../kit';
import { supabase } from '../lib/supabase';
import {
  ITEM_COLUMNS, locationPath, parseItemId, photoUrl,
  type Item, type ItemStatusRow, type Loc, type Status,
} from '../lib/items';
import { useScope } from '../scopeStore';
import { ItemDetail, StatusChip } from './ItemDetail';
import { ItemForm } from './ItemForm';
import { QRScanner } from './QRScanner';

type Filter = 'ativos' | Status;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ativos', label: 'Ativos' },
  { id: 'no_acervo', label: 'No acervo' },
  { id: 'fora_evento', label: 'Em evento' },
  { id: 'emprestado', label: 'Emprestados' },
  { id: 'em_reparo', label: 'Em reparo' },
  { id: 'baixado', label: 'Baixados' },
];

export function Items() {
  const { loaded, loading, error: scopeError, missions, regionals, sectors, missionId, sectorId, setMission, setSector, canEditSector } = useScope();

  const [items, setItems] = useState<Item[]>([]);
  const [statuses, setStatuses] = useState<Map<string, ItemStatusRow>>(new Map());
  const [locs, setLocs] = useState<Loc[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ativos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const missionSectors = useMemo(() => sectors.filter((s) => s.mission_id === missionId), [sectors, missionId]);
  const sectorName = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);
  const canCreate = sectorId ? canEditSector(sectorId) : missionSectors.some((s) => canEditSector(s.id));

  const reload = useCallback(async () => {
    if (!supabase || !missionId) { setItems([]); return; }
    setFetching(true);
    setError('');

    let qi = supabase.from('inv_items').select(ITEM_COLUMNS).eq('mission_id', missionId);
    let qs = supabase.from('inv_item_status').select('item_id,status,overdue,expected_return,responsible_name').eq('mission_id', missionId);
    if (sectorId) { qi = qi.eq('sector_id', sectorId); qs = qs.eq('sector_id', sectorId); }
    const secIds = sectorId ? [sectorId] : missionSectors.map((s) => s.id);
    const ql = secIds.length
      ? supabase.from('inv_locations').select('id,sector_id,parent_id,name,sort_order').in('sector_id', secIds)
      : null;

    const [ri, rs, rl] = await Promise.all([qi.order('name').range(0, 1999), qs.range(0, 1999), ql]);
    setFetching(false);
    const err = ri.error || rs.error || rl?.error;
    if (err) { setError(err.message); return; }
    setItems((ri.data ?? []) as Item[]);
    setStatuses(new Map(((rs.data ?? []) as ItemStatusRow[]).map((r) => [r.item_id, r])));
    setLocs((rl?.data ?? []) as Loc[]);
  }, [missionId, sectorId, missionSectors]);

  useEffect(() => { if (loaded) reload(); }, [loaded, reload]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const st = statuses.get(i.id)?.status ?? (i.baixa_at ? 'baixado' : 'no_acervo');
      if (filter === 'ativos' ? st === 'baixado' : st !== filter) return false;
      if (!q) return true;
      return [i.name, i.category, i.description, locationPath(locs, i.location_id)]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [items, statuses, locs, filter, search]);

  function onScan(text: string) {
    setScanOpen(false);
    const id = parseItemId(text);
    if (!id) { setNotice('Esse QR não é de um item do Inventário Sh.'); return; }
    setNotice('');
    setSelectedId(id);
  }

  if (!loaded) {
    return (
      <div className="sh-page">
        <PageHeader title="Itens" />
        {scopeError
          ? <p className="inv-error">Não foi possível carregar seus acessos: {scopeError}</p>
          : <p style={{ color: 'var(--sh-text-muted)' }}>{loading ? 'Carregando…' : 'Preparando…'}</p>}
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <div className="sh-page">
        <PageHeader title="Itens" subtitle="Inventário do seu setor." />
        <div className="sh-card">
          <p className="font-extrabold mb-1">Você ainda não tem acesso a nenhum inventário.</p>
          <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
            Peça a um gestor da sua missão para liberar o seu acesso. Se você é gestor, abra o app depois de entrar uma vez e aguarde a sincronização com o Wop.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sh-page">
      <PageHeader
        title="Itens"
        subtitle={sectorId ? sectorName.get(sectorId) : 'Todos os setores da missão'}
        primary={canCreate ? { label: 'Novo item', onClick: () => setFormOpen(true) } : undefined}
        actions={
          <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setScanOpen(true)}>
            <ScanLine size={18} /> Ler QR
          </button>
        }
      />

      {/* missão e setor */}
      <div className="flex flex-col gap-2 mb-3 md:flex-row">
        {missions.length > 1 && (
          <select className="inv-input" value={missionId} onChange={(e) => setMission(e.target.value)} aria-label="Missão">
            {regionals.length > 0 && missions.some((m) => m.regional_id)
              ? (
                <>
                  {regionals
                    .filter((r) => missions.some((m) => m.regional_id === r.id))
                    .map((r) => (
                      <optgroup key={r.id} label={r.name}>
                        {missions.filter((m) => m.regional_id === r.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </optgroup>
                    ))}
                  {missions.some((m) => !m.regional_id || !regionals.some((r) => r.id === m.regional_id)) && (
                    <optgroup label="Sem regional">
                      {missions.filter((m) => !m.regional_id || !regionals.some((r) => r.id === m.regional_id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  )}
                </>
              )
              : missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <select className="inv-input" value={sectorId} onChange={(e) => setSector(e.target.value)} aria-label="Setor">
          <option value="">Todos os setores</option>
          {missionSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* busca */}
      <div style={{ position: 'relative' }} className="mb-3">
        <Search size={18} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--sh-text-faint)' }} />
        <input
          className="inv-input" style={{ paddingLeft: '2.4rem' }} type="search" value={search}
          onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, categoria ou local" aria-label="Buscar itens"
        />
      </div>

      {/* filtros de status */}
      <div className="flex gap-2 mb-4" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id} type="button"
            className={`sh-btn ${filter === f.id ? 'sh-btn-primary' : 'sh-btn-secondary'}`}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {notice && <p className="inv-error mb-3" role="status" onClick={() => setNotice('')}>{notice}</p>}
      {error && <p className="inv-error mb-3" role="alert">{error}</p>}

      {fetching && items.length === 0 ? (
        <p style={{ color: 'var(--sh-text-muted)' }}>Carregando itens…</p>
      ) : visible.length === 0 ? (
        <div className="sh-card flex flex-col items-center text-center gap-2" style={{ padding: '2rem 1rem' }}>
          <Package size={32} style={{ color: 'var(--sh-text-faint)' }} />
          <p className="font-bold">{items.length === 0 ? 'Nenhum item cadastrado ainda.' : 'Nenhum item com esse filtro.'}</p>
          {items.length === 0 && canCreate && <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Toque em «Novo item» para cadastrar o primeiro.</p>}
        </div>
      ) : (
        <>
          <p className="text-xs mb-2" style={{ color: 'var(--sh-text-faint)' }}>{visible.length} {visible.length === 1 ? 'item' : 'itens'}</p>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', listStyle: 'none', padding: 0, margin: 0 }}>
            {visible.map((i) => {
              const st = statuses.get(i.id);
              const img = photoUrl(i.photo_path, i.updated_at);
              const where = locationPath(locs, i.location_id);
              return (
                <li key={i.id}>
                  <button
                    type="button" className="sh-card flex items-center gap-3 w-full text-left"
                    style={{ padding: '0.65rem', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                    onClick={() => setSelectedId(i.id)}
                  >
                    <span className="inv-soft flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}>
                      {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={22} />}
                    </span>
                    <span className="flex flex-col gap-1 min-w-0" style={{ flex: 1 }}>
                      <span className="font-bold" style={{ overflowWrap: 'anywhere' }}>{i.name}</span>
                      <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
                        {[i.category, !sectorId ? sectorName.get(i.sector_id) : null].filter(Boolean).join(' · ')}
                      </span>
                      {where && (
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--sh-text-muted)' }}>
                          <MapPin size={12} style={{ flexShrink: 0 }} /> <span style={{ overflowWrap: 'anywhere' }}>{where}</span>
                        </span>
                      )}
                      <span><StatusChip status={st?.status ?? (i.baixa_at ? 'baixado' : 'no_acervo')} overdue={st?.overdue} /></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ItemForm
        open={formOpen}
        categories={categories}
        defaultSectorId={sectorId}
        onClose={() => setFormOpen(false)}
        onSaved={(id, warning) => {
          setFormOpen(false);
          setNotice(warning ?? '');
          reload();
          setSelectedId(id);
        }}
      />

      {selectedId && (
        <ItemDetail
          key={selectedId}
          itemId={selectedId}
          categories={categories}
          onClose={() => setSelectedId(null)}
          onChanged={reload}
        />
      )}

      <QRScanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScan} />
    </div>
  );
}
