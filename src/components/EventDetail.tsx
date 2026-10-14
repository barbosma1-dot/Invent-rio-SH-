import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImageOff, Pencil, Plus, Undo2 } from 'lucide-react';
import { Modal } from '../kit';
import { supabase } from '../lib/supabase';
import { photoUrl } from '../lib/items';
import { EVENT_COLUMNS, registerBatchRetorno, type EventFull } from '../lib/events';
import {
  CONDITIONS, MOVEMENT_COLUMNS, fmtDate, todayLocal,
  type Condition, type Movement,
} from '../lib/movements';
import { useScope } from '../scopeStore';
import { useSession } from '../store';
import { EventForm } from './EventForm';
import { EventPickItems } from './EventPickItems';
import { ItemDetail } from './ItemDetail';

type Row = Movement & { inv_items: { name: string; photo_path: string | null } | null };
interface Back { return_of: string; occurred_at: string; condition: string | null; needs_repair: boolean }

export function EventDetail({
  eventId, onClose, onChanged,
}: { eventId: string; onClose: () => void; onChanged: () => void }) {
  const { sectors, canEditSector } = useScope();
  const user = useSession((s) => s.user);
  const [event, setEvent] = useState<EventFull | null>(null);
  const [saidas, setSaidas] = useState<Row[]>([]);
  const [backs, setBacks] = useState<Map<string, Back>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  // conferência
  const [marked, setMarked] = useState<Set<string>>(new Set()); // ids das saídas marcadas
  const [repair, setRepair] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(todayLocal());
  const [condition, setCondition] = useState<Condition | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const ev = await supabase.from('inv_events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle();
    if (ev.error || !ev.data) { setEvent(null); setError(ev.error?.message ?? ''); setLoading(false); return; }
    setEvent(ev.data as EventFull);
    const sd = await supabase.from('inv_movements').select(`${MOVEMENT_COLUMNS},inv_items(name,photo_path)`)
      .eq('event_id', eventId).eq('kind', 'saida').order('occurred_at', { ascending: true }).range(0, 999);
    if (sd.error) { setError(sd.error.message); setLoading(false); return; }
    const rows = (sd.data ?? []) as unknown as Row[];
    setSaidas(rows);
    if (rows.length) {
      const rt = await supabase.from('inv_movements').select('return_of,occurred_at,condition,needs_repair').eq('kind', 'retorno').in('return_of', rows.map((r) => r.id));
      setBacks(new Map(((rt.data ?? []) as Back[]).map((b) => [b.return_of, b])));
    } else setBacks(new Map());
    setMarked(new Set()); setRepair(new Set());
    setError('');
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const today = todayLocal();
  const open = useMemo(() => saidas.filter((s) => !backs.has(s.id)), [saidas, backs]);
  const done = saidas.length - open.length;
  const canEdit = event ? canEditSector(event.sector_id) : false;
  const sectorName = event ? sectors.find((s) => s.id === event.sector_id)?.name ?? '' : '';

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n);
  }

  async function confirmReturn() {
    if (!user || busy || marked.size === 0) return;
    setBusy(true); setError('');
    const r = await registerBatchRetorno({
      returns: open.filter((s) => marked.has(s.id)).map((s) => ({
        item_id: s.item_id,
        saida_id: s.id,
        needs_repair: repair.has(s.id),
        responsible: { type: s.responsible_type, id: (s.responsible_user_id ?? s.responsible_member_id) ?? undefined, name: s.responsible_name },
      })),
      date, condition: condition || null, notes, userId: user.id,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setNotice(`${marked.size} ${marked.size === 1 ? 'retorno registrado' : 'retornos registrados'}.`);
    setCondition(''); setNotes('');
    await load();
    onChanged();
  }

  return (
    <>
      <Modal open={!editing && !picking && !itemId} onClose={onClose} title={event?.name ?? 'Evento'} size="lg">
        {loading ? (
          <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>
        ) : !event ? (
          <p className="inv-error">{error || 'Evento não encontrado, ou você não tem acesso ao setor dele.'}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm" style={{ color: 'var(--sh-text-muted)' }}>
              <span>{sectorName}</span>
              {(event.event_date || event.end_date) && (
                <span>
                  {fmtDate(event.event_date)}{event.end_date && event.end_date !== event.event_date ? ` a ${fmtDate(event.end_date)}` : ''}
                </span>
              )}
              {event.notes && <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{event.notes}</span>}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="button" className="sh-btn sh-btn-primary" onClick={() => { setNotice(''); setPicking(true); }}>
                <Plus size={16} /> Separar itens
              </button>
              {canEdit && (
                <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Editar
                </button>
              )}
            </div>

            {notice && <p className="text-sm font-bold" style={{ color: 'var(--sh-primary)' }}>{notice}</p>}

            <div className="flex flex-col gap-2">
              <span className="inv-label">
                {saidas.length === 0 ? 'Itens do evento' : `Itens do evento · voltaram ${done} de ${saidas.length}`}
              </span>
              {saidas.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Nenhum item separado ainda. Use "Separar itens".</p>
              )}
              <ul className="flex flex-col gap-2">
                {saidas.map((s) => {
                  const back = backs.get(s.id);
                  const isOpen = !back;
                  const late = isOpen && !!s.expected_return && s.expected_return < today;
                  const img = photoUrl(s.inv_items?.photo_path);
                  const on = marked.has(s.id);
                  return (
                    <li key={s.id} className="sh-card flex flex-col gap-2" style={{ padding: '0.6rem 0.75rem', borderColor: on ? 'var(--sh-primary)' : undefined }}>
                      <div className="flex items-center gap-3">
                        {isOpen ? (
                          <input type="checkbox" aria-label={`Marcar ${s.inv_items?.name ?? 'item'} como devolvido`} checked={on}
                            onChange={() => toggle(marked, s.id, setMarked)} style={{ width: 22, height: 22, flexShrink: 0 }} />
                        ) : (
                          <CheckCircle2 size={22} style={{ color: '#15803d', flexShrink: 0 }} aria-label="Já voltou" />
                        )}
                        <button type="button" className="flex items-center gap-3 text-left min-w-0" style={{ flex: 1 }} onClick={() => setItemId(s.item_id)}>
                          <span className="inv-soft flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}>
                            {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={18} />}
                          </span>
                          <span className="flex flex-col min-w-0">
                            <span className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>{s.inv_items?.name ?? 'Item'}</span>
                            <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>com {s.responsible_name}</span>
                            <span className="text-xs font-bold" style={{ color: late ? '#b91c1c' : back ? '#15803d' : 'var(--sh-text-muted)' }}>
                              {back ? `Voltou ${fmtDate(back.occurred_at)}${back.needs_repair ? ' · precisa de reparo' : ''}`
                                : `${late ? 'Atrasado · ' : 'Fora · '}${s.expected_return ? 'volta ' + fmtDate(s.expected_return) : 'sem data de volta'}`}
                            </span>
                          </span>
                        </button>
                      </div>
                      {on && (
                        <label className="flex items-center gap-2 text-sm" style={{ minHeight: 36, paddingLeft: 34 }}>
                          <input type="checkbox" checked={repair.has(s.id)} onChange={() => toggle(repair, s.id, setRepair)} style={{ width: 18, height: 18 }} />
                          Precisa de reparo
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>

              {open.length > 1 && (
                <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setMarked(marked.size === open.length ? new Set() : new Set(open.map((s) => s.id)))}>
                  {marked.size === open.length ? 'Desmarcar todos' : `Marcar todos os pendentes (${open.length})`}
                </button>
              )}
            </div>

            {marked.size > 0 && (
              <div className="sh-card flex flex-col gap-3" style={{ padding: '0.75rem' }}>
                <span className="inv-label">Conferência na volta · {marked.size} {marked.size === 1 ? 'item' : 'itens'}</span>
                <div className="inv-field">
                  <label className="inv-label" htmlFor="ed-date">Data do retorno</label>
                  <input id="ed-date" type="date" className="inv-input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="inv-field">
                  <label className="inv-label" htmlFor="ed-cond">Condição na volta (todos)</label>
                  <select id="ed-cond" className="inv-input" value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
                    <option value="">Não informar</option>
                    {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="inv-field">
                  <label className="inv-label" htmlFor="ed-notes">Observação</label>
                  <textarea id="ed-notes" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <button type="button" className="sh-btn sh-btn-primary" onClick={confirmReturn} disabled={busy}>
                  <Undo2 size={16} /> {busy ? 'Registrando…' : `Registrar retorno (${marked.size})`}
                </button>
                <span className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>Quem devolve é quem levou. Se algum item voltou em condição diferente, registre-o à parte pelo próprio item.</span>
              </div>
            )}

            {open.length > 0 && marked.size === 0 && (
              <p className="text-sm" style={{ color: late(open, today) ? '#b91c1c' : 'var(--sh-text-muted)' }}>
                {open.length} {open.length === 1 ? 'item ainda não voltou' : 'itens ainda não voltaram'}. Marque os que voltaram para registrar.
              </p>
            )}
            {saidas.length > 0 && open.length === 0 && (
              <p className="text-sm font-bold" style={{ color: '#15803d' }}>Tudo voltou. Conferência completa.</p>
            )}

            {error && <p className="inv-error" role="alert">{error}</p>}
          </div>
        )}
      </Modal>

      {event && (
        <EventForm
          open={editing}
          event={event}
          canDelete={saidas.length === 0}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); onChanged(); }}
          onDeleted={() => { setEditing(false); onChanged(); onClose(); }}
        />
      )}

      {event && (
        <EventPickItems
          open={picking}
          event={event}
          onClose={() => setPicking(false)}
          onDone={async (w) => { setPicking(false); setNotice(w ?? 'Saída registrada.'); await load(); onChanged(); }}
        />
      )}

      {itemId && <ItemDetail key={itemId} itemId={itemId} onClose={() => setItemId(null)} onChanged={async () => { await load(); onChanged(); }} />}
    </>
  );
}

function late(open: Row[], today: string): boolean {
  return open.some((s) => !!s.expected_return && s.expected_return < today);
}
