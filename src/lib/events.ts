import { supabase } from './supabase';
import { dateToInstant, type Condition, type Responsible } from './movements';

export interface EventFull {
  id: string;
  mission_id: string;
  sector_id: string;
  name: string;
  event_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export const EVENT_COLUMNS = 'id,mission_id,sector_id,name,event_date,end_date,notes';

export interface EventCounts { total: number; open: number; overdue: number }

/** Itens que saíram por evento, quantos ainda não voltaram e quantos estão atrasados (a view de status já calcula). */
export async function loadEventCounts(eventIds: string[]): Promise<Map<string, EventCounts>> {
  const out = new Map<string, EventCounts>();
  if (!supabase || eventIds.length === 0) return out;
  for (const id of eventIds) out.set(id, { total: 0, open: 0, overdue: 0 });
  const [all, open] = await Promise.all([
    supabase.from('inv_movements').select('event_id').eq('kind', 'saida').in('event_id', eventIds).range(0, 4999),
    supabase.from('inv_item_status').select('event_id,overdue').not('open_saida_id', 'is', null).in('event_id', eventIds).range(0, 4999),
  ]);
  for (const r of (all.data ?? []) as { event_id: string }[]) {
    const c = out.get(r.event_id); if (c) c.total += 1;
  }
  for (const r of (open.data ?? []) as { event_id: string; overdue: boolean }[]) {
    const c = out.get(r.event_id); if (c) { c.open += 1; if (r.overdue) c.overdue += 1; }
  }
  return out;
}

export interface BatchOut {
  item_id: string;
  sector_id: string;
}

/** Saída de vários itens para um evento, em uma única gravação (se um falhar, nenhum é gravado). */
export async function registerBatchSaida(p: {
  items: BatchOut[];
  eventId: string;
  date: string;
  expected: string | null;
  responsible: Responsible;
  condition: Condition | null;
  notes: string;
  userId: string;
}): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Banco não configurado.' };
  const r = p.responsible;
  const rows = p.items.map((i) => ({
    item_id: i.item_id,
    kind: 'saida',
    occurred_at: dateToInstant(p.date),
    saida_reason: 'evento',
    event_id: p.eventId,
    expected_return: p.expected || null,
    responsible_type: r.type,
    responsible_user_id: r.type === 'usuario' ? r.id ?? null : null,
    responsible_member_id: r.type === 'membro_wop' ? r.id ?? null : null,
    responsible_name: r.name.trim(),
    condition: p.condition,
    notes: p.notes.trim() || null,
    created_by: p.userId,
  }));
  const { data, error } = await supabase.from('inv_movements').insert(rows).select('id,sector_id');
  if (error || !data) return { ok: false, error: friendlyBatch(error?.message ?? 'Não foi possível registrar.') };
  const phone = r.phone?.trim();
  if (r.type === 'avulso' && phone) {
    const c = await supabase.from('inv_movement_contacts').insert((data as { id: string; sector_id: string }[]).map((m) => ({ movement_id: m.id, sector_id: m.sector_id, phone })));
    if (c.error) return { ok: true, warning: 'Saídas registradas, mas o telefone não foi gravado: ' + c.error.message };
  }
  return { ok: true };
}

export interface BatchReturn {
  item_id: string;
  saida_id: string;
  responsible: Responsible;
  needs_repair: boolean;
}

/** Retorno de vários itens em uma única gravação. Quem devolve = quem levou. */
export async function registerBatchRetorno(p: {
  returns: BatchReturn[];
  date: string;
  condition: Condition | null;
  notes: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Banco não configurado.' };
  const rows = p.returns.map((x) => ({
    item_id: x.item_id,
    kind: 'retorno',
    occurred_at: dateToInstant(p.date),
    return_of: x.saida_id,
    needs_repair: x.needs_repair,
    responsible_type: x.responsible.type,
    responsible_user_id: x.responsible.type === 'usuario' ? x.responsible.id ?? null : null,
    responsible_member_id: x.responsible.type === 'membro_wop' ? x.responsible.id ?? null : null,
    responsible_name: x.responsible.name.trim(),
    condition: p.condition,
    notes: p.notes.trim() || null,
    created_by: p.userId,
  }));
  const { error } = await supabase.from('inv_movements').insert(rows);
  if (error) return { ok: false, error: friendlyBatch(error.message) };
  return { ok: true };
}

function friendlyBatch(msg: string): string {
  if (/já está fora/i.test(msg)) return 'Algum item já está fora do acervo. Atualize a lista e tente de novo (nada foi gravado).';
  if (/em reparo/i.test(msg)) return 'Algum item está em reparo (nada foi gravado). Atualize a lista e tente de novo.';
  if (/baixado/i.test(msg)) return 'Algum item foi baixado (nada foi gravado).';
  if (/duplicate key/i.test(msg)) return 'Algum retorno já foi registrado (nada foi gravado). Atualize a lista.';
  if (/row-level security/i.test(msg)) return 'Você não tem permissão para este registro neste setor.';
  return msg;
}
