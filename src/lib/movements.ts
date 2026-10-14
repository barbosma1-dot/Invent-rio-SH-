import { supabase } from './supabase';

export type MoveKind = 'entrada' | 'saida' | 'retorno';
export type RespType = 'usuario' | 'membro_wop' | 'avulso';
export type Condition = 'excelente' | 'bom' | 'regular' | 'ruim';

export const CONDITIONS: { id: Condition; label: string }[] = [
  { id: 'excelente', label: 'Excelente' },
  { id: 'bom', label: 'Bom' },
  { id: 'regular', label: 'Regular' },
  { id: 'ruim', label: 'Ruim' },
];
export const CONDITION_LABEL: Record<string, string> = Object.fromEntries(CONDITIONS.map((c) => [c.id, c.label]));

export interface Responsible {
  type: RespType;
  id?: string; // id do usuário ou do membro do Wop
  name: string;
  phone?: string; // só usado em "avulso"
}

export interface Movement {
  id: string;
  item_id: string;
  kind: MoveKind;
  occurred_at: string;
  entry_source: 'compra' | 'doacao' | null;
  value: number | null;
  value_kind: 'compra' | 'estimado' | null;
  saida_reason: 'evento' | 'emprestimo' | null;
  event_id: string | null;
  expected_return: string | null;
  return_of: string | null;
  needs_repair: boolean;
  condition: Condition | null;
  notes: string | null;
  responsible_type: RespType;
  responsible_user_id: string | null;
  responsible_member_id: string | null;
  responsible_name: string;
  created_at: string;
}

export const MOVEMENT_COLUMNS =
  'id,item_id,kind,occurred_at,entry_source,value,value_kind,saida_reason,event_id,expected_return,return_of,needs_repair,condition,notes,responsible_type,responsible_user_id,responsible_member_id,responsible_name,created_at';

export interface EventRow { id: string; sector_id: string; name: string; event_date: string | null; end_date: string | null }

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function todayLocal(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return p; // AAAA-MM-DD
}

/** Data escolhida -> instante. Hoje usa a hora atual; outro dia usa meio-dia de Brasília. */
export function dateToInstant(date: string): string {
  if (!date || date === todayLocal()) return new Date().toISOString();
  return new Date(`${date}T12:00:00-03:00`).toISOString();
}

export interface NewMovement {
  item_id: string;
  kind: MoveKind;
  occurred_at: string;
  responsible: Responsible;
  created_by: string;
  condition?: Condition | null;
  notes?: string | null;
  // entrada
  entry_source?: 'compra' | 'doacao';
  value?: number | null;
  value_kind?: 'compra' | 'estimado' | null;
  // saída
  saida_reason?: 'evento' | 'emprestimo';
  event_id?: string | null;
  expected_return?: string | null;
  // retorno
  return_of?: string;
  needs_repair?: boolean;
  // telefone de pessoa avulsa (usuário e membro do Wop o banco copia sozinho)
  sector_id: string;
}

/** Grava a movimentação. Para "avulso", grava também o telefone da hora (se informado). */
export async function registerMovement(m: NewMovement): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Banco não configurado.' };
  const r = m.responsible;
  const row = {
    item_id: m.item_id,
    kind: m.kind,
    occurred_at: m.occurred_at,
    responsible_type: r.type,
    responsible_user_id: r.type === 'usuario' ? r.id ?? null : null,
    responsible_member_id: r.type === 'membro_wop' ? r.id ?? null : null,
    responsible_name: r.name.trim(),
    created_by: m.created_by,
    condition: m.condition ?? null,
    notes: m.notes?.trim() || null,
    entry_source: m.kind === 'entrada' ? m.entry_source ?? null : null,
    value: m.kind === 'entrada' ? m.value ?? null : null,
    value_kind: m.kind === 'entrada' ? m.value_kind ?? null : null,
    saida_reason: m.kind === 'saida' ? m.saida_reason ?? null : null,
    event_id: m.kind === 'saida' && m.saida_reason === 'evento' ? m.event_id ?? null : null,
    expected_return: m.kind === 'saida' ? m.expected_return || null : null,
    return_of: m.kind === 'retorno' ? m.return_of ?? null : null,
    needs_repair: m.kind === 'retorno' ? !!m.needs_repair : false,
  };
  const { data, error } = await supabase.from('inv_movements').insert(row).select('id').single();
  if (error || !data) return { ok: false, error: friendly(error?.message ?? 'Não foi possível registrar.') };

  const phone = r.phone?.trim();
  if (r.type === 'avulso' && phone) {
    const c = await supabase.from('inv_movement_contacts').insert({ movement_id: data.id, sector_id: m.sector_id, phone });
    if (c.error) return { ok: true, warning: 'Movimentação registrada, mas o telefone não foi gravado: ' + c.error.message };
  }
  return { ok: true };
}

