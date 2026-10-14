import { supabase } from './supabase';

// Chamada à Function do Inventário que sincroniza com o Wop. Nenhuma chave passa pelo navegador.
const SYNC_URL = '/api/integrations/wop/sync';
const LAST_KEY = 'inv_wop_sync_at';
const RELOAD_KEY = 'inv_wop_reload_at';
const OFF_KEY = 'inv_wop_sync_off';
const MIN_GAP_MS = 5 * 60 * 1000;
const RELOAD_GAP_MS = 2 * 60 * 1000;

const store = {
  get(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* sem storage */ } },
};

export interface SyncResult { status: number; body: any }

export async function callSync(query = ''): Promise<SyncResult | null> {
  try {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const res = await fetch(SYNC_URL + query, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    let body: any = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch {
    return null;
  }
}

// Sincronização silenciosa ao abrir o app (e ao voltar à aba depois de 5 min).
// Se os PRÓPRIOS acessos mudaram, recarrega a página uma vez (anti-laço de 2 min).
export async function autoSync(): Promise<void> {
  if (store.get(OFF_KEY) === '1') return;
  if (Date.now() - Number(store.get(LAST_KEY) || 0) < MIN_GAP_MS) return;
  store.set(LAST_KEY, String(Date.now()));
  const out = await callSync();
  if (!out) return;
  if (out.status === 503) { store.set(OFF_KEY, '1'); return; } // não configurada/desligada: não insiste nesta sessão
  if (out.body?.me_changed && Date.now() - Number(store.get(RELOAD_KEY) || 0) > RELOAD_GAP_MS) {
    store.set(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }
}

export function summarize(b: any): string {
  if (!b) return 'Sem resposta.';
  if (b.error) return String(b.error);
  if (b.dry_run) {
    const a = b.applied || {};
    return `Simulação (nada foi gravado): catálogo ${a.catalog_changed ?? 0}, usuários ${a.users_changed ?? 0}, membros ${a.members_changed ?? 0}; ` +
      `acessos +${a.access_added ?? 0}/−${a.access_removed ?? 0}; desativados ${a.deactivated ?? 0}; ` +
      `sem conta no Inventário ${a.users_unmatched ?? 0}; admins locais preservados ${a.local_admins_skipped ?? 0}; erros ${a.errors ?? 0}.`;
  }
  if (b.skipped) return b.skipped === 'recent' ? 'Sincronizado há menos de 1 minuto.' : 'Já há uma sincronização em andamento.';
  return `${b.ok ? 'Sincronizado' : 'Sincronizado com ressalvas'} (${b.mode}): ${b.users_changed ?? 0} usuário(s), ${b.members_changed ?? 0} membro(s) e ${b.catalog_changed ?? 0} item(ns) de catálogo; erros ${b.errors ?? 0}.`;
}
