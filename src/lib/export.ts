import { supabase } from './supabase';
import { CONDITION_LABEL, fmtDate } from './movements';
import { STATUS_LABEL, locationPath, type Loc, type Status } from './items';

export type ExportKind = 'itens' | 'movimentos' | 'reparos';

type Cell = string | number | null | undefined;

/** CSV para o Excel brasileiro: separador ";", vírgula decimal, UTF-8 com BOM. */
function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell): string => {
    if (v == null) return '';
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita fórmula vinda de texto digitado
    s = s.replace(/\r?\n/g, ' ');
    return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

export function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Lê todas as páginas (o banco devolve no máximo 1000 linhas por vez). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const r = await page(from, from + 999);
    if (r.error) throw new Error(r.error.message);
    const d = (r.data ?? []) as T[];
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}

export interface ExportScope { missionId: string; sectorId: string; sectorNames: Map<string, string> }

export async function buildExport(kind: ExportKind, sc: ExportScope): Promise<{ csv: string; count: number }> {
  if (!supabase) throw new Error('Banco não configurado.');
  const db = supabase;
  const sec = (id: string) => sc.sectorNames.get(id) ?? '';

  if (kind === 'itens') {
    const items = await fetchAll<Record<string, any>>((a, b) => {
      let q = db.from('inv_items').select('id,sector_id,name,description,category,location_id,location_note,value,value_kind,acquired_at,notes,baixa_at,baixa_reason').eq('mission_id', sc.missionId);
      if (sc.sectorId) q = q.eq('sector_id', sc.sectorId);
      return q.order('name').range(a, b);
    });
    const st = await fetchAll<Record<string, any>>((a, b) => {
      let q = db.from('inv_item_status').select('item_id,status,overdue,expected_return,responsible_name').eq('mission_id', sc.missionId);
      if (sc.sectorId) q = q.eq('sector_id', sc.sectorId);
      return q.range(a, b);
    });
    const locs = await fetchAll<Loc>((a, b) => {
      let q = db.from('inv_locations').select('id,sector_id,parent_id,name,sort_order');
      q = sc.sectorId ? q.eq('sector_id', sc.sectorId) : q;
      return q.range(a, b);
    });
    const stMap = new Map(st.map((s) => [s.item_id, s]));
    const rows = items
      .sort((x, y) => sec(x.sector_id).localeCompare(sec(y.sector_id), 'pt-BR') || String(x.name).localeCompare(String(y.name), 'pt-BR'))
      .map((i) => {
        const s = stMap.get(i.id);
        const status = (s?.status ?? (i.baixa_at ? 'baixado' : 'no_acervo')) as Status;
        return [
          sec(i.sector_id), i.name, i.category, i.description, STATUS_LABEL[status] + (s?.overdue ? ' (atrasado)' : ''),
          locationPath(locs, i.location_id), i.location_note,
          i.value != null ? Number(i.value) : null, i.value == null ? '' : i.value_kind === 'estimado' ? 'Estimado (doado)' : 'Pago na compra',
          fmtDate(i.acquired_at), s?.responsible_name, fmtDate(s?.expected_return), i.notes, fmtDate(i.baixa_at), i.baixa_reason,
        ];
      });
    return {
      count: rows.length,
      csv: toCsv(['Setor', 'Item', 'Categoria', 'Descrição', 'Situação', 'Local', 'Detalhe do local', 'Valor (R$)', 'Tipo do valor', 'Adquirido em', 'Com (responsável atual)', 'Volta prevista', 'Observações', 'Baixado em', 'Motivo da baixa'], rows),
    };
  }

  if (kind === 'movimentos') {
    const mv = await fetchAll<Record<string, any>>((a, b) => {
      let q = db.from('inv_movements')
        .select('occurred_at,created_at,kind,sector_id,entry_source,value,value_kind,saida_reason,event_id,expected_return,needs_repair,condition,notes,responsible_name,inv_items(name)')
        .eq('mission_id', sc.missionId);
      if (sc.sectorId) q = q.eq('sector_id', sc.sectorId);
      return q.order('occurred_at', { ascending: false }).order('created_at', { ascending: false }).range(a, b);
    });
    const ev = await fetchAll<{ id: string; name: string }>((a, b) => db.from('inv_events').select('id,name').eq('mission_id', sc.missionId).range(a, b));
    const evName = new Map(ev.map((e) => [e.id, e.name]));
    const kindLabel: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', retorno: 'Retorno' };
    const rows = mv.map((m) => [
      fmtDate(m.occurred_at), kindLabel[m.kind] ?? m.kind, m.inv_items?.name, sec(m.sector_id), m.responsible_name,
      m.kind === 'entrada' ? (m.entry_source === 'doacao' ? 'Doação' : 'Compra') : m.kind === 'saida' ? (m.saida_reason === 'evento' ? 'Evento' : 'Empréstimo') : '',
      m.event_id ? evName.get(m.event_id) : '', fmtDate(m.expected_return), m.condition ? CONDITION_LABEL[m.condition] : '',
      m.value != null ? Number(m.value) : null, m.needs_repair ? 'Sim' : '', m.notes,
    ]);
    return {
      count: rows.length,
      csv: toCsv(['Data', 'Tipo', 'Item', 'Setor', 'Responsável', 'Motivo', 'Evento', 'Volta prevista', 'Condição', 'Valor (R$)', 'Precisa de reparo', 'Observação'], rows),
    };
  }

  const rp = await fetchAll<Record<string, any>>((a, b) => {
    let q = db.from('inv_repairs').select('sector_id,opened_at,description,cost,closed_at,notes,inv_items(name)').eq('mission_id', sc.missionId);
    if (sc.sectorId) q = q.eq('sector_id', sc.sectorId);
    return q.order('opened_at', { ascending: false }).range(a, b);
  });
  const rows = rp.map((r) => [
    sec(r.sector_id), r.inv_items?.name, fmtDate(r.opened_at), r.description, r.closed_at ? 'Concluído' : 'Em aberto',
    fmtDate(r.closed_at), r.cost != null ? Number(r.cost) : null, r.notes,
  ]);
  return { count: rows.length, csv: toCsv(['Setor', 'Item', 'Aberto em', 'Descrição', 'Situação', 'Concluído em', 'Custo (R$)', 'Observações'], rows) };
}

export function exportFileName(kind: ExportKind, missionName: string, sectorName: string): string {
  const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return `inventario-${kind}-${[slug(missionName), slug(sectorName)].filter(Boolean).join('-')}-${d}.csv`;
}
