import { useEffect, useState } from 'react';
import { ImageOff, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { photoUrl } from '../lib/items';
import { useSession } from '../store';
import { useScope } from '../scopeStore';
import { APP_NAME, LOGO_ROUND } from '../brand';
import { ItemDetail } from './ItemDetail';

interface PublicData { id: string; name: string; photo_path: string | null }

/**
 * Página aberta pelo QR (/i/<id>).
 * Sem login: só foto e nome (função pública do banco).
 * Logado e com acesso ao setor: abre o detalhe completo por cima.
 */
export function PublicItem({
  itemId, onLogin, onLeave,
}: { itemId: string; onLogin: () => void; onLeave: () => void }) {
  const user = useSession((s) => s.user);
  const scopeLoaded = useScope((s) => s.loaded);
  const [data, setData] = useState<PublicData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.rpc('inv_public_item', { p_id: itemId }).then(({ data: d, error }) => {
      if (!alive) return;
      if (error || !d) { setState('missing'); return; }
      setData(d as PublicData);
      setState('ok');
    });
    return () => { alive = false; };
  }, [itemId]);

  // Logado: vê se o banco libera o item completo para este usuário.
  useEffect(() => {
    if (!supabase || !user || !scopeLoaded) { setHasAccess(false); return; }
    let alive = true;
    supabase.from('inv_items').select('id').eq('id', itemId).maybeSingle().then(({ data: d }) => {
      if (alive) setHasAccess(!!d);
    });
    return () => { alive = false; };
  }, [itemId, user, scopeLoaded]);

  const img = photoUrl(data?.photo_path);

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-5 gap-4" style={{ background: 'var(--sh-bg)' }}>
      <img src={LOGO_ROUND} alt={APP_NAME} style={{ width: 56, height: 56, borderRadius: '50%' }} />

      <div className="sh-card flex flex-col gap-3 items-center text-center" style={{ width: '100%', maxWidth: '26rem' }}>
        {state === 'loading' && <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>}
        {state === 'missing' && <p className="font-bold">Item não encontrado.</p>}
        {state === 'ok' && data && (
          <>
            <div className="inv-soft flex items-center justify-center" style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', color: 'var(--sh-text-muted)' }}>
              {img ? <img src={img} alt={data.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImageOff size={40} />}
            </div>
            <h1 className="text-xl font-extrabold" style={{ overflowWrap: 'anywhere' }}>{data.name}</h1>
          </>
        )}

        {state === 'ok' && !user && (
          <>
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Entre para ver os detalhes deste item.</p>
            <button type="button" className="sh-btn sh-btn-primary sh-btn-block" onClick={onLogin}>
              <LogIn size={18} /> Entrar
            </button>
          </>
        )}

        {state === 'ok' && user && scopeLoaded && !hasAccess && (
          <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Você não tem acesso aos detalhes deste item.</p>
        )}

        <button type="button" className="sh-btn sh-btn-ghost" onClick={onLeave}>
          {user ? 'Ir para o app' : 'Voltar ao início'}
        </button>
      </div>

      {user && hasAccess && <ItemDetail itemId={itemId} onClose={onLeave} />}
    </div>
  );
}
