import QRCode from 'qrcode';
import { itemLink } from './items';

export type LabelSize = 'pequena' | 'media' | 'grande';

/** Etiquetas em folha A4 (medidas em mm). */
export const LABEL_SIZES: Record<LabelSize, { label: string; cols: number; rows: number; w: number; h: number; qr: number; font: number }> = {
  pequena: { label: 'Pequena (24 por folha)', cols: 3, rows: 8, w: 63, h: 33, qr: 26, font: 2.9 },
  media: { label: 'Média (10 por folha)', cols: 2, rows: 5, w: 95, h: 54, qr: 42, font: 4.2 },
  grande: { label: 'Grande (6 por folha)', cols: 2, rows: 3, w: 95, h: 90, qr: 68, font: 5.2 },
};

export interface LabelItem { id: string; name: string; sector: string }

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Monta a página de impressão (QR + nome + setor) e abre o diálogo de impressão. */
export async function printLabels(items: LabelItem[], size: LabelSize, showSector: boolean): Promise<string | null> {
  const w = window.open('', '_blank');
  if (!w) return 'O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.';
  w.document.write('<!doctype html><meta charset="utf-8"><title>Etiquetas</title><p style="font-family:sans-serif">Gerando etiquetas…</p>');
  try {
    const spec = LABEL_SIZES[size];
    const qrs = await Promise.all(items.map((i) => QRCode.toDataURL(itemLink(i.id), { width: 360, margin: 1, errorCorrectionLevel: 'M' })));
    const perPage = spec.cols * spec.rows;
    const pages: string[] = [];
    for (let p = 0; p < items.length; p += perPage) {
      const cells = items.slice(p, p + perPage).map((it, k) => {
        const sec = showSector && it.sector ? `<span class="s">${esc(it.sector)}</span>` : '';
        return `<div class="l"><img src="${qrs[p + k]}" alt=""><div class="t"><b>${esc(it.name)}</b>${sec}<span class="s">Inventário Sh</span></div></div>`;
      });
      pages.push(`<section class="pg">${cells.join('')}</section>`);
    }
    const css =
      `@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:#000}` +
      `.pg{width:210mm;height:297mm;padding:${(297 - spec.rows * spec.h) / 2}mm ${(210 - spec.cols * spec.w) / 2}mm;display:grid;` +
      `grid-template-columns:repeat(${spec.cols},${spec.w}mm);grid-auto-rows:${spec.h}mm;page-break-after:always;break-after:page}` +
      `.l{display:flex;align-items:center;gap:2mm;padding:2mm;border:.2mm dashed #999;overflow:hidden;${size === 'grande' ? 'flex-direction:column;justify-content:center;text-align:center;' : ''}}` +
      `.l img{width:${spec.qr}mm;height:${spec.qr}mm;flex-shrink:0}` +
      `.t{display:flex;flex-direction:column;gap:.8mm;min-width:0;font-size:${spec.font}mm;line-height:1.15}` +
      `.t b{overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow-wrap:anywhere}` +
      `.s{font-size:${spec.font * 0.78}mm;color:#444}`;
    w.document.open();
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Etiquetas Inventário Sh</title><style>${css}</style>${pages.join('')}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>`);
    w.document.close();
    return null;
  } catch {
    w.close();
    return 'Não consegui gerar as etiquetas.';
  }
}
