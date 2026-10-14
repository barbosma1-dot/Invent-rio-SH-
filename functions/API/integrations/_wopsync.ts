// Inventário Sh <- Wop (hub de usuários): consome o feed contínuo de missões, setores, usuários e membros.
// Só servidor: a chave (WOP_SYNC_KEY) nunca vai ao navegador. A aplicação no banco é feita por RPCs service_role (inv_*).
// Ligar: INVENTARIO_SYNC_SOURCE=wop (sem ela o endpoint responde "desligada"; a simulação ?dry=1 funciona antes de ligar).
// Rollback: apagar INVENTARIO_SYNC_SOURCE e publicar de novo (usuários, acessos e itens ficam como estão).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WopSyncEnv {
  INVENTARIO_SYNC_SOURCE?: string; // "wop" liga a aplicação
  WOP_SUPABASE_URL?: string;
  WOP_SUPABASE_ANON_KEY?: string;
  WOP_SYNC_KEY?: string;           // chave do app "inventario" emitida no Wop (hub_issue_key). Só em Cloudflare Secrets.
}
export interface WopSyncContext { userId: string; admin: SupabaseClient }
export interface WopSyncOptions {
  force?: boolean; // ignora o limite de 60 s (só admin)
  full?: boolean;  // ressincronização total pelo snapshot (só admin)
  dry?: boolean;   // simulação (só admin): aplica o snapshot numa subtransação e desfaz
}

const PAGE_LIMIT = 200;
const MAX_PAGES = 10;

export function wopSyncEnabled(env: WopSyncEnv): boolean {
  return String(env.INVENTARIO_SYNC_SOURCE || "").trim().toLowerCase() === "wop";
}

export function wopKeysConfigured(env: WopSyncEnv): boolean {
  return !!(env.WOP_SUPABASE_URL?.startsWith("https://") && env.WOP_SUPABASE_ANON_KEY && env.WOP_SYNC_KEY);
}

async function wopRpc(env: WopSyncEnv, fn: string, args: Record<string, unknown>, fetchImpl: typeof fetch): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const base = (env.WOP_SUPABASE_URL as string).replace(/\/+$/, "");
    const anon = env.WOP_SUPABASE_ANON_KEY as string;
    const res = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
      body: JSON.stringify({ p_key: env.WOP_SYNC_KEY, ...args }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`wop_${res.status}`); // nunca repassar o corpo do Wop ao navegador
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data } = await admin.from("inv_profiles").select("is_admin").eq("id", userId).limit(1);
  return !!(data && data[0] && (data[0] as { is_admin: boolean }).is_admin);
}

// Impressão digital dos acessos de quem chamou: se mudar, a tela recarrega uma vez.
async function accessFingerprint(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from("inv_access").select("mission_id, sector_id, access").eq("user_id", userId);
  const rows = (data || []) as { mission_id: string; sector_id: string | null; access: string }[];
  return rows.map((r) => `${r.mission_id}|${r.sector_id ?? ""}|${r.access}`).sort().join(",");
}

export async function wopSync(
  ctx: WopSyncContext,
  env: WopSyncEnv,
  opts: WopSyncOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<{ status: number; body: any }> {
  if (!wopKeysConfigured(env)) {
    return { status: 503, body: { error: "Sincronização com o Wop não configurada.", configured: false } };
  }
  if (!opts.dry && !wopSyncEnabled(env)) {
    return { status: 503, body: { error: "Sincronização com o Wop desligada (INVENTARIO_SYNC_SOURCE).", configured: true, enabled: false } };
  }
  if ((opts.force || opts.full || opts.dry) && !(await isAdmin(ctx.admin, ctx.userId))) {
    return { status: 403, body: { error: "Apenas o administrador pode forçar a sincronização." } };
  }

  if (opts.dry) {
    try {
      const snap = await wopRpc(env, "wop_inventario_snapshot_full", {}, fetchImpl);
      const sim = await ctx.admin.rpc("inv_wop_dry_run", { p_snap: snap });
      if (sim.error) throw new Error(`dry_run:${sim.error.message}`.slice(0, 120));
      return { status: 200, body: { ok: true, ...sim.data } };
    } catch {
      return { status: 502, body: { error: "Não foi possível simular a sincronização com o Wop." } };
    }
  }

  const before = await accessFingerprint(ctx.admin, ctx.userId);
  const claim = await ctx.admin.rpc("inv_sync_claim", { p_force: !!(opts.force || opts.full) });
  if (claim.error || !claim.data) return { status: 500, body: { error: "Sincronização indisponível." } };
  if (!claim.data.run) return { status: 200, body: { ok: true, skipped: claim.data.reason } };

  let mode = "changes";
  let cursor = Number(claim.data.cursor) || 0;
  const totals = { pages: 0, events: 0, catalog_changed: 0, users_changed: 0, members_changed: 0, errors: 0 };
  let failure: string | null = null;

  const runSnapshot = async () => {
    mode = "snapshot";
    const snap = await wopRpc(env, "wop_inventario_snapshot_full", {}, fetchImpl);
    const applied = await ctx.admin.rpc("inv_wop_apply_snapshot", { p_snap: snap });
    if (applied.error) throw new Error(`apply_snapshot:${applied.error.message}`.slice(0, 120));
    totals.catalog_changed += applied.data?.catalog_changed ?? 0;
    totals.users_changed += applied.data?.users_changed ?? 0;
    totals.members_changed += applied.data?.members_changed ?? 0;
    totals.errors += applied.data?.errors ?? 0;
    cursor = Number(snap?.cursor) || cursor;
  };

  try {
    if (opts.full || !claim.data.has_snapshot) {
      await runSnapshot();
    } else {
      for (let page = 0; page < MAX_PAGES; page++) {
        const d = await wopRpc(env, "wop_inventario_changes", { p_since: cursor, p_limit: PAGE_LIMIT }, fetchImpl);
        if (d?.full_resync_required) { await runSnapshot(); break; }
        if (!Array.isArray(d?.events)) throw new Error("resposta_invalida");
        totals.pages++;
        totals.events += d.events.length;
        const applied = await ctx.admin.rpc("inv_wop_apply_events", { p_events: d.events, p_next_cursor: Number(d.next_cursor) });
        if (applied.error) throw new Error(`apply_events:${applied.error.message}`.slice(0, 120));
        totals.catalog_changed += applied.data?.catalog_changed ?? 0;
        totals.users_changed += applied.data?.users_changed ?? 0;
        totals.members_changed += applied.data?.members_changed ?? 0;
        if ((applied.data?.errors ?? 0) > 0) { totals.errors += applied.data.errors; break; } // cursor não avançou
        cursor = Number(d.next_cursor) || cursor;
        if (!d.has_more) break;
      }
    }
  } catch (e: any) {
    failure = String(e?.message || "erro").slice(0, 120);
  }

  const status = failure ? "erro" : totals.errors > 0 ? "parcial" : "ok";
  await ctx.admin.rpc("inv_sync_finish", { p_status: status, p_error: failure, p_mode: mode });
  if (failure) return { status: 502, body: { error: "Não foi possível sincronizar com o Wop.", mode } };

  const after = await accessFingerprint(ctx.admin, ctx.userId);
  return { status: 200, body: { ok: status === "ok", status, mode, cursor, ...totals, me_changed: before !== after } };
}
