import { supabase } from './supabase';
import { dateToInstant, type Condition, type Responsible } from './movements';

export type LoanStatus = 'pendente' | 'autorizado' | 'recusado' | 'cancelado' | 'em_uso' | 'concluido';

export const LOAN_LABEL: Record<LoanStatus, string> = {
  pendente: 'Aguardando autorização',
  autorizado: 'Autorizado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  em_uso: 'Em uso',
  concluido: 'Devolvido',
};

// Cores com contraste nos dois temas (mesma ideia dos status dos itens).
export const LOAN_COLOR: Record<LoanStatus, string> = {
  pendente: '#b45309',
  autorizado: '#15803d',
  recusado: '#b91c1c',
  cancelado: '#6b7280',
  em_uso: '#1d4ed8',
  concluido: '#15803d',
};

export interface LoanRow {
  loan_item_id: string;
  request_id: string;
  item_id: string;
  item_name: string;
  photo_path: string | null;
  item_updated_at: string;
  owner_sector_id: string;
  owner_sector_name: string;
  dest_sector_id: string;
  dest_sector_name: string;
  event_id: string | null;
  event_name: string | null;
  needed_from: string | null;
  needed_until: string | null;
  request_notes: string | null;
  status: LoanStatus;
  decision_note: string | null;
  decided_at: string | null;
  requested_by: string | null;
  requester_name: string;
  created_at: string;
  can_decide: boolean;
  can_out: boolean;
  can_back: boolean;
  saida_id: string | null;
  out_responsible: string | null;
  out_at: string | null;
  out_expected: string | null;
  returned_at: string | null;
}

export interface CatalogItem {
  item_id: string;
  item_name: string;
  category: string | null;
  photo_path: string | null;
  item_updated_at: string;
  owner_sector_id: string;
  owner_sector_name: string;
  available: boolean;
}

type Res<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<Res<T>> {
  if (!supabase) return { ok: false, error: 'Banco não configurado.' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: data as T };
}

function friendly(msg: string): string {
  if (/function .* does not exist|Could not find the function/i.test(msg)) {
    return 'O banco ainda não recebeu o SQL da T6c (pedidos entre setores).';
  }
  if (/já está fora/i.test(msg)) return 'Este item já está fora do acervo (há uma saída em aberto).';
  if (/em reparo|está em reparo/i.test(msg)) return 'Este item está em reparo. Conclua o reparo antes da saída.';
  if (/baixado/i.test(msg)) return 'Este item foi baixado e não aceita movimentações.';
  return msg;
}

export async function loadCatalog(destSector: string): Promise<Res<CatalogItem[]>> {
  const r = await call<CatalogItem[]>('inv_loan_catalog', { p_dest_sector: destSector });
  return r.ok ? { ok: true, data: r.data ?? [] } : r;
}

export async function listLoans(missionId: string, eventId?: string | null): Promise<Res<LoanRow[]>> {
  const r = await call<LoanRow[]>('inv_loan_list', { p_mission: missionId, p_event: eventId ?? null });
  return r.ok ? { ok: true, data: r.data ?? [] } : r;
}

export async function pendingCount(): Promise<number> {
  const r = await call<number>('inv_loan_pending_count', {});
  return r.ok ? Number(r.data) || 0 : 0;
}

export function createLoan(p: {
  destSector: string; eventId: string | null; from: string; until: string; notes: string; items: string[];
}): Promise<Res<string>> {
  return call<string>('inv_loan_create', {
    p_dest_sector: p.destSector,
    p_event: p.eventId,
    p_from: p.from || null,
    p_until: p.until || null,
    p_notes: p.notes.trim() || null,
    p_items: p.items,
  });
}

export function decideLoans(ids: string[], approve: boolean, note: string): Promise<Res<number>> {
  return call<number>('inv_loan_decide', { p_ids: ids, p_approve: approve, p_note: note.trim() || null });
}

export function cancelLoans(ids: string[]): Promise<Res<number>> {
  return call<number>('inv_loan_cancel', { p_ids: ids });
}

export function loanSaida(p: {
  loanItemId: string; date: string; expected: string; responsible: Responsible; condition: Condition | ''; notes: string;
}): Promise<Res<string>> {
  const r = p.responsible;
  return call<string>('inv_loan_saida', {
    p_loan_item: p.loanItemId,
    p_occurred: dateToInstant(p.date),
    p_expected: p.expected || null,
    p_resp_type: r.type,
    p_resp_id: r.type === 'avulso' ? null : r.id ?? null,
    p_resp_name: r.name.trim(),
    p_resp_phone: r.type === 'avulso' ? r.phone?.trim() || null : null,
    p_condition: p.condition || null,
    p_notes: p.notes.trim() || null,
  });
}

export function loanRetorno(p: {
  loanItemId: string; date: string; condition: Condition | ''; notes: string; needsRepair: boolean;
}): Promise<Res<string>> {
  return call<string>('inv_loan_retorno', {
    p_loan_item: p.loanItemId,
    p_occurred: dateToInstant(p.date),
    p_condition: p.condition || null,
    p_notes: p.notes.trim() || null,
    p_needs_repair: p.needsRepair,
  });
}
