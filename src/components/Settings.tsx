import { LogOut } from 'lucide-react';
import { PageHeader, ThemeToggle } from '../kit';
import { useSession } from '../store';
import { APP_VERSION } from '../brand';
import { WopSyncCard } from './WopSyncCard';
import { OrgOverview } from './OrgOverview';
import { InstallCard } from './InstallCard';
import { ExportCard } from './ExportCard';
import { AccessCard } from './AccessCard';

export function Settings() {
  const { user, signOut } = useSession();
  return (
    <div className="sh-page sh-page-narrow">
      <PageHeader title="Ajustes" subtitle="Conta e aparência do aplicativo." />

      <div className="sh-card mb-4">
        <p className="inv-label mb-2">Conta</p>
        <p className="font-bold mb-4" style={{ overflowWrap: 'anywhere' }}>{user?.email}</p>
        <button type="button" className="sh-btn sh-btn-danger" onClick={signOut}>
          <LogOut size={18} /> Sair da conta
        </button>
      </div>

      <div className="sh-card mb-4">
        <p className="inv-label mb-3">Tema</p>
        <ThemeToggle />
        <p className="text-xs mt-3" style={{ color: 'var(--sh-text-faint)' }}>
          Noturno: escuro automático das 18h às 6h.
        </p>
      </div>

      <AccessCard />

      <ExportCard />

      <InstallCard />

      <WopSyncCard />

      <OrgOverview />

      <p className="text-xs text-center" style={{ color: 'var(--sh-text-faint)' }}>Inventário Sh · versão {APP_VERSION}</p>
    </div>
  );
}