function friendly(msg: string): string {
  if (/já está fora/i.test(msg)) return 'Este item já está fora do acervo (há uma saída em aberto).';
  if (/em reparo/i.test(msg)) return 'Este item está em reparo. Conclua o reparo antes de uma nova saída.';
  if (/baixado/i.test(msg)) return 'Este item foi baixado e não aceita movimentações.';
  if (/inv_mov_entrada_uq|duplicate key/i.test(msg)) return 'Este item já tem entrada ou o retorno já foi registrado.';
  if (/row-level security/i.test(msg)) return 'Você não tem permissão para este registro neste setor.';
  return msg;
}

export interface Person {
  key: string;
  type: 'usuario' | 'membro_wop';
  id: string;
  name: string;
  sub: string; // nível formativo · grupo
}

/**
 * Usuários do app e membros do Wop (sem telefone). Membro com o mesmo nome de um usuário não repete.
 * Os membros do Wop podem estar ligados a outra missão (hoje todos estão em Guarulhos-SP): traz todos os que o banco
 * deixa a pessoa ver, com os da missão do item primeiro.
 */
export async function loadPeople(missionId: string, missionNames: Map<string, string> = new Map()): Promise<{ users: Person[]; members: Person[]; error?: string }> {
  if (!supabase) return { users: [], members: [] };
  const [u, m] = await Promise.all([
    supabase.from('inv_profiles').select('id,name,formative_level,group_name,active').eq('active', true).order('name').range(0, 999),
    supabase.from('inv_hub_members').select('id,mission_id,name,formative_level,group_name').eq('active', true).order('name').range(0, 4999),
  ]);
  if (u.error || m.error) return { users: [], members: [], error: (u.error || m.error)!.message };
  const sub = (a: { formative_level: string | null; group_name: string | null }) =>
    [a.formative_level, a.group_name].filter(Boolean).join(' · ');
  const users: Person[] = (u.data ?? []).map((x) => ({ key: 'u' + x.id, type: 'usuario', id: x.id, name: x.name, sub: sub(x) }));
  const seen = new Set(users.map((x) => norm(x.name)));
  const members: Person[] = (m.data ?? [])
    .filter((x) => !seen.has(norm(x.name)))
    .sort((a, b) => Number(b.mission_id === missionId) - Number(a.mission_id === missionId))
    .map((x) => ({
      key: 'm' + x.id, type: 'membro_wop', id: x.id, name: x.name,
      sub: [sub(x), x.mission_id !== missionId ? missionNames.get(x.mission_id)?.trim() : ''].filter(Boolean).join(' · '),
    }));
  return { users, members };
}

/** Telefone e foto (o banco só devolve para admin, gestor e coordenador). */
export async function loadContact(type: RespType, id?: string): Promise<{ phone: string | null; photo_url: string | null } | null> {
  if (!supabase || !id || type === 'avulso') return null;
  const q = type === 'usuario'
    ? supabase.from('inv_profile_contacts').select('phone,photo_url').eq('user_id', id)
    : supabase.from('inv_hub_member_contacts').select('phone,photo_url').eq('member_id', id);
  const { data } = await q.maybeSingle();
  return (data as { phone: string | null; photo_url: string | null } | null) ?? null;
}

/** Telefone/foto guardados na movimentação (só quem edita o setor lê). */
export async function loadMovementContacts(ids: string[]): Promise<Map<string, { phone: string | null; photo_url: string | null }>> {
  const out = new Map<string, { phone: string | null; photo_url: string | null }>();
  if (!supabase || ids.length === 0) return out;
  const { data } = await supabase.from('inv_movement_contacts').select('movement_id,phone,photo_url').in('movement_id', ids);
  for (const r of (data ?? []) as { movement_id: string; phone: string | null; photo_url: string | null }[]) {
    out.set(r.movement_id, { phone: r.phone, photo_url: r.photo_url });
  }
  return out;
}
