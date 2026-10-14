import { ImageOff } from 'lucide-react';
import { photoUrl } from '../lib/items';
import { LOAN_COLOR, LOAN_LABEL, type LoanRow } from '../lib/loans';
import { fmtDate, todayLocal } from '../lib/movements';
import { useSession } from '../store';

/** Um item de um pedido entre setores, com as ações que a pessoa pode fazer. */
export function LoanItemCard({
  row, showDest = true, busy = false, onApprove, onRefuse, onOut, onBack, onCancel, onOpenItem,
}: {
  row: LoanRow;
  showDest?: boolean;
  busy?: boolean;
  onApprove?: (r: LoanRow) => void;
  onRefuse?: (r: LoanRow) => void;
  onOut?: (r: LoanRow) => void;
  onBack?: (r: LoanRow) => void;
  onCancel?: (r: LoanRow) => void;
  onOpenItem?: (r: LoanRow) => void;
}) {
  const me = useSession((s) => s.user?.id);
  const img = photoUrl(row.photo_path, row.item_updated_at);
  const today = todayLocal();
  const late = row.status === 'em_uso' && !!row.out_expected && row.out_expected < today;
  const color = late ? '#b91c1c' : LOAN_COLOR[row.status];
  const label = late ? 'Em uso · atrasado' : LOAN_LABEL[row.status];

  const canApprove = !!onApprove && row.can_decide && row.status === 'pendente';
  const canRefuse = !!onRefuse && row.can_decide && (row.status === 'pendente' || row.status === 'autorizado');
  const canCancel = !!onCancel && row.requested_by === me && (row.status === 'pendente' || row.status === 'autorizado');
  const canOut = !!onOut && row.can_out;
  const canBack = !!onBack && row.can_back;
  const hasActions = canApprove || canRefuse || canCancel || canOut || canBack;

  const Photo = (
    <span className="inv-soft flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}>
      {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={18} />}
    </span>
  );

  return (
    <div className="sh-card flex flex-col gap-2" style={{ padding: '0.6rem 0.75rem' }}>
      <div className="flex items-start gap-3">
        {Photo}
        <div className="flex flex-col min-w-0" style={{ flex: 1, gap: 2 }}>
          <span className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>
            {onOpenItem ? (
              <button type="button" className="text-left font-bold" onClick={() => onOpenItem(row)}>{row.item_name}</button>
            ) : row.item_name}
          </span>
          <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
            De {row.owner_sector_name}
            {showDest ? ` para ${row.event_name ? `o evento «${row.event_name}»` : row.dest_sector_name}` : ''}
          </span>
          <span className="text-xs font-bold" style={{ color }}>{label}</span>
          {row.status === 'em_uso' && (
            <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
              {row.out_responsible ? `Com ${row.out_responsible}` : 'Fora do acervo'}
              {row.out_expected ? ` · volta ${fmtDate(row.out_expected)}` : ''}
            </span>
          )}
          {row.status === 'concluido' && row.returned_at && (
            <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Voltou em {fmtDate(row.returned_at)}</span>
          )}
          {(row.status === 'pendente' || row.status === 'autorizado') && (row.needed_from || row.needed_until) && (
            <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
              Preciso {row.needed_from ? `de ${fmtDate(row.needed_from)}` : ''}{row.needed_until ? ` até ${fmtDate(row.needed_until)}` : ''}
            </span>
          )}
          {row.decision_note && (
            <span className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>Resposta: {row.decision_note}</span>
          )}
        </div>
      </div>

      {hasActions && (
        <div className="flex gap-2 flex-wrap">
          {canApprove && <button type="button" className="sh-btn sh-btn-primary" style={{ minHeight: 36 }} disabled={busy} onClick={() => onApprove!(row)}>Autorizar</button>}
          {canRefuse && <button type="button" className="sh-btn sh-btn-secondary" style={{ minHeight: 36 }} disabled={busy} onClick={() => onRefuse!(row)}>{row.status === 'autorizado' ? 'Revogar' : 'Recusar'}</button>}
          {canOut && <button type="button" className="sh-btn sh-btn-primary" style={{ minHeight: 36 }} disabled={busy} onClick={() => onOut!(row)}>Registrar saída</button>}
          {canBack && <button type="button" className="sh-btn sh-btn-primary" style={{ minHeight: 36 }} disabled={busy} onClick={() => onBack!(row)}>Registrar retorno</button>}
          {canCancel && <button type="button" className="sh-btn sh-btn-secondary" style={{ minHeight: 36 }} disabled={busy} onClick={() => onCancel!(row)}>Cancelar pedido</button>}
        </div>
      )}
    </div>
  );
}
