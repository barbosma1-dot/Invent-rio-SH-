import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Phone, Undo2 } from 'lucide-react';
import { PageHeader } from '../kit';
import { supabase } from '../lib/supabase';
import { photoUrl } from '../lib/items';
import {
  CONDITION_LABEL, MOVEMENT_COLUMNS, fmtDate, loadMovementContacts, todayLocal,
  type Movement,
} from '../lib/movements';
import { useScope } from '../scopeStore';
import { ItemDetail } from './ItemDetail';
import { MovementForm } from './MovementForm';

type Row = Movement & { inv_items: { name: string; photo_path: string | null } | null };
type Filter = 'todos' | 'abertos' | 'atrasados' | 'entradas';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Tudo' },
  { id: 'abertos', label: 'Em aberto' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'entradas', label: 'Entradas' },
];

const KIND_LABEL = { entrada: 'Entrada', saida: 'Saída', retorno: 'Retorno' } as const;
const SELECT = `${MOVEMENT_COLUMNS},inv_items(name,photo_path)`;

export function Moves() {
  const { loaded, missions, sectors, missionId, sectorId, setMission, setSector, canEditSector } = useScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set()); // saídas ainda sem retorno
  const [contacts, setContacts] = useState<Map<string, { phone: string | null; photo_url: string | null }>>(new Map());
  const [filter, setFilter] = useState<Filter>('todos');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [ret, setRet] = useState<{ itemId: string; saidaId: string } | null>(null);

  const missionSectors = useMemo(() => sectors.filter((s) => s.mission_id === missionId && s.active), [sectors, missionId]);
  const sectorName = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);

  const reload = useCallback(async () => {
    if (!supabase || !missionId) { setRows([]); return; }
    setFetching(true); setError('');
    // saídas em aberto vêm da view de status (não depende de quantos movimentos foram carregados)
    let qs = supabase.from('inv_item_status').select('open_saida_id,overdue').eq('mission_id', missionId).not('open_saida_id', 'is', null);
    if (sectorId) qs = qs.eq('sector_id', sectorId);
    const st = await qs.range(0, 999);
    if (st.error) { setError(st.error.message); setFetching(false); return; }
    const open = new Map(((st.data ?? []) as { open_saida_id: string; overdue: boolean }[]).map((r) => [r.open_saida_id, r.overdue]));
    setOpenIds(new Set(open.keys()));

    let list: Row[] = [];
    if (filter === 'abertos' || filter === 'atrasados') {
      const ids = [...open.entries()].filter(([, od]) => filter === 'abertos' || od).map(([id]) => id);
      if (ids.length) {
        const r = await supabase.from('inv_movements').select(SELECT).in('id', ids).order('expected_return', { ascending: true, nullsFirst: false });
        if (r.error) { setError(r.error.message); setFetching(false); return; }
        list = (r.data ?? []) as unknown as Row[];
      }
    } else {
      let q = supabase.from('inv_movements').select(SELECT).eq('mission_id', missionId);
      if (sectorId) q = q.eq('sector_id', sectorId);
      if (filter === 'entradas') q = q.eq('kind', 'entrada');
      const r = await q.order('occurred_at', { ascending: false }).limit(150);
      if (r.error) { setError(r.error.message); setFetching(false); return; }
      list = (r.data ?? []) as unknown as Row[];
    }
    setRows(list);

    // telefone da época: só quem edita o setor lê (para os outros volta vazio)
    const anyEditor = sectorId ? canEditSector(sectorId) : missionSectors.some((s) => canEditSector(s.id));
    setContacts(anyEditor ? await loadMovementContacts(list.map((m) => m.id)) : new Map());
    setFetching(false);
  }, [missionId, sectorId, filter, missionSectors, canEditSector]);

  useEffect(() => { if (loaded) reload(); }, [loaded, reload]);

  if (!loaded) {
    return <div className="sh-page"><PageHeader title="Movimentos" /><p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p></div>;
  }
  if (missions.length === 0) {
    return (
      <div className="sh-page">
        <PageHeader title="Movimentos" subtitle="Entradas, saídas e retornos." />
        <div className="sh-card"><p className="font-extrabold">Você ainda não tem acesso a nenhum inventário.</p></div>
      </div>
    );
  }

  const today = todayLocal();

  return (
    <div className="sh-page">
      <PageHeader title="Movimentos" subtitle={sectorId ? sectorName.get(sectorId) : 'Todos os setores da missão'} />

      <div className="flex gap-2 flex-wrap mb-3">
        <select className="inv-input" style={{ flex: '1 1 12rem' }} value={missionId} onChange={(e) => setMission(e.target.value)} aria-label="Missão">
          {missions.map((m) => <option key={m.id} value={m.id}>{m.name.trim()}</option>)}
        </select>
        <select className="inv-input" style={{ flex: '1 1 12rem' }} value={sectorId} onChange={(e) => setSector(e.target.value)} aria-label="Setor">
          <option value="">Todos os setores</option>
          {missionSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="flex gap-1 flex-wrap mb-3" role="tablist" aria-label="Filtro">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
            className={`sh-btn ${filter === f.id ? 'sh-btn-primary' : 'sh-btn-secondary'}`}
            style={{ minHeight: 36, padding: '0 0.7rem', fontSize: '0.8rem' }}
            onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {error && <p className="inv-error mb-3" role="alert">{error}</p>}
      {fetching && rows.length === 0 && <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>}
      {!fetching && !error && rows.length === 0 && (
        <div className="sh-card">
          <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
            {filter === 'todos' ? 'Nenhuma movimentação ainda. Abra um item e use "Registrar saída" ou "Registrar entrada".'
              : filter === 'abertos' ? 'Nenhum item fora do acervo.' : filter === 'atrasados' ? 'Nenhum item atrasado.' : 'Nenhuma entrada registrada.'}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((m) => {
          const isOpen = m.kind === 'saida' && openIds.has(m.id);
          const late = isOpen && !!m.expected_return && m.expected_return < today;
          const Icon = m.kind === 'entrada' ? ArrowDownToLine : m.kind === 'saida' ? ArrowUpFromLine : Undo2;
          const c = contacts.get(m.id);
          const img = photoUrl(m.inv_items?.photo_path);
          return (
            <li key={m.id} className="sh-card flex flex-col gap-2" style={{ padding: '0.75rem' }}>
              <button type="button" className="flex items-start gap-3 text-left w-full" onClick={() => setItemId(m.item_id)}>
                <span className="inv-soft flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-primary)' }}>
                  {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon size={20} />}
                </span>
                <span className="flex flex-col min-w-0" style={{ flex: 1, gap: 2 }}>
                  <span className="font-bold" style={{ overflowWrap: 'anywhere' }}>{m.inv_items?.name ?? 'Item'}</span>
                  <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
                    {KIND_LABEL[m.kind]}
                    {m.kind === 'saida' ? ` · ${m.saida_reason === 'evento' ? 'evento' : 'empréstimo'}` : ''}
                    {m.kind === 'entrada' && m.entry_source ? ` · ${m.entry_source === 'compra' ? 'compra' : 'doação'}` : ''}
                    {' · '}{fmtDate(m.occurred_at)}
                  </span>
                  <span className="text-sm" style={{ overflowWrap: 'anywhere' }}>{m.responsible_name}</span>
                  {c?.phone && (
                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--sh-text-muted)' }}><Phone size={12} /> {c.phone}</span>
                  )}
                  {m.kind === 'saida' && m.expected_return && (
                    <span className="text-xs font-bold" style={{ color: late ? '#b91c1c' : 'var(--sh-text-muted)' }}>
                      {late ? 'Atrasado · ' : ''}volta {fmtDate(m.expected_return)}
                    </span>
                  )}
                  {m.condition && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Condição: {CONDITION_LABEL[m.condition]}{m.needs_repair ? ' · precisa de reparo' : ''}</span>}
                  {m.notes && <span className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>{m.notes}</span>}
                </span>
              </button>
              {isOpen && (
                <button type="button" className="sh-btn sh-btn-primary" onClick={() => setRet({ itemId: m.item_id, saidaId: m.id })}>
                  <Undo2 size={16} /> Registrar retorno
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length >= 150 && filter !== 'abertos' && filter !== 'atrasados' && (
        <p className="text-xs mt-3" style={{ color: 'var(--sh-text-faint)' }}>Mostrando as 150 mais recentes.</p>
      )}

      {ret && (
        <MovementForm
          open
          kind="retorno"
          itemId={ret.itemId}
          saidaId={ret.saidaId}
          onClose={() => setRet(null)}
          onDone={() => { setRet(null); reload(); }}
        />
      )}

      {itemId && <ItemDetail key={itemId} itemId={itemId} onClose={() => setItemId(null)} onChanged={reload} />}
    </div>
  );
}
