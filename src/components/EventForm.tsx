import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal, ModalActions } from '../kit';
import { supabase } from '../lib/supabase';
import { EVENT_COLUMNS, type EventFull } from '../lib/events';
import { useScope } from '../scopeStore';
import { useSession } from '../store';

const FORM_ID = 'event-form';

export function EventForm({
  open, event, defaultSectorId, canDelete, onClose, onSaved, onDeleted,
}: {
  open: boolean;
  event?: EventFull | null;
  defaultSectorId?: string;
  canDelete?: boolean; // true só quando nenhuma saída está ligada ao evento
  onClose: () => void;
  onSaved: (e: EventFull) => void;
  onDeleted?: () => void;
}) {
  const { sectors, missionId, canEditSector } = useScope();
  const user = useSession((s) => s.user);
  const editable = useMemo(
    () => sectors.filter((s) => s.mission_id === missionId && s.active && canEditSector(s.id)),
    [sectors, missionId, canEditSector],
  );

  const [name, setName] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(event?.name ?? '');
    setSectorId(event?.sector_id ?? (editable.some((s) => s.id === defaultSectorId) ? defaultSectorId! : editable[0]?.id ?? ''));
    setStart(event?.event_date?.slice(0, 10) ?? '');
    setEnd(event?.end_date?.slice(0, 10) ?? '');
    setNotes(event?.notes ?? '');
    setError(''); setConfirmDel(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setError('');
    if (!name.trim()) { setError('Dê um nome ao evento.'); return; }
    if (!sectorId) { setError('Escolha o setor.'); return; }
    if (start && end && end < start) { setError('A data final não pode ser antes da inicial.'); return; }
    setBusy(true);
    const body = { name: name.trim(), event_date: start || null, end_date: end || null, notes: notes.trim() || null };
    const q = event
      ? supabase.from('inv_events').update(body).eq('id', event.id).select(EVENT_COLUMNS).maybeSingle()
      : supabase.from('inv_events').insert({ ...body, sector_id: sectorId, created_by: user?.id }).select(EVENT_COLUMNS).maybeSingle();
    const { data, error: err } = await q;
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (!data) { setError('O banco não permitiu salvar (sem permissão neste setor).'); return; }
    onSaved(data as EventFull);
  }

  async function remove() {
    if (!supabase || !event || busy) return;
    setBusy(true); setError('');
    const { data, error: err } = await supabase.from('inv_events').delete().eq('id', event.id).select('id');
    setBusy(false);
    if (err) { setError(err.message); setConfirmDel(false); return; }
    if (!data || data.length === 0) { setError('O banco não permitiu apagar este evento.'); setConfirmDel(false); return; }
    onDeleted?.();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? 'Editar evento' : 'Novo evento'}
      footer={
        <ModalActions
          onCancel={onClose}
          formId={FORM_ID}
          loading={busy}
          extra={event && canDelete ? (
            <button type="button" className="sh-btn sh-btn-danger" onClick={() => setConfirmDel(true)} disabled={busy}>
              <Trash2 size={16} /> Apagar
            </button>
          ) : undefined}
        />
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        <div className="inv-field">
          <label className="inv-label" htmlFor="ev-name">Nome *</label>
          <input id="ev-name" className="inv-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="ev-sector">Setor *</label>
          {event ? (
            <>
              <input id="ev-sector" className="inv-input" disabled value={sectors.find((s) => s.id === event.sector_id)?.name ?? ''} />
              <span className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>O setor não muda depois do cadastro.</span>
            </>
          ) : (
            <select id="ev-sector" className="inv-input" value={sectorId} onChange={(e) => setSectorId(e.target.value)} required>
              {editable.length === 0 && <option value="">Sem setor para cadastrar</option>}
              {editable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex gap-2">
          <div className="inv-field" style={{ flex: 1 }}>
            <label className="inv-label" htmlFor="ev-start">Início</label>
            <input id="ev-start" type="date" className="inv-input" value={start} onChange={(e) => { setStart(e.target.value); if (!end) setEnd(e.target.value); }} />
          </div>
          <div className="inv-field" style={{ flex: 1 }}>
            <label className="inv-label" htmlFor="ev-end">Fim</label>
            <input id="ev-end" type="date" className="inv-input" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="ev-notes">Observações</label>
          <textarea id="ev-notes" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 72 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {event && !canDelete && (
          <p className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>Este evento já tem saídas de itens e não pode ser apagado (o histórico é mantido).</p>
        )}

        {confirmDel && (
          <div className="sh-card flex flex-col gap-2" style={{ padding: '0.75rem' }}>
            <p className="text-sm font-bold">Apagar «{event?.name}»? Isso não pode ser desfeito.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setConfirmDel(false)}>Cancelar</button>
              <button type="button" className="sh-btn sh-btn-danger" onClick={remove} disabled={busy}>Apagar</button>
            </div>
          </div>
        )}

        {error && <p className="inv-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
