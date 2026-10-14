import { useEffect, useState, type FormEvent } from 'react';
import { Modal, ModalActions } from '../kit';
import { loanRetorno, loanSaida, type LoanRow } from '../lib/loans';
import { CONDITIONS, todayLocal, type Condition, type Responsible } from '../lib/movements';
import { useScope } from '../scopeStore';
import { ResponsiblePicker } from './ResponsiblePicker';

const FORM_ID = 'loan-use-form';

/** Registra a saída (item autorizado) ou o retorno (item em uso) de um pedido entre setores. */
export function LoanUseForm({
  row, mode, onClose, onDone,
}: {
  row: LoanRow | null;
  mode: 'saida' | 'retorno';
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [date, setDate] = useState(todayLocal());
  const [expected, setExpected] = useState('');
  const [resp, setResp] = useState<Responsible | null>(null);
  const [condition, setCondition] = useState<Condition | ''>('');
  const [notes, setNotes] = useState('');
  const [repair, setRepair] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!row) return;
    setDate(todayLocal()); setResp(null); setCondition(''); setNotes(''); setRepair(false); setError('');
    setExpected((row.needed_until ?? '').slice(0, 10));
  }, [row?.loan_item_id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!row || busy) return;
    setError('');
    if (mode === 'saida') {
      if (!resp || !resp.name.trim()) { setError('Escolha o responsável ou digite o nome.'); return; }
      if (expected && expected < date) { setError('A data prevista de volta não pode ser antes da saída.'); return; }
    }
    setBusy(true);
    const r = mode === 'saida'
      ? await loanSaida({ loanItemId: row.loan_item_id, date, expected, responsible: resp!, condition, notes })
      : await loanRetorno({ loanItemId: row.loan_item_id, date, condition, notes, needsRepair: repair });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(mode === 'saida' ? 'Saída registrada.' : repair ? 'Retorno registrado. Um reparo foi aberto.' : 'Retorno registrado.');
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={mode === 'saida' ? 'Registrar saída' : 'Registrar retorno'}
      size="lg"
      footer={<ModalActions onCancel={onClose} formId={FORM_ID} confirmLabel={mode === 'saida' ? 'Registrar saída' : 'Registrar retorno'} loading={busy} />}
    >
      {row && (
        <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
          <div className="text-sm">
            <p className="font-bold" style={{ overflowWrap: 'anywhere' }}>{row.item_name}</p>
            <p style={{ color: 'var(--sh-text-muted)' }}>
              De {row.owner_sector_name} para {row.event_name ? `o evento «${row.event_name}»` : row.dest_sector_name}
              {mode === 'retorno' && row.out_responsible ? ` · com ${row.out_responsible}` : ''}
            </p>
          </div>

          <div className="flex gap-2">
            <div className="inv-field" style={{ flex: 1 }}>
              <label className="inv-label" htmlFor="lu-date">{mode === 'saida' ? 'Data da saída' : 'Data do retorno'}</label>
              <input id="lu-date" type="date" className="inv-input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
            </div>
            {mode === 'saida' && (
              <div className="inv-field" style={{ flex: 1 }}>
                <label className="inv-label" htmlFor="lu-exp">Previsto de volta</label>
                <input id="lu-exp" type="date" className="inv-input" value={expected} min={date} onChange={(e) => setExpected(e.target.value)} />
              </div>
            )}
          </div>

          {mode === 'saida' && (
            <div className="inv-field">
              <span className="inv-label">Quem leva (responsável) *</span>
              <ResponsiblePicker missionId={missionOf(row)} value={resp} onChange={setResp} canSeeContacts={row.can_decide} />
            </div>
          )}

          <div className="inv-field">
            <label className="inv-label" htmlFor="lu-cond">{mode === 'saida' ? 'Condição na saída' : 'Condição na volta'}</label>
            <select id="lu-cond" className="inv-input" value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
              <option value="">Não informar</option>
              {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div className="inv-field">
            <label className="inv-label" htmlFor="lu-notes">Observação</label>
            <textarea id="lu-notes" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 64 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {mode === 'retorno' && (
            <label className="flex items-center gap-2 text-sm" style={{ minHeight: 40 }}>
              <input type="checkbox" checked={repair} onChange={(e) => setRepair(e.target.checked)} style={{ width: 20, height: 20 }} />
              Precisa de reparo (a observação vira a descrição)
            </label>
          )}

          {error && <p className="inv-error" role="alert">{error}</p>}
        </form>
      )}
    </Modal>
  );
}

// A missão do pedido é a do setor de destino; o picker usa só para ordenar membros do Wop.
function missionOf(row: LoanRow): string {
  const s = useScope.getState().sectors.find((x) => x.id === row.dest_sector_id);
  return s?.mission_id ?? useScope.getState().missionId;
}
