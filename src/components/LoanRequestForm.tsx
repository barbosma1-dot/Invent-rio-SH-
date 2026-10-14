import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ImageOff } from 'lucide-react';
import { Modal, ModalActions } from '../kit';
import { supabase } from '../lib/supabase';
import { photoUrl } from '../lib/items';
import { createLoan, loadCatalog, type CatalogItem } from '../lib/loans';
import { norm } from '../lib/movements';
import { useScope } from '../scopeStore';

const FORM_ID = 'loan-request-form';
interface Ev { id: string; name: string; event_date: string | null; end_date: string | null }

/** Pedido de itens de outros setores (para um evento ou para o setor). */
export function LoanRequestForm({
  open, onClose, onDone, fixedSectorId, fixedEventId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  fixedSectorId?: string; // quando o pedido nasce dentro de um evento
  fixedEventId?: string;
}) {
  const { sectors, missionId, isAdmin, access } = useScope();
  const [dest, setDest] = useState('');
  const [events, setEvents] = useState<Ev[]>([]);
  const [eventId, setEventId] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // setores onde a pessoa pode pedir (os que ela enxerga)
  const mine = useMemo(() => {
    const inMission = sectors.filter((s) => s.mission_id === missionId && s.active);
    const wholeMission = isAdmin || access.some((a) => a.mission_id === missionId && a.sector_id === null);
    if (wholeMission) return inMission;
    const ids = new Set(access.filter((a) => a.mission_id === missionId && a.sector_id).map((a) => a.sector_id));
    return inMission.filter((s) => ids.has(s.id));
  }, [sectors, missionId, isAdmin, access]);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set()); setSearch(''); setOwner(''); setNotes(''); setError('');
    setEventId(fixedEventId ?? ''); setFrom(''); setUntil('');
    setDest(fixedSectorId ?? mine[0]?.id ?? '');
  }, [open, fixedSectorId, fixedEventId, mine]);

  // eventos do setor de destino e catálogo dos outros setores
  useEffect(() => {
    if (!open || !dest || !supabase) { setEvents([]); setCatalog([]); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      const [ev, cat] = await Promise.all([
        supabase!.from('inv_events').select('id,name,event_date,end_date').eq('sector_id', dest)
          .order('event_date', { ascending: false, nullsFirst: true }).range(0, 199),
        loadCatalog(dest),
      ]);
      if (!alive) return;
      setEvents((ev.data ?? []) as Ev[]);
      if (cat.ok) { setCatalog(cat.data); setError(''); } else { setCatalog([]); setError(cat.error); }
      setPicked(new Set());
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, dest]);

  // datas do evento viram as datas do pedido
  useEffect(() => {
    const ev = events.find((e) => e.id === eventId);
    if (ev) { setFrom((ev.event_date ?? '').slice(0, 10)); setUntil((ev.end_date ?? ev.event_date ?? '').slice(0, 10)); }
  }, [eventId, events]);

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    catalog.forEach((c) => m.set(c.owner_sector_id, c.owner_sector_name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [catalog]);

  const list = useMemo(() => {
    const q = norm(search);
    return catalog.filter((c) => (!owner || c.owner_sector_id === owner) && (!q || norm(c.item_name + ' ' + (c.category ?? '')).includes(q)));
  }, [catalog, search, owner]);

  function toggle(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!dest) { setError('Escolha o setor que vai usar os itens.'); return; }
    if (picked.size === 0) { setError('Marque pelo menos um item.'); return; }
    if (from && until && until < from) { setError('A data final não pode ser antes da inicial.'); return; }
    setBusy(true);
    const r = await createLoan({ destSector: dest, eventId: eventId || null, from, until, notes, items: [...picked] });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(`${picked.size} ${picked.size === 1 ? 'item pedido' : 'itens pedidos'}. Quem coordena o setor de cada item vai autorizar ou recusar.`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pedir itens de outro setor"
      size="lg"
      footer={<ModalActions onCancel={onClose} formId={FORM_ID} confirmLabel={picked.size ? `Pedir (${picked.size})` : 'Pedir'} loading={busy} disabled={loading || picked.size === 0} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        {!fixedSectorId && (
          <div className="inv-field">
            <label className="inv-label" htmlFor="lr-dest">Quem vai usar (setor)</label>
            <select id="lr-dest" className="inv-input" value={dest} onChange={(e) => { setDest(e.target.value); setEventId(''); }}>
              {mine.length === 0 && <option value="">Você não tem setor nesta missão</option>}
              {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {!fixedEventId && (
          <div className="inv-field">
            <label className="inv-label" htmlFor="lr-ev">Para qual evento</label>
            <select id="lr-ev" className="inv-input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Empréstimo ao setor (sem evento)</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <div className="inv-field" style={{ flex: 1 }}>
            <label className="inv-label" htmlFor="lr-from">Preciso a partir de</label>
            <input id="lr-from" type="date" className="inv-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="inv-field" style={{ flex: 1 }}>
            <label className="inv-label" htmlFor="lr-until">Devolvo até</label>
            <input id="lr-until" type="date" className="inv-input" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>

        <div className="inv-field">
          <span className="inv-label">Itens de outros setores{catalog.length ? ` (${catalog.length})` : ''}</span>
          <div className="flex gap-2">
            <input className="inv-input" style={{ flex: 1 }} placeholder="Buscar item…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="inv-input" style={{ flex: 1 }} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Setor dono">
              <option value="">Todos os setores</option>
              {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>
          ) : list.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
              {catalog.length === 0 ? 'Nenhum item cadastrado em outros setores desta missão.' : 'Nenhum item encontrado.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {list.map((o) => {
                const on = picked.has(o.item_id);
                const img = photoUrl(o.photo_path, o.item_updated_at);
                return (
                  <li key={o.item_id}>
                    <label className="sh-card flex items-center gap-3" style={{ padding: '0.4rem 0.6rem', minHeight: 52, borderColor: on ? 'var(--sh-primary)' : undefined, borderWidth: on ? 2 : undefined }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(o.item_id)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                      <span className="inv-soft flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}>
                        {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={18} />}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>{o.item_name}</span>
                        <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
                          {o.owner_sector_name}{o.category ? ` · ${o.category}` : ''}
                        </span>
                        {!o.available && <span className="text-xs font-bold" style={{ color: '#b45309' }}>Fora do acervo agora</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="lr-notes">Observação para quem vai autorizar</label>
          <textarea id="lr-notes" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 64 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <p className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>
          Todo item fica aguardando a autorização de quem coordena o setor dono dele. A saída só pode ser registrada depois que o item for autorizado.
        </p>

        {error && <p className="inv-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
