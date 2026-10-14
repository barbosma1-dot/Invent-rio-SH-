import { useEffect, useState } from 'react';
import { Home as HomeIcon, Package, ArrowLeftRight, CalendarDays, Settings as SettingsIcon, LogOut, AlertTriangle } from 'lucide-react';
import { useSession } from './store';
import { isSupabaseConfigured } from './lib/supabase';
import { Auth } from './Auth';
import { Home } from './components/Home';
import { Settings } from './components/Settings';
import { Items } from './components/Items';
import { Moves } from './components/Moves';
import { Events } from './components/Events';
import { PublicItem } from './components/PublicItem';
import { useScope } from './scopeStore';
import { LogoMenuButton, ThemeToggle } from './kit';
import { APP_NAME, LOGO_ROUND } from './brand';
import { autoSync } from './lib/wopSync';

type Tab = 'home' | 'items' | 'moves' | 'events' | 'settings';

const NAV: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Início', icon: HomeIcon },
  { id: 'items', label: 'Itens', icon: Package },
  { id: 'moves', label: 'Movimentos', icon: ArrowLeftRight },
  { id: 'events', label: 'Eventos', icon: CalendarDays },
  { id: 'settings', label: 'Ajustes', icon: SettingsIcon },
];

export default function App() {
  const { user, ready, init, signOut } = useSession();
  const [tab, setTab] = useState<Tab>('home');
  const [collapsed, setCollapsed] = useState(false);
  const [path, setPath] = useState(window.location.pathname);
  const [wantLogin, setWantLogin] = useState(false);

  useEffect(() => init(), [init]);

  // Rota pública do QR: /i/<id>
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const publicId = path.match(/^\/i\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i)?.[1];
  function leavePublic() {
    window.history.pushState(null, '', '/');
    setPath('/');
    setWantLogin(false);
  }

  const userId = user?.id;
  // Carrega missões, setores e permissões do usuário (o banco filtra pelo que ele pode ver).
  useEffect(() => {
    if (userId) useScope.getState().load(userId);
    else useScope.getState().reset();
  }, [userId]);

  // Sincroniza com o Wop ao entrar e ao voltar para a aba (a Function limita a frequência).
  useEffect(() => {
    if (!userId) return;
    autoSync();
    const onVisible = () => { if (document.visibilityState === 'visible') autoSync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="sh-card" style={{ maxWidth: '28rem' }}>
          <AlertTriangle size={28} style={{ color: 'var(--sh-danger)' }} />
          <h1 className="text-xl font-extrabold mt-2 mb-1">Banco não configurado</h1>
          <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
            Faltam as variáveis <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no Cloudflare Pages.
            Depois de criá-las, faça um novo deploy.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <img src={LOGO_ROUND} alt={APP_NAME} style={{ width: 72, height: 72, borderRadius: '50%' }} />
      </div>
    );
  }

  if (publicId) {
    if (!user && wantLogin) return <Auth />;
    return <PublicItem itemId={publicId.toLowerCase()} onLogin={() => setWantLogin(true)} onLeave={leavePublic} />;
  }

  if (!user) return <Auth />;

  const page = (
    <>
      {tab === 'home' && <Home />}
      {tab === 'items' && <Items />}
      {tab === 'moves' && <Moves />}
      {tab === 'events' && <Events />}
      {tab === 'settings' && <Settings />}
    </>
  );

  return (
    <div className="inv-shell">
      {/* topo no celular */}
      <header className="inv-topbar">
        <div className="inv-topbar-brand">
          <img src={LOGO_ROUND} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          {APP_NAME}
        </div>
        <ThemeToggle variant="cycle" />
      </header>

      {/* menu lateral no computador */}
      <aside className={`inv-side ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="inv-side-head">
          <LogoMenuButton
            src={LOGO_ROUND}
            alt={APP_NAME}
            onClick={() => setCollapsed((c) => !c)}
            label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            expanded={!collapsed}
          />
          {!collapsed && <span className="inv-brand">{APP_NAME}</span>}
        </div>

        <nav className="inv-side-nav" aria-label="Menu principal">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="inv-nav-item"
              aria-current={tab === id ? 'page' : undefined}
              title={collapsed ? label : undefined}
              onClick={() => setTab(id)}
            >
              <Icon size={20} />
              <span className="inv-nav-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="inv-side-foot">
          {!collapsed && <ThemeToggle compact />}
          <button type="button" className="inv-nav-item" onClick={signOut} title="Sair">
            <LogOut size={20} />
            <span className="inv-nav-label">Sair</span>
          </button>
        </div>
      </aside>

      <main className="inv-main">{page}</main>

      {/* barra inferior no celular */}
      <nav className="sh-bottomnav" aria-label="Menu principal">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="inv-bn-item" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span className="inv-bn-icon"><Icon size={20} /></span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
