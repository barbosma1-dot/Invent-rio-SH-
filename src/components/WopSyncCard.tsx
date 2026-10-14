import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, FlaskConical, DatabaseZap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callSync, summarize } from '../lib/wopSync';
import { useSession } from '../store';

// Cartão de sincronização com o Wop, só para admin (aparece em Ajustes).
export function WopSyncCard() {
  const user = useSession((s) => s.user);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [status, setStatus] = useState<any>(null);

  const loadStatus = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('inv_sync_status');
      setStatus(error ? null : data);
    } catch { setStatus(null); }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase || !user) return;
      try {
        const { data } = await supabase.from('inv_profiles').select('is_admin').eq('id', user.id).maybeSingle();
        if (!alive) return;
        const admin = !!data?.is_admin;
        setIsAdmin(admin);
        if (admin) loadStatus();
      } catch { if (alive) setIsAdmin(false); }
    })();
    return () => { alive = false; };
  }, [user, loadStatus]);

  const run = async (query: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setInfo('');
    const out = await callSync(query);
    setBusy(false);
    setInfo(out ? summarize(out.body) : 'Não foi possível falar com o servidor.');
    loadStatus();
  };

  if (!isAdmin) return null;
  const st = status?.state;
  return (
    <div className="sh-card mb-4">
      <p className="inv-label mb-2">Sincronização com o Wop</p>
      <p className="text-sm mb-3" style={{ color: 'var(--sh-text-muted)' }}>
        {st
          ? `Último: ${st.last_status || '—'}${st.last_ok_at ? ` · ok em ${new Date(st.last_ok_at).toLocaleString('pt-BR')}` : ''}. `
          : 'Sem status ainda. '}
        {status ? `Missões ${status.missoes ?? 0}, setores ${status.setores ?? 0}, acessos do hub ${status.acessos_hub ?? 0}, membros do Wop ${status.membros_wop ?? 0}.` : ''}
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" className="sh-btn sh-btn-secondary sh-btn-block" disabled={busy} onClick={() => run('?dry=1')}>
          <FlaskConical size={18} /> Simular (não grava)
        </button>
        <button type="button" className="sh-btn sh-btn-primary sh-btn-block" disabled={busy} onClick={() => run('?force=1')}>
          <RefreshCw size={18} /> Sincronizar agora
        </button>
        <button type="button" className="sh-btn sh-btn-secondary sh-btn-block" disabled={busy}
          onClick={() => run('?full=1', 'Ressincronizar tudo pelo snapshot do Wop?')}>
          <DatabaseZap size={18} /> Ressincronizar tudo
        </button>
      </div>
      {busy && <p className="text-sm mt-3">Trabalhando…</p>}
      {info && <p className="text-sm mt-3" style={{ overflowWrap: 'anywhere' }}>{info}</p>}
      {(status?.log || []).slice(0, 4).map((l: any, i: number) => (
        <p key={i} className="text-xs mt-1" style={{ color: 'var(--sh-text-faint)' }}>
          {new Date(l.at).toLocaleString('pt-BR')} · {l.kind}
        </p>
      ))}
    </div>
  );
}
