import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Modal, ModalActions, PageHeader } from '../kit';
import { cancelLoans, decideLoans, listLoans, type LoanRow } from '../lib/loans';
import { fmtDate } from '../lib/movements';
import { useScope } from '../scopeStore';
import { useSession } from '../store';
import { ItemDetail } from './ItemDetail';
import { LoanItemCard } from './LoanItemCard';
import { LoanRequestForm } from './LoanRequestForm';
import { LoanUseForm } from './LoanUseForm';

type Filter = 'decidir' | 'andamento' | 'meus' | 'todos';

export function notifyLoansChanged() {
  window.dispatchEvent(new Event('inv-loans-changed'));
}

/** Aba Pedidos: itens que um setor pede emprestado a outro, com autorização do setor dono. */
export function Loans() {
  const { loaded, missions, missionId, setMission } = useScope();
  const me = useSession((s) => s.user?.id);
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [filter, setFilter] = useState<Filter>('todos');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [use, setUse] = useState<{ row: LoanRow; mode: 'saida' | 'retorno' } | null>(null);
  const [refuse, setRefuse] = useState<LoanRow[] | null>(null);
  const [refuseNote, setRefuseNote] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!missionId) { setRows([]); return; }
    setFetching(true); setError('');
    const r = await listLoans(missionId);
    if (!r.ok) { setError(r.error); setRows([]); } else setRows(r.data);
    setFetching(false);
  }, [missionId]);

  useEffect(() => { if (loaded) reload(); }, [loaded, reload]);

  const toDecide = useMemo(() => rows.filter((r) => r.status === 'pendente' && r.can_decide), [rows]);

  const visible = useMemo(() => {
    switch (filter) {
      case 'decidir': return toDecide;
      case 'andamento': return rows.filter((r) => r.status === 'autorizado' || r.status === 'em_uso');
      case 'meus': return rows.filter((r) => r.requested_by === me);
      default: return rows;
    }
  }, [rows, filter, toDecide, me]);

  // um cartão por pedido, com os itens dentro (a lista já vem do mais novo para o mais antigo)
  const groups = useMemo(() => {
    const m = new Map<string, LoanRow[]>();
    for (const r of visible) { const g = m.get(r.request_id); if (g) g.push(r); else m.set(r.request_id, [r]); }
    return [...m.values()];
  }, [visible]);

  async function changed(msg: string) {
    setNotice(msg);
    await reload();
    notifyLoansChanged();
  }

  async function approve(list: LoanRow[]) {
    setBusy(true); setError('');
    const r = await decideLoans(list.map((x) => x.loan_item_id), true, '');
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await changed(r.data === 1 ? 'Item autorizado.' : `${r.data} itens autorizados.`);
  }

  async function confirmRefuse() {
    if (!refuse) return;
    setBusy(true); setError('');
    const r = await decideLoans(refuse.map((x) => x.loan_item_id), false, refuseNote);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setRefuse(null); setRefuseNote('');
    await changed('Resposta registrada.');
  }

  async function cancel(row: LoanRow) {
    setBusy(true); setError('');
    const r = await cancelLoans([row.loan_item_id]);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await changed('Pedido cancelado.');
  }

  if (!loaded) {
    return <div className="sh-page"><PageHeader title="Pedidos" /><p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p></div>;
  }
  if (missions.length === 0) {
    return (
      <div className="sh-page">
        <PageHeader title="Pedidos" subtitle="Itens emprestados entre setores." />
        <div className="sh-card"><p className="font-extrabold">Você ainda não tem acesso a nenhum inventário.</p></div>
      </div>
    );
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'decidir', label: `Para autorizar${toDecide.length ? ` (${toDecide.length})` : ''}` },
    { id: 'andamento', label: 'Em andamento' },
    { id: 'meus', label: 'Meus pedidos' },
  ];

  return (
    <div className="sh-page">
      <PageHeader
        title="Pedidos"
        subtitle="Itens emprestados entre setores"
        primary={{ label: 'Pedir itens', onClick: () => { setNotice(''); setAsking(true); } }}
      />

      <div className="flex gap-2 flex-wrap mb-3">
        <select className="inv-input" style={{ flex: '1 1 12rem' }} value={missionId} onChange={(e) => setMission(e.target.value)} aria-label="Missão">
          {missions.map((m) => <option key={m.id} value={m.id}>{m.name.trim()}</option>)}
        </select>
      </div>

      <div className="flex gap-1 flex-wrap mb-3" role="tablist" aria-label="Filtro">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
            className={`sh-btn ${filter === f.id ? 'sh-btn-primary' : 'sh-btn-secondary'}`}
            style={{ minHeight: 36, padding: '0 0.7rem', fontSize: '0.8rem' }} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {notice && <p className="text-sm font-bold mb-3" style={{ color: 'var(--sh-primary)' }}>{notice}</p>}
      {error && <p className="inv-error mb-3" role="alert">{error}</p>}
      {fetching && rows.length === 0 && <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>}
      {!fetching && !error && groups.length === 0 && (
        <div className="sh-card">
          <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
            {filter === 'decidir' ? 'Nenhum item esperando a sua autorização.'
              : filter === 'andamento' ? 'Nenhum item autorizado ou em uso.'
              : filter === 'meus' ? 'Você ainda não fez nenhum pedido.'
              : 'Nenhum pedido nesta missão. Use "Pedir itens".'}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {groups.map((g) => {
          const h = g[0];
          const pend = g.filter((x) => x.status === 'pendente' && x.can_decide);
          return (
            <li key={h.request_id} className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <span className="inv-soft flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, color: 'var(--sh-primary)' }}>
                  <Inbox size={18} />
                </span>
                <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
                  <span className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>
                    {h.event_name ? `Evento: ${h.event_name}` : `Setor: ${h.dest_sector_name}`}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
                    Pedido de {h.requester_name} · {fmtDate(h.created_at)}{h.event_name ? ` · ${h.dest_sector_name}` : ''}
                  </span>
                  {h.request_notes && <span className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>{h.request_notes}</span>}
                </div>
                {pend.length > 1 && (
                  <button type="button" className="sh-btn sh-btn-secondary" style={{ minHeight: 36, fontSize: '0.8rem' }} disabled={busy} onClick={() => approve(pend)}>
                    Autorizar todos ({pend.length})
                  </button>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {g.map((r) => (
                  <li key={r.loan_item_id}>
                    <LoanItemCard
                      row={r} showDest={false} busy={busy}
                      onApprove={(x) => approve([x])}
                      onRefuse={(x) => { setRefuseNote(''); setRefuse([x]); }}
                      onOut={(x) => setUse({ row: x, mode: 'saida' })}
                      onBack={(x) => setUse({ row: x, mode: 'retorno' })}
                      onCancel={cancel}
                      onOpenItem={r.can_decide ? (x) => setItemId(x.item_id) : undefined}
                    />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <LoanRequestForm
        open={asking}
        onClose={() => setAsking(false)}
        onDone={(msg) => { setAsking(false); changed(msg); }}
      />

      <LoanUseForm
        row={use?.row ?? null}
        mode={use?.mode ?? 'saida'}
        onClose={() => setUse(null)}
        onDone={(msg) => { setUse(null); changed(msg); }}
      />

      <Modal
        open={!!refuse}
        onClose={() => setRefuse(null)}
        title={refuse?.[0]?.status === 'autorizado' ? 'Revogar autorização' : 'Recusar pedido'}
        footer={<ModalActions onCancel={() => setRefuse(null)} onConfirm={confirmRefuse} confirmLabel="Confirmar" danger loading={busy} />}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold" style={{ overflowWrap: 'anywhere' }}>{refuse?.[0]?.item_name}</p>
          <div className="inv-field">
            <label className="inv-label" htmlFor="rf-note">Motivo (opcional)</label>
            <textarea id="rf-note" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 72 }} value={refuseNote} onChange={(e) => setRefuseNote(e.target.value)} />
          </div>
        </div>
      </Modal>

      {itemId && <ItemDetail key={itemId} itemId={itemId} onClose={() => setItemId(null)} onChanged={reload} />}
    </div>
  );
}
