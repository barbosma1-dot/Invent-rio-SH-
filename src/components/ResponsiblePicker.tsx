import { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, User } from 'lucide-react';
import { useScope } from '../scopeStore';
import { loadContact, loadPeople, norm, type Person, type Responsible, type RespType } from '../lib/movements';

const TABS: { id: RespType; label: string }[] = [
  { id: 'usuario', label: 'Usuário do app' },
  { id: 'membro_wop', label: 'Membro do Wop' },
  { id: 'avulso', label: 'Pessoa avulsa' },
];

function Avatar({ url }: { url?: string | null }) {
  return (
    <span className="inv-soft flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={20} />}
    </span>
  );
}

/** Escolha do responsável: usuário do app, membro do Wop ou pessoa avulsa. */
export function ResponsiblePicker({
  missionId, value, onChange, canSeeContacts,
}: {
  missionId: string;
  value: Responsible | null;
  onChange: (r: Responsible | null) => void;
  canSeeContacts: boolean;
}) {
  const missions = useScope((st) => st.missions);
  const [tab, setTab] = useState<RespType>(value?.type ?? 'usuario');
  const [users, setUsers] = useState<Person[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [contact, setContact] = useState<{ phone: string | null; photo_url: string | null; email?: string | null } | null>(null);
  const [extra, setExtra] = useState<string>(''); // nível/grupo do selecionado

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPeople(missionId, new Map(missions.map((x) => [x.id, x.name]))).then((r) => {
      if (!alive) return;
      setUsers(r.users); setMembers(r.members); setErr(r.error ?? ''); setLoading(false);
    });
    return () => { alive = false; };
  }, [missionId, missions]);

  // cartão: telefone e foto só para quem pode ver
  useEffect(() => {
    let alive = true;
    setContact(null);
    if (canSeeContacts && value && value.type !== 'avulso' && value.id) {
      loadContact(value.type, value.id).then((c) => { if (alive) setContact(c); });
    }
    const p = [...users, ...members].find((x) => x.id === value?.id && x.type === value?.type);
    setExtra(p?.sub ?? '');
    return () => { alive = false; };
  }, [value?.type, value?.id, canSeeContacts, users, members]);

  const list = useMemo(() => {
    const base = tab === 'usuario' ? users : members;
    const q = norm(search);
    const f = q ? base.filter((p) => norm(p.name).includes(q)) : base;
    return f.slice(0, 40);
  }, [tab, users, members, search]);

  function pick(p: Person) {
    onChange({ type: p.type, id: p.id, name: p.name });
  }

  const avulso = value?.type === 'avulso' ? value : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Tipo de responsável">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`sh-btn ${tab === t.id ? 'sh-btn-primary' : 'sh-btn-secondary'}`}
            style={{ minHeight: 36, padding: '0 0.7rem', fontSize: '0.8rem' }}
            onClick={() => {
              setTab(t.id); setSearch('');
              if (t.id === 'avulso') onChange({ type: 'avulso', name: avulso?.name ?? '', phone: avulso?.phone ?? '' });
              else if (value?.type === 'avulso') onChange(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'avulso' ? (
        <div className="flex flex-col gap-2">
          <input className="inv-input" placeholder="Nome *" value={avulso?.name ?? ''} maxLength={120}
            onChange={(e) => onChange({ type: 'avulso', name: e.target.value, phone: avulso?.phone ?? '' })} />
          <input className="inv-input" placeholder="Telefone (opcional)" inputMode="tel" value={avulso?.phone ?? ''} maxLength={30}
            onChange={(e) => onChange({ type: 'avulso', name: avulso?.name ?? '', phone: e.target.value })} />
        </div>
      ) : (
        <>
          <input className="inv-input" placeholder={tab === 'usuario' ? 'Buscar usuário…' : 'Buscar membro do Wop…'} value={search} onChange={(e) => setSearch(e.target.value)} />
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Carregando pessoas…</p>
          ) : err ? (
            <p className="inv-error">{err}</p>
          ) : list.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
              {tab === 'usuario'
                ? 'Ainda não há usuários além de você. Cada pessoa do Wop aparece aqui depois do primeiro login no Inventário. Por enquanto, use "Membro do Wop" ou "Pessoa avulsa".'
                : 'Ninguém encontrado. Use "Pessoa avulsa" se preferir.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {list.map((p) => {
                const on = value?.type === p.type && value?.id === p.id;
                return (
                  <li key={p.key}>
                    <button type="button" className="sh-card w-full text-left" aria-pressed={on}
                      style={{ padding: '0.5rem 0.75rem', minHeight: 44, borderColor: on ? 'var(--sh-primary)' : undefined, borderWidth: on ? 2 : undefined }}
                      onClick={() => pick(p)}>
                      <span className="font-bold text-sm">{p.name}</span>
                      {p.sub && <span className="text-xs block" style={{ color: 'var(--sh-text-muted)' }}>{p.sub}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {value && value.name.trim() && (
        <div className="sh-card flex items-center gap-3" style={{ padding: '0.6rem 0.75rem' }} aria-label="Responsável escolhido">
          <Avatar url={contact?.photo_url} />
          <div className="flex flex-col min-w-0">
            <span className="inv-label">Responsável</span>
            <span className="font-bold" style={{ overflowWrap: 'anywhere' }}>{value.name}</span>
            {extra && <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{extra}</span>}
            {canSeeContacts && (contact?.phone || value.phone) && (
              <a className="text-xs flex items-center gap-1" style={{ color: 'var(--sh-primary)' }} href={`tel:${(contact?.phone || value.phone || '').replace(/[^\d+]/g, '')}`}>
                <Phone size={12} /> {contact?.phone || value.phone}
              </a>
            )}
            {canSeeContacts && contact?.email && (
              <a className="text-xs flex items-center gap-1" style={{ color: 'var(--sh-primary)', overflowWrap: 'anywhere' }} href={`mailto:${contact.email}`}>
                <Mail size={12} /> {contact.email}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
