import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal, ModalActions } from '../kit';
import { LABEL_SIZES, printLabels, type LabelItem, type LabelSize } from '../lib/labels';

const FORM_ID = 'labels-batch-form';
const MAX = 300;

/** Etiquetas de QR em lote: marque os itens, escolha o tamanho e imprima (ou salve em PDF). */
export function LabelsBatch({
  open, onClose, items,
}: { open: boolean; onClose: () => void; items: LabelItem[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [size, setSize] = useState<LabelSize>('media');
  const [showSector, setShowSector] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked(new Set(items.slice(0, MAX).map((i) => i.id)));
    setError('');
  }, [open, items]);

  const count = picked.size;
  const pages = useMemo(() => {
    const s = LABEL_SIZES[size];
    return Math.ceil(count / (s.cols * s.rows));
  }, [count, size]);

  function toggle(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (count === 0) { setError('Marque pelo menos um item.'); return; }
    if (count > MAX) { setError(`Escolha no máximo ${MAX} itens por vez.`); return; }
    setBusy(true); setError('');
    const err = await printLabels(items.filter((i) => picked.has(i.id)), size, showSector);
    setBusy(false);
    if (err) setError(err); else onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Etiquetas em lote"
      size="lg"
      footer={<ModalActions onCancel={onClose} formId={FORM_ID} confirmLabel={count ? `Imprimir (${count})` : 'Imprimir'} loading={busy} disabled={count === 0} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        <div className="inv-field">
          <label className="inv-label" htmlFor="lb-size">Tamanho da etiqueta (folha A4)</label>
          <select id="lb-size" className="inv-input" value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
            {(Object.keys(LABEL_SIZES) as LabelSize[]).map((k) => <option key={k} value={k}>{LABEL_SIZES[k].label}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSector} onChange={(e) => setShowSector(e.target.checked)} style={{ width: 20, height: 20 }} />
          Mostrar o setor na etiqueta
        </label>

        <div className="inv-field">
          <div className="flex items-center justify-between gap-2">
            <span className="inv-label">Itens ({count} de {items.length})</span>
            <span className="flex gap-2">
              <button type="button" className="sh-btn sh-btn-secondary" style={{ minHeight: 32, padding: '0 0.6rem', fontSize: '0.8rem' }} onClick={() => setPicked(new Set(items.slice(0, MAX).map((i) => i.id)))}>Todos</button>
              <button type="button" className="sh-btn sh-btn-secondary" style={{ minHeight: 32, padding: '0 0.6rem', fontSize: '0.8rem' }} onClick={() => setPicked(new Set())}>Nenhum</button>
            </span>
          </div>
          {items.length > MAX && <p className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>Há mais de {MAX} itens neste filtro. Use a busca ou o setor para reduzir.</p>}
          <ul className="flex flex-col gap-1" style={{ maxHeight: 300, overflowY: 'auto' }}>
            {items.map((i) => {
              const on = picked.has(i.id);
              return (
                <li key={i.id}>
                  <label className="sh-card flex items-center gap-3" style={{ padding: '0.4rem 0.6rem', minHeight: 44, borderColor: on ? 'var(--sh-primary)' : undefined, borderWidth: on ? 2 : undefined }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(i.id)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                    <span className="flex flex-col min-w-0">
                      <span className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>{i.name}</span>
                      {i.sector && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{i.sector}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {count > 0 && <p className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{pages} {pages === 1 ? 'folha' : 'folhas'} A4. Na janela de impressão, escolha tamanho real (100%) e, se quiser, «Salvar como PDF».</p>}
        {error && <p className="inv-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
