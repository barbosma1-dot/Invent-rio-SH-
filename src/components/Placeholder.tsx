import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../kit';

// Tela provisória: mostra o que vai existir e em qual tarefa chega.
export function Placeholder({
  title, subtitle, icon: Icon, task, items,
}: { title: string; subtitle: string; icon: LucideIcon; task: string; items: string[] }) {
  return (
    <div className="sh-page">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="sh-card">
        <div className="flex items-center gap-3 mb-3">
          <span className="inv-soft flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, color: 'var(--sh-primary)' }}>
            <Icon size={22} />
          </span>
          <div>
            <p className="font-extrabold">Em construção</p>
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Chega na {task}</p>
          </div>
        </div>
        <ul className="text-sm flex flex-col gap-1.5" style={{ color: 'var(--sh-text-muted)', paddingLeft: '1.1rem', listStyle: 'disc' }}>
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </div>
    </div>
  );
}
