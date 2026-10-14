import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ImageOff } from 'lucide-react';
import { Modal, ModalActions } from '../kit';
import { supabase } from '../lib/supabase';
import { photoUrl } from '../lib/items';
import { registerBatchSaida, type EventFull } from '../lib/events';
import { CONDITIONS, norm, todayLocal, type Condition, type Responsible } from '../lib/movements';
import { useScope } from '../scopeStore';
import { useSession } from '../store';
import { ResponsiblePicker } from './ResponsiblePicker';

const FORM_ID = 'event-pick-form';
interface Opt { id: string; name: string; category: string | null; photo_path: string | null; updated_at: string }

/** Separa vários itens do acervo para um evento (saída em lote). */
export function EventPickItems({
  open, event, onClose, onDone,
}: { open: boolean; event: EventFull; onClose: () => void; onDone: (warning?: string) => void }) {
  const { canEditSector } = useScope();
  const user = useSession((s) => s.user);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [expected, setExpected] = useState('');
  const [resp, setResp] = useState<Responsible | null>(null);
  const [condition, setCondition] = useState<Condition | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !supabase) return;
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      setPicked(new Set()); setSearch(''); setDate(todayLocal()); setResp(null); setCondition(''); setNotes('');
      setExpected((event.end_date ?? event.event_date ?? '').slice(0, 10));
      const [it, st] = await Promise.all([
        supabase!.from('inv_items').select('id,name,category,photo_path,updated_at').eq('sector_id', event.sector_id).is('baixa_at', null).order('name').range(0, 1999),
        supabase!.from('inv_item_status').select('item_id,status').eq('sector_id', event.sector_id).eq('status', 'no_acervo').range(0, 1999),
      ]);
      if (!alive) return;
      if (it.error || st.error) { setError((it.error || st.error)!.message); setLoading(false); return; }
      const free = new Set(((st.data ?? []) as { item_id: string }[]).map((r) => r.item_id));
      setOpts(((it.data ?? []) as Opt[]).filter((i) => free.has(i.id)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, event.id, event.sector_id, event.end_date, event.event_date]);

  const list = useMemo(() => {
    const q = norm(search);
    return q ? opts.filter((o) => norm(o.name + ' ' + (o.category ?? '')).includes(q)) : opts;
  }, [opts, search]);

  function toggle(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    setError('');
    if (picked.size === 0) { setError('Marque pelo menos um item.'); return; }
    if (!resp || !resp.name.trim()) { setError('Escolha o responsável ou digite o nome.'); return; }
    if (expected && expected < date) { setError('A data prevista de volta não pode ser antes da saída.'); return; }
    setBusy(true);
    const r = await registerBatchSaida({
      items: [...picked].map((id) => ({ item_id: id, sector_id: event.sector_id })),
      eventId: event.id, date, expected: expected || null, responsible: resp,
      condition: condition || null, notes, userId: user.id,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(r.warning);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Separar itens — ${event.name}`}
      size="lg"
      footer={<ModalActions onCancel={onClose} formId={FORM_ID} confirmLabel={picked.size ? `Registrar saída (${picked.size})` : 'Registrar saída'} loading={busy} disabled={loading || picked.size === 0} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        <div className="inv-field">
          <span className="inv-label">Itens no acervo{opts.length ? ` (${opts.length})` : ''}</span>
          <input className="inv-input" placeholder="Buscar item…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>
          ) : list.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
              {opts.length === 0 ? 'Nenhum item disponível no acervo deste setor.' : 'Nenhum item encontrado.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {list.map((o) => {
                const on = picked.has(o.id);
                const img = photoUrl(o.photo_path, o.updated_at);
                return (
                  <li key={o.id}>
                    <label className="sh-card flex items-center gap-3" style={{ padding: '0.4rem 0.6rem', minHeight: 52, borderColor: on ? 'var(--sh-primary)' : undefined, borderWidth: on ? 2 : undefined }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(o.id)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                      <span className="inv-soft flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}>
                        {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={18} />}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>{o.name}</span>
                        {o.category && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{o.category}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <div className="inv-field" style={{ flex: 1 }}>
            <label className="inv-label" htmlFor="ep-date">Data da saída</label>
            <input id="ep-date" type="date" className="inv-input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="inv-field" style={{ flex: 1 }}>
            <label className="inv-label" htmlFor="ep-exp">Previsto de volta</label>
            <input id="ep-exp" type="date" className="inv-input" value={expected} min={date} onChange={(e) => setExpected(e.target.value)} />
          </div>
        </div>

        <div className="inv-field">
          <span className="inv-label">Quem leva (responsável) *</span>
          <ResponsiblePicker missionId={event.mission_id} value={resp} onChange={setResp} canSeeContacts={canEditSector(event.sector_id)} />
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="ep-cond">Condição na saída (todos)</label>
          <select id="ep-cond" className="inv-input" value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
            <option value="">Não informar</option>
            {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="ep-notes">Observação</label>
          <textarea id="ep-notes" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 64 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="inv-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
