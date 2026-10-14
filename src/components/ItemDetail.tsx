import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, Download, ImageOff, Pencil, Printer, Trash2, Undo2 } from 'lucide-react';
import { Modal } from '../kit';
import { supabase } from '../lib/supabase';
import {
  ITEM_COLUMNS, STATUS_COLOR, STATUS_LABEL, itemLink, locationPath, photoUrl,
  type Item, type ItemStatusRow, type Loc,
} from '../lib/items';
import { formatCurrency } from '../lib/utils';
import { CONDITION_LABEL, MOVEMENT_COLUMNS, loadMovementContacts, type Movement, type MoveKind } from '../lib/movements';
import { useScope } from '../scopeStore';
import { ItemForm } from './ItemForm';
import { MovementForm } from './MovementForm';

function fmtDate(d: string | null) {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function StatusChip({ status, overdue }: { status: ItemStatusRow['status']; overdue?: boolean }) {
  const color = overdue ? '#b91c1c' : STATUS_COLOR[status];
  return (
    <span
      className="text-xs font-bold"
      style={{
        color, padding: '0.15rem 0.55rem', borderRadius: 999, whiteSpace: 'nowrap',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {overdue ? 'Atrasado' : STATUS_LABEL[status]}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <span className="inv-label">{label}</span>
      <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{children}</span>
    </div>
  );
}

function QRBlock({ item, sectorName }: { item: Item; sectorName: string }) {
  const [dataUrl, setDataUrl] = useState('');
  const link = itemLink(item.id);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, { width: 520, margin: 2, errorCorrectionLevel: 'M' })
      .then((u) => { if (alive) setDataUrl(u); })
      .catch(() => { if (alive) setDataUrl(''); });
    return () => { alive = false; };
  }, [link]);

  function print() {
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) { window.alert('O navegador bloqueou a janela de impressão. Use "Baixar PNG".'); return; }
    w.document.write(
      `<!doctype html><meta charset="utf-8"><title>Etiqueta</title>` +
      `<style>body{font-family:system-ui,sans-serif;text-align:center;margin:24px}img{width:260px;height:260px}h1{font-size:16px;margin:8px 0 2px}p{font-size:12px;color:#555;margin:0}</style>` +
      `<img src="${dataUrl}" alt=""><h1>${esc(item.name)}</h1><p>${esc(sectorName)} · Inventário Sh</p>` +
      `<script>window.onload=function(){window.print()}<\/script>`,
    );
    w.document.close();
  }

  if (!dataUrl) return null;
  return (
    <div className="sh-card flex items-center gap-3" style={{ padding: '0.75rem' }}>
      <img src={dataUrl} alt="QR code do item" style={{ width: 112, height: 112, borderRadius: 8, background: '#fff', flexShrink: 0 }} />
      <div className="flex flex-col gap-2 min-w-0">
        <span className="inv-label">QR code</span>
        <div className="flex gap-2 flex-wrap">
          <a className="sh-btn sh-btn-secondary" href={dataUrl} download={`qr-${item.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'item'}.png`}>
            <Download size={16} /> Baixar PNG
          </a>
          <button type="button" className="sh-btn sh-btn-secondary" onClick={print}>
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

export function ItemDetail({
  itemId, onClose, onChanged, categories = [],
}: { itemId: string; onClose: () => void; onChanged?: () => void; categories?: string[] }) {
  const { sectors, canEditSector } = useScope();
  const [item, setItem] = useState<Item | null>(null);
  const [status, setStatus] = useState<ItemStatusRow | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [baixaOpen, setBaixaOpen] = useState(false);
  const [baixaReason, setBaixaReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Movement[]>([]);
  const [phones, setPhones] = useState<Map<string, { phone: string | null; photo_url: string | null }>>(new Map());
  const [moveKind, setMoveKind] = useState<MoveKind | null>(null);
  const [doneNotice, setDoneNotice] = useState('');
  const confirmRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase.from('inv_items').select(ITEM_COLUMNS).eq('id', itemId).maybeSingle();
    if (err || !data) {
      setItem(null);
      setError(err ? err.message : '');
      setLoading(false);
      return;
    }
    const it = data as Item;
    const [st, lc, mv] = await Promise.all([
      supabase.from('inv_item_status').select('item_id,status,overdue,expected_return,responsible_name,open_saida_id').eq('item_id', itemId).maybeSingle(),
      supabase.from('inv_locations').select('id,sector_id,parent_id,name,sort_order').eq('sector_id', it.sector_id),
      supabase.from('inv_movements').select(MOVEMENT_COLUMNS).eq('item_id', itemId).order('occurred_at', { ascending: false }).limit(30),
    ]);
    const hist = (mv.data ?? []) as Movement[];
    setHistory(hist);
    setPhones(canEditSector(it.sector_id) ? await loadMovementContacts(hist.map((h) => h.id)) : new Map());
    setItem(it);
    setStatus((st.data as ItemStatusRow | null) ?? null);
    setLocs((lc.data ?? []) as Loc[]);
    setError('');
    setLoading(false);
  }, [itemId, canEditSector]);

  useEffect(() => { load(); }, [load]);

  const sectorRow = item ? sectors.find((s) => s.id === item.sector_id) : undefined;
  const sectorName = sectorRow?.name ?? '';
  const sectorLabel = !item ? '' : !sectorRow ? 'Setor não encontrado' : sectorRow.active ? sectorRow.name : `${sectorRow.name} (inativo)`;
  const canEdit = item ? canEditSector(item.sector_id) : false;

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) { setError(err.message); return false; }
    return true;
  }

  async function baixar() {
    if (!supabase || !item) return;
    const ok = await run(() => supabase!.from('inv_items').update({ baixa_at: new Date().toISOString(), baixa_reason: baixaReason.trim() || null }).eq('id', item.id));
    if (ok) { setBaixaOpen(false); setBaixaReason(''); await load(); onChanged?.(); }
  }

  async function reativar() {
    if (!supabase || !item) return;
    const ok = await run(() => supabase!.from('inv_items').update({ baixa_at: null, baixa_reason: null }).eq('id', item.id));
    if (ok) { await load(); onChanged?.(); }
  }

  // a confirmação e as mensagens ficam abaixo dos botões: rolar até elas para o toque nunca "parecer sem efeito"
  useEffect(() => {
    if (confirmDelete) confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [confirmDelete]);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  async function excluir() {
    if (!supabase || !item || busy) return;
    setBusy(true);
    setError('');
    // .select('id') devolve as linhas apagadas: sem isso, uma política de segurança que bloqueia não dá erro e parece que "não fez nada"
    const { data, error: err } = await supabase.from('inv_items').delete().eq('id', item.id).select('id');
    setBusy(false);
    if (err) {
      setConfirmDelete(false);
      setError(/foreign key|violates/i.test(err.message)
        ? 'Este item já tem histórico de movimentos ou reparos e não pode ser excluído. Use "Dar baixa".'
        : `Não foi possível excluir: ${err.message}`);
      return;
    }
    if (!data || data.length === 0) {
      setConfirmDelete(false);
      setError('Não foi possível excluir: o banco não permitiu apagar este item (sem permissão ou ele já foi excluído). Use "Dar baixa" ou fale com o administrador.');
      return;
    }
    if (item.photo_path) await supabase.storage.from('inv-fotos').remove([item.photo_path]).catch(() => null);
    onChanged?.();
    onClose();
  }

  const img = item ? photoUrl(item.photo_path, item.updated_at) : null;
  const where = item ? [locationPath(locs, item.location_id), item.location_note].filter(Boolean).join(' — ') : '';

  return (
    <>
      <Modal open={!editing} onClose={onClose} title={item?.name ?? 'Item'} size="lg">
        {loading ? (
          <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>
        ) : !item ? (
          <p className="inv-error">{error || 'Item não encontrado, ou você não tem acesso ao setor dele.'}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="inv-soft flex items-center justify-center" style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: '4 / 3', maxHeight: 320, color: 'var(--sh-text-muted)' }}>
              {img ? <img src={img} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImageOff size={40} />}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {status && <StatusChip status={status.status} overdue={status.overdue} />}
              {status?.status === 'emprestado' || status?.status === 'fora_evento'
                ? <span className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
                    {status.responsible_name ? `com ${status.responsible_name}` : ''}
                    {status.expected_return ? ` · volta ${fmtDate(status.expected_return)}` : ''}
                  </span>
                : null}
            </div>

            {item.baixa_at && (
              <p className="inv-error">
                Item baixado em {fmtDate(item.baixa_at)}{item.baixa_reason ? `: ${item.baixa_reason}` : '.'}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <Row label="Setor">{sectorLabel}</Row>
              <Row label="Categoria">{item.category}</Row>
              <Row label="Onde fica guardado">{where}</Row>
              <Row label={item.value_kind === 'estimado' ? 'Valor estimado' : 'Valor pago'}>{item.value != null ? formatCurrency(Number(item.value)) : ''}</Row>
              <Row label="Adquirido em">{fmtDate(item.acquired_at)}</Row>
              <Row label="Descrição">{item.description}</Row>
              <Row label="Observações">{item.notes}</Row>
            </div>

            {!item.baixa_at && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 flex-wrap">
                  {status?.open_saida_id ? (
                    <button type="button" className="sh-btn sh-btn-primary" onClick={() => setMoveKind('retorno')} disabled={busy}>
                      <Undo2 size={16} /> Registrar retorno
                    </button>
                  ) : status?.status === 'em_reparo' ? null : (
                    <button type="button" className="sh-btn sh-btn-primary" onClick={() => setMoveKind('saida')} disabled={busy}>
                      <ArrowUpFromLine size={16} /> Registrar saída
                    </button>
                  )}
                  {canEdit && !history.some((h) => h.kind === 'entrada') && (
                    <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setMoveKind('entrada')} disabled={busy}>
                      <ArrowDownToLine size={16} /> Registrar entrada
                    </button>
                  )}
                </div>
                {status?.status === 'em_reparo' && !status.open_saida_id && (
                  <p className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Item em reparo: nova saída só depois de concluir o reparo.</p>
                )}
              </div>
            )}

            {doneNotice && <p className="text-sm font-bold" style={{ color: 'var(--sh-primary)' }}>{doneNotice}</p>}

            {history.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="inv-label">Histórico</span>
                <ul className="flex flex-col gap-2">
                  {history.map((h) => {
                    const ph = phones.get(h.id)?.phone;
                    return (
                      <li key={h.id} className="sh-card text-sm flex flex-col" style={{ padding: '0.6rem 0.75rem', gap: 2 }}>
                        <span className="font-bold">
                          {h.kind === 'entrada' ? 'Entrada' : h.kind === 'saida' ? 'Saída' : 'Retorno'}
                          {h.kind === 'saida' ? ` · ${h.saida_reason === 'evento' ? 'evento' : 'empréstimo'}` : ''}
                          {h.kind === 'entrada' && h.entry_source ? ` · ${h.entry_source === 'compra' ? 'compra' : 'doação'}` : ''}
                          {' · '}{fmtDate(h.occurred_at)}
                        </span>
                        <span style={{ overflowWrap: 'anywhere' }}>{h.responsible_name}{ph ? ` · ${ph}` : ''}</span>
                        {h.kind === 'saida' && h.expected_return && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Volta prevista {fmtDate(h.expected_return)}</span>}
                        {h.kind === 'entrada' && h.value != null && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{h.value_kind === 'estimado' ? 'Valor estimado' : 'Valor pago'}: {formatCurrency(Number(h.value))}</span>}
                        {h.condition && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Condição: {CONDITION_LABEL[h.condition]}{h.needs_repair ? ' · precisa de reparo' : ''}</span>}
                        {h.notes && <span className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>{h.notes}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <QRBlock item={item} sectorName={sectorName} />

            {error && <p ref={errorRef} className="inv-error" role="alert">{error}</p>}

            {canEdit && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="sh-btn sh-btn-primary" onClick={() => setEditing(true)} disabled={busy}>
                    <Pencil size={16} /> Editar
                  </button>
                  {item.baixa_at ? (
                    <button type="button" className="sh-btn sh-btn-secondary" onClick={reativar} disabled={busy}>
                      <ArchiveRestore size={16} /> Reativar
                    </button>
                  ) : (
                    <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setBaixaOpen((v) => !v)} disabled={busy}>
                      <Archive size={16} /> Dar baixa
                    </button>
                  )}
                  <button type="button" className="sh-btn sh-btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    <Trash2 size={16} /> Excluir
                  </button>
                </div>

                {baixaOpen && (
                  <div className="sh-card flex flex-col gap-2" style={{ padding: '0.75rem' }}>
                    <label className="inv-label" htmlFor="baixa-reason">Motivo da baixa (opcional)</label>
                    <input id="baixa-reason" className="inv-input" value={baixaReason} onChange={(e) => setBaixaReason(e.target.value)} placeholder="Ex.: quebrou, perdido, doado" />
                    <div className="flex gap-2 justify-end">
                      <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setBaixaOpen(false)}>Cancelar</button>
                      <button type="button" className="sh-btn sh-btn-primary" onClick={baixar} disabled={busy}>Confirmar baixa</button>
                    </div>
                  </div>
                )}

                {confirmDelete && (
                  <div ref={confirmRef} className="sh-card flex flex-col gap-2" style={{ padding: '0.75rem' }}>
                    <p className="text-sm font-bold">Excluir «{item.name}» de vez? Isso não pode ser desfeito.</p>
                    <div className="flex gap-2 justify-end">
                      <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                      <button type="button" className="sh-btn sh-btn-danger" onClick={excluir} disabled={busy}>{busy ? 'Excluindo…' : 'Excluir'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {item && moveKind && (
        <MovementForm
          open
          kind={moveKind}
          itemId={item.id}
          saidaId={status?.open_saida_id ?? null}
          onClose={() => setMoveKind(null)}
          onDone={async (warning) => {
            const k = moveKind;
            setMoveKind(null);
            setDoneNotice(warning ?? (k === 'entrada' ? 'Entrada registrada.' : k === 'saida' ? 'Saída registrada.' : 'Retorno registrado.'));
            await load();
            onChanged?.();
          }}
        />
      )}

      {item && (
        <ItemForm
          open={editing}
          item={item}
          categories={categories}
          onClose={() => setEditing(false)}
          onSaved={async (_id, warning) => {
            setEditing(false);
            await load();
            if (warning) setError(warning);
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
