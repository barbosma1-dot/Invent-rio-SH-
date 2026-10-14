import { supabase } from './supabase';

export type Status = 'no_acervo' | 'fora_evento' | 'emprestado' | 'em_reparo' | 'baixado';

export const STATUS_LABEL: Record<Status, string> = {
  no_acervo: 'No acervo',
  fora_evento: 'Fora em evento',
  emprestado: 'Emprestado',
  em_reparo: 'Em reparo',
  baixado: 'Baixado',
};

// Cores com contraste nos dois temas (fundo translúcido + texto na cor).
export const STATUS_COLOR: Record<Status, string> = {
  no_acervo: '#15803d',
  fora_evento: '#b45309',
  emprestado: '#1d4ed8',
  em_reparo: '#b91c1c',
  baixado: '#6b7280',
};

export interface Item {
  id: string;
  mission_id: string;
  sector_id: string;
  name: string;
  description: string | null;
  category: string | null;
  photo_path: string | null;
  location_id: string | null;
  location_note: string | null;
  value: number | null;
  value_kind: 'compra' | 'estimado' | null;
  acquired_at: string | null;
  notes: string | null;
  baixa_at: string | null;
  baixa_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemStatusRow {
  item_id: string;
  status: Status;
  overdue: boolean;
  expected_return: string | null;
  responsible_name: string | null;
  open_saida_id?: string | null;
}

export interface Loc {
  id: string;
  sector_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
}

export const ITEM_COLUMNS =
  'id,mission_id,sector_id,name,description,category,photo_path,location_id,location_note,value,value_kind,acquired_at,notes,baixa_at,baixa_reason,created_at,updated_at';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Aceita o link do QR (…/i/<id>) ou o próprio id. */
export function parseItemId(text: string): string | null {
  const m = text.match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
}

export function itemLink(id: string): string {
  return `${window.location.origin}/i/${id}`;
}

/** Endereço público da foto (bucket público). `version` evita foto antiga em cache. */
export function photoUrl(path: string | null | undefined, version?: string | null): string | null {
  if (!path || !supabase) return null;
  const url = supabase.storage.from('inv-fotos').getPublicUrl(path).data.publicUrl;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

/** "Sala > Armário > Prateleira" */
export function locationPath(locs: Loc[], id: string | null | undefined): string {
  if (!id) return '';
  const byId = new Map(locs.map((l) => [l.id, l]));
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 20) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(' › ');
}

export async function uploadItemPhoto(
  item: { id: string; mission_id: string; sector_id: string },
  blob: Blob,
): Promise<string> {
  if (!supabase) throw new Error('Banco não configurado.');
  const path = `${item.mission_id}/${item.sector_id}/${item.id}.jpg`;
  const { error } = await supabase.storage
    .from('inv-fotos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw new Error(error.message);
  return path;
}

export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  // aceita 1.234,56 e 1234.56
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}
