import { CheckCircle2, UserRound } from 'lucide-react';
import { PageHeader } from '../kit';
import { useSession } from '../store';
import { APP_NAME, APP_VERSION } from '../brand';

export function Home() {
  const user = useSession((s) => s.user);
  return (
    <div className="sh-page">
      <PageHeader title="Início" subtitle={`${APP_NAME} — base instalada`} />

      <div className="sh-card mb-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={22} style={{ color: 'var(--sh-primary)' }} />
          <div>
            <p className="font-extrabold">Conexão com o banco funcionando</p>
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Login feito e sessão ativa.</p>
          </div>
        </div>
      </div>

      <div className="sh-card">
        <div className="flex items-center gap-3">
          <UserRound size={22} style={{ color: 'var(--sh-text-muted)' }} />
          <div className="min-w-0">
            <p className="inv-label">Conectado como</p>
            <p className="font-bold" style={{ overflowWrap: 'anywhere' }}>{user?.email}</p>
          </div>
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--sh-text-faint)' }}>Versão {APP_VERSION}</p>
      </div>
    </div>
  );
}
