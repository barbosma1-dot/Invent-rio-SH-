import { createClient } from "@supabase/supabase-js";
import { wopSync, type WopSyncEnv } from "../_wopsync";

// POST /api/integrations/wop/sync[?force=1|?full=1|?dry=1]   (pasta em minúsculas: functions/api/integrations/wop/)
// Qualquer usuário logado pode disparar a sincronização normal (limitada a 1 por minuto no banco).
// force/full/dry só para admin do Inventário. Exige o Bearer (access token) do Supabase do Inventário; sem CORS aberto.
// Variáveis (Cloudflare Pages do Inventário): VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (Secret),
// WOP_SUPABASE_URL, WOP_SUPABASE_ANON_KEY, WOP_SYNC_KEY (Secret, chave do app "inventario") e INVENTARIO_SYNC_SOURCE=wop (liga).
interface Env extends WopSyncEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

// GET /api/integrations/wop/sync -> teste de "a Function está no ar?" (não revela nenhuma configuração nem dado).
export const onRequestGet = async () => json({ ok: true, function: "wop-sync", deployed: true });

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: "Servidor não configurado." }, 500);

  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Não autenticado." }, 401);

  // 1) Quem é o usuário: validado com a chave PÚBLICA do Inventário (a mesma do app), sem depender da chave secreta.
  const anon = String(env.VITE_SUPABASE_ANON_KEY || "").trim() || serviceKey;
  let userId = "";
  try {
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (who.ok) userId = String((await who.json())?.id || "");
  } catch { /* cai em "Sessão inválida" */ }
  if (!userId) return json({ error: "Sessão inválida. Saia e entre de novo no app." }, 401);

  // 2) A chave secreta (service role) só é usada para gravar a sincronização; se estiver errada, o erro é este:
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const probe = await admin.from("inv_sync_state").select("id").limit(1);
  if (probe.error) {
    return json({ error: "A chave SUPABASE_SERVICE_ROLE_KEY do Cloudflare não é a do projeto Inventário Sh (ou foi colada errada)." }, 500);
  }

  const q = new URL(request.url).searchParams;
  const out = await wopSync(
    { userId, admin },
    env,
    { force: q.get("force") === "1", full: q.get("full") === "1", dry: q.get("dry") === "1" }
  );
  return json(out.body, out.status);
};
