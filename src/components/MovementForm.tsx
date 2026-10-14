import { useEffect, useState, type FormEvent } from 'react';
import { Modal, ModalActions } from '../kit';
import { supabase } from '../lib/supabase';
import { parseMoney, ITEM_COLUMNS, type Item } from '../lib/items';
import {
  CONDITIONS, MOVEMENT_COLUMNS, dateToInstant, fmtDate, registerMovement, todayLocal,
  type Condition, type EventRow, type Movement, type MoveKind, type Responsible,
} from '../lib/movements';
import { useScope } from '../scopeStore';
import { useSession } from '../store';
import { ResponsiblePicker } from './ResponsiblePicker';

const FORM_ID = 'move-form';
const TITLE: Record<MoveKind, string> = { entrada: 'Registrar entrada', saida: 'Registrar saída', retorno: 'Registrar retorno' };

export function MovementForm({
  open, kind, itemId, saidaId, onClose, onDone,
}: {
  open: boolean;
  kind: MoveKind;
  itemId: string;
  saidaId?: string | null; // retorno: id da saída em aberto
  onClose: () => void;
  onDone: (warning?: string) => void;
}) {
  const { canEditSector } = useScope();
  const user = useSession((s) => s.user);

  const [item, setItem] = useState<Item | null>(null);
  const [saida, setSaida] = useState<Movement | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(todayLocal());
  const [resp, setResp] = useState<Responsible | null>(null);
  const [condition, setCondition] = useState<Condition | ''>('');
  const [notes, setNotes] = useState('');
  // entrada
  const [source, setSource] = useState<'compra' | 'doacao'>('compra');
  const [valueText, setValueText] = useState('');
  // saída
  const [reason, setReason] = useState<'evento' | 'emprestimo'>('emprestimo');
  const [eventId, setEventId] = useState('');
  const [expected, setExpected] = useState('');
  const [newEvent, setNewEvent] = useState(false);
  const [evName, setEvName] = useState('');
  const [evDate, setEvDate] = useState('');
  // retorno
  const [needsRepair, setNeedsRepair] = useState(false);

  useEffect(() => {
    if (!open || !supabase) return;
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      const { data: it, error: e1 } = await supabase!.from('inv_items').select(ITEM_COLUMNS).eq('id', itemId).maybeSingle();
      if (!alive) return;
      if (e1 || !it) { setError(e1?.message ?? 'Item não encontrado.'); setLoading(false); return; }
      const item = it as Item;
      setItem(item);

      // valores iniciais
      setDate(todayLocal()); setCondition(''); setNotes(''); setNeedsRepair(false);
      setEventId(''); setExpected(''); setNewEvent(false); setEvName(''); setEvDate('');
      setReason('emprestimo');
      if (kind === 'entrada') {
        const v = item.value;
        setValueText(v != null ? String(v).replace('.', ',') : '');
        setSource(item.value_kind === 'estimado' ? 'doacao' : 'compra');
        if (item.acquired_at) setDate(item.acquired_at.slice(0, 10));
        // quem registra é o responsável padrão
        const me = await supabase!.from('inv_profiles').select('id,name').eq('id', user?.id ?? '').maybeSingle();
        if (alive && me.data) setResp({ type: 'usuario', id: me.data.id, name: me.data.name });
        else setResp(null);
      } else if (kind === 'retorno' && saidaId) {
        const { data: s } = await supabase!.from('inv_movements').select(MOVEMENT_COLUMNS).eq('id', saidaId).maybeSingle();
        if (!alive) return;
        const sm = (s as Movement | null) ?? null;
        setSaida(sm);
        // quem devolve começa sendo quem levou
        setResp(sm ? { type: sm.responsible_type, id: (sm.responsible_user_id ?? sm.responsible_member_id) ?? undefined, name: sm.responsible_name } : null);
      } else {
        setResp(null);
      }
      if (kind === 'saida') {
        const ev = await supabase!.from('inv_events').select('id,sector_id,name,event_date,end_date').eq('sector_id', item.sector_id).order('event_date', { ascending: false, nullsFirst: false }).limit(100);
        if (alive) setEvents((ev.data ?? []) as EventRow[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, kind, itemId, saidaId, user?.id]);

  function onPickEvent(id: string) {
    setEventId(id);
    const ev = events.find((e) => e.id === id);
    if (ev && !expected) setExpected((ev.end_date ?? ev.event_date ?? '').slice(0, 10));
  }

  const canEdit = item ? canEditSector(item.sector_id) : false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !item || !user || busy) return;
    setError('');
    if (!resp || !resp.name.trim()) { setError('Escolha o responsável ou digite o nome.'); return; }
    if (kind === 'entrada' && !canEdit) { setError('Só quem edita o setor registra entrada.'); return; }

    let value: number | null = null;
    if (kind === 'entrada') {
      const v = parseMoney(valueText);
      if (Number.isNaN(v)) { setError('Valor inválido.'); return; }
      value = v;
    }
    if (kind === 'saida') {
      if (reason === 'emprestimo' && !expected) { setError('Informe a data prevista de volta.'); return; }
      if (expected && expected < date) { setError('A data prevista de volta não pode ser antes da saída.'); return; }
    }

    setBusy(true);
    let evId: string | null = eventId || null;
    if (kind === 'saida' && reason === 'evento') {
      if (newEvent) {
        if (!evName.trim()) { setBusy(false); setError('Dê um nome ao evento.'); return; }
        const { data, error: ee } = await supabase.from('inv_events')
          .insert({ mission_id: item.mission_id, sector_id: item.sector_id, name: evName.trim(), event_date: evDate || null, created_by: user.id })
          .select('id').single();
        if (ee || !data) { setBusy(false); setError('Não foi possível criar o evento: ' + (ee?.message ?? '')); return; }
        evId = data.id;
      }
      if (!evId) { setBusy(false); setError('Escolha o evento ou crie um novo.'); return; }
    }

    const r = await registerMovement({
      item_id: item.id,
      sector_id: item.sector_id,
      kind,
      occurred_at: dateToInstant(date),
      responsible: resp,
      created_by: user.id,
      condition: condition || null,
      notes,
      entry_source: source,
      value,
      value_kind: source === 'compra' ? 'compra' : 'estimado',
      saida_reason: reason,
      event_id: evId,
      expected_return: expected || null,
      return_of: kind === 'retorno' ? (saidaId ?? undefined) : undefined,
      needs_repair: needsRepair,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(r.warning);
  }

  const showContacts = canEdit;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${TITLE[kind]}${item ? ' — ' + item.name : ''}`}
      size="lg"
      footer={<ModalActions onCancel={onClose} formId={FORM_ID} confirmLabel="Registrar" loading={busy} disabled={loading || !item} />}
    >
      {loading ? (
        <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>
      ) : !item ? (
        <p className="inv-error">{error || 'Item não encontrado.'}</p>
      ) : (
        <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
          {kind === 'retorno' && saida && (
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
              Saída de {fmtDate(saida.occurred_at)} ({saida.saida_reason === 'evento' ? 'evento' : 'empréstimo'}) com {saida.responsible_name}
              {saida.expected_return ? ` · previsto ${fmtDate(saida.expected_return)}` : ''}.
            </p>
          )}

          <div className="inv-field">
            <label className="inv-label" htmlFor="mv-date">{kind === 'entrada' ? 'Data da entrada' : kind === 'saida' ? 'Data da saída' : 'Data do retorno'}</label>
            <input id="mv-date" type="date" className="inv-input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
          </div>

          {kind === 'entrada' && (
            <div className="inv-field">
              <span className="inv-label">Como chegou</span>
              <div className="flex gap-2">
                <select className="inv-input" value={source} onChange={(e) => setSource(e.target.value as 'compra' | 'doacao')} aria-label="Como chegou">
                  <option value="compra">Compra</option>
                  <option value="doacao">Doação</option>
                </select>
                <input className="inv-input" inputMode="decimal" placeholder={source === 'compra' ? 'Valor pago (R$)' : 'Valor médio estimado (R$)'} value={valueText} onChange={(e) => setValueText(e.target.value)} />
              </div>
            </div>
          )}

          {kind === 'saida' && (
            <>
              <div className="inv-field">
                <label className="inv-label" htmlFor="mv-reason">Motivo</label>
                <select id="mv-reason" className="inv-input" value={reason} onChange={(e) => setReason(e.target.value as 'evento' | 'emprestimo')}>
                  <option value="emprestimo">Empréstimo a alguém</option>
                  <option value="evento">Evento</option>
                </select>
              </div>
              {reason === 'evento' && (
                <div className="inv-field">
                  <label className="inv-label" htmlFor="mv-event">Evento</label>
                  {!newEvent ? (
                    <>
                      <select id="mv-event" className="inv-input" value={eventId} onChange={(e) => onPickEvent(e.target.value)}>
                        <option value="">{events.length ? 'Escolha o evento' : 'Nenhum evento cadastrado'}</option>
                        {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}{ev.event_date ? ` · ${fmtDate(ev.event_date)}` : ''}</option>)}
                      </select>
                      {canEdit
                        ? <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setNewEvent(true)}>Criar evento novo</button>
                        : events.length === 0 && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Peça ao coordenador para cadastrar o evento.</span>}
                    </>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <input className="inv-input" placeholder="Nome do evento" value={evName} onChange={(e) => setEvName(e.target.value)} maxLength={120} />
                      <input className="inv-input" type="date" value={evDate} onChange={(e) => { setEvDate(e.target.value); if (!expected) setExpected(e.target.value); }} aria-label="Data do evento" />
                      <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setNewEvent(false)}>Escolher um evento existente</button>
                    </div>
                  )}
                </div>
              )}
              <div className="inv-field">
                <label className="inv-label" htmlFor="mv-exp">Data prevista de volta{reason === 'emprestimo' ? ' *' : ''}</label>
                <input id="mv-exp" type="date" className="inv-input" value={expected} min={date} onChange={(e) => setExpected(e.target.value)} />
              </div>
            </>
          )}

          <div className="inv-field">
            <span className="inv-label">{kind === 'saida' ? 'Quem leva (responsável) *' : kind === 'retorno' ? 'Quem devolve *' : 'Quem registra a entrada *'}</span>
            <ResponsiblePicker missionId={item.mission_id} value={resp} onChange={setResp} canSeeContacts={showContacts} />
          </div>

          <div className="inv-field">
            <label className="inv-label" htmlFor="mv-cond">{kind === 'saida' ? 'Condição na saída' : kind === 'retorno' ? 'Condição na volta' : 'Condição'}</label>
            <select id="mv-cond" className="inv-input" value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
              <option value="">Não informar</option>
              {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {kind === 'retorno' && (
            <label className="flex items-center gap-2" style={{ minHeight: 44 }}>
              <input type="checkbox" checked={needsRepair} onChange={(e) => setNeedsRepair(e.target.checked)} style={{ width: 20, height: 20 }} />
              <span className="text-sm font-bold">Precisa de reparo</span>
            </label>
          )}

          <div className="inv-field">
            <label className="inv-label" htmlFor="mv-notes">Observação</label>
            <textarea id="mv-notes" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 72 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
            {kind === 'retorno' && needsRepair && <span className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>A observação vira a descrição do reparo.</span>}
          </div>

          {error && <p className="inv-error" role="alert">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
