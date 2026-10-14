import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseMoney } from '../lib/items';
import { fmtDate, todayLocal } from '../lib/movements';
import { formatCurrency } from '../lib/utils';

interface Repair {
  id: string;
  opened_at: string;
  description: string;
  cost: number | null;
  closed_at: string | null;
  notes: string | null;
}

const COLS = 'id,opened_at,description,cost,closed_at,notes';

/** Reparos do item: abrir, concluir (o item volta ao acervo) e histórico. Só quem edita o setor altera. */
export function RepairSection({
  itemId, canEdit, baixado, hasOpenSaida, onChanged,
}: { itemId: string; canEdit: boolean; baixado: boolean; hasOpenSaida: boolean; onChanged: () => void }) {
  const [list, setList] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [desc, setDesc] = useState('');
  // conclusão
  const [closingId, setClosingId] = useState<string | null>(null);
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [closedAt, setClosedAt] = useState(todayLocal());

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase.from('inv_repairs').select(COLS).eq('item_id', itemId)
      .order('opened_at', { ascending: false }).order('created_at', { ascending: false });
    if (err) setError(err.message);
    setList((data ?? []) as Repair[]);
    setLoading(false);
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  const open = list.filter((r) => !r.closed_at);
  const closed = list.filter((r) => r.closed_at);

  async function openRepair() {
    if (!supabase || busy) return;
    setError('');
    if (!desc.trim()) { setError('Descreva o que precisa ser consertado.'); return; }
    setBusy(true);
    const { error: err } = await supabase.from('inv_repairs').insert({ item_id: itemId, description: desc.trim(), opened_at: todayLocal() });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setOpening(false); setDesc('');
    await load(); onChanged();
  }

  function startClose(r: Repair) {
    setClosingId(r.id);
    setCost(r.cost != null ? String(r.cost).replace('.', ',') : '');
    setNotes(r.notes ?? '');
    setClosedAt(todayLocal());
    setError('');
  }

  async function closeRepair(r: Repair) {
    if (!supabase || busy) return;
    setError('');
    const c = parseMoney(cost);
    if (Number.isNaN(c)) { setError('Custo inválido.'); return; }
    if (closedAt < r.opened_at) { setError('A conclusão não pode ser antes da abertura (' + fmtDate(r.opened_at) + ').'); return; }
    setBusy(true);
    // .select('id') mostra se o banco realmente alterou (sem permissão não dá erro, só não altera)
    const { data, error: err } = await supabase.from('inv_repairs')
      .update({ closed_at: closedAt, cost: c, notes: notes.trim() || null }).eq('id', r.id).select('id');
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (!data || data.length === 0) { setError('O banco não permitiu concluir este reparo (sem permissão neste setor).'); return; }
    setClosingId(null);
    await load(); onChanged();
  }

  if (loading) return null;
  if (list.length === 0 && !(canEdit && !baixado)) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="inv-label">Reparos</span>

      {open.map((r) => (
        <div key={r.id} className="sh-card flex flex-col gap-2" style={{ padding: '0.75rem', borderColor: '#b91c1c' }}>
          <span className="font-bold text-sm flex items-center gap-2" style={{ color: '#b91c1c' }}><Wrench size={16} /> Em reparo desde {fmtDate(r.opened_at)}</span>
          <span className="text-sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.description}</span>

          {canEdit ? (
            closingId === r.id ? (
              <div className="flex flex-col gap-2">
                <div className="inv-field">
                  <label className="inv-label" htmlFor={`rp-date-${r.id}`}>Concluído em</label>
                  <input id={`rp-date-${r.id}`} type="date" className="inv-input" value={closedAt} min={r.opened_at} max={todayLocal()} onChange={(e) => setClosedAt(e.target.value)} />
                </div>
                <div className="inv-field">
                  <label className="inv-label" htmlFor={`rp-cost-${r.id}`}>Custo (R$, opcional)</label>
                  <input id={`rp-cost-${r.id}`} className="inv-input" inputMode="decimal" placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} />
                </div>
                <div className="inv-field">
                  <label className="inv-label" htmlFor={`rp-notes-${r.id}`}>Observação (opcional)</label>
                  <textarea id={`rp-notes-${r.id}`} className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: trocou a peça, consertado pelo Fulano" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setClosingId(null)} disabled={busy}>Cancelar</button>
                  <button type="button" className="sh-btn sh-btn-primary" onClick={() => closeRepair(r)} disabled={busy}>{busy ? 'Salvando…' : 'Concluir reparo'}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="sh-btn sh-btn-primary" onClick={() => startClose(r)} disabled={busy}>
                <CheckCircle2 size={16} /> Concluir reparo
              </button>
            )
          ) : (
            <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Só o coordenador ou gestor do setor conclui o reparo.</span>
          )}
        </div>
      ))}

      {canEdit && !baixado && open.length === 0 && (
        opening ? (
          <div className="sh-card flex flex-col gap-2" style={{ padding: '0.75rem' }}>
            <label className="inv-label" htmlFor="rp-new">O que precisa ser consertado?</label>
            <textarea id="rp-new" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 64 }} value={desc} onChange={(e) => setDesc(e.target.value)} />
            {hasOpenSaida && <span className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>O item está fora do acervo. Ele fica em reparo e a saída continua aberta até o retorno.</span>}
            <div className="flex gap-2 justify-end">
              <button type="button" className="sh-btn sh-btn-secondary" onClick={() => { setOpening(false); setDesc(''); }} disabled={busy}>Cancelar</button>
              <button type="button" className="sh-btn sh-btn-primary" onClick={openRepair} disabled={busy}>Abrir reparo</button>
            </div>
          </div>
        ) : (
          <button type="button" className="sh-btn sh-btn-secondary" onClick={() => { setOpening(true); setError(''); }}>
            <Wrench size={16} /> Abrir reparo
          </button>
        )
      )}

      {closed.length > 0 && (
        <ul className="flex flex-col gap-2">
          {closed.map((r) => (
            <li key={r.id} className="sh-card text-sm flex flex-col" style={{ padding: '0.6rem 0.75rem', gap: 2 }}>
              <span className="font-bold">Reparo concluído · {fmtDate(r.opened_at)} a {fmtDate(r.closed_at)}</span>
              <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{r.description}</span>
              {r.cost != null && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Custo: {formatCurrency(Number(r.cost))}</span>}
              {r.notes && <span className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>{r.notes}</span>}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="inv-error" role="alert">{error}</p>}
    </div>
  );
}
