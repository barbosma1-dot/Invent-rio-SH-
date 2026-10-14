import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Tab = 'regionais' | 'missoes' | 'setores' | 'membros';
type Row = Record<string, any>;

const TABLES: Record<Tab, string> = {
  regionais: 'inv_regionals',
  missoes: 'inv_missions',
  setores: 'inv_sectors',
  membros: 'inv_hub_members',
};
const LABELS: Record<Tab, string> = {
  regionais: 'Regionais', missoes: 'Missões', setores: 'Setores', membros: 'Membros',
};

const nameOf = (r: Row) => String(r.name ?? r.nome ?? r.full_name ?? r.ext_name ?? r.ext_email ?? r.id ?? '—');

// Visão somente leitura do que a sincronização com o Wop trouxe.
export function OrgOverview() {
  const [tab, setTab] = useState<Tab>('missoes');
  const [data, setData] = useState<Record<string, Row[] | null>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const out: Record<string, Row[] | null> = {};
      const er: Record<string, string> = {};
      await Promise.all((Object.keys(TABLES) as Tab[]).map(async (t) => {
        try {
          const { data: d, error } = await supabase!.from(TABLES[t]).select('*').limit(2000);
          if (error) { er[t] = error.message; out[t] = null; } else out[t] = (d ?? []) as Row[];
        } catch (e: any) { er[t] = String(e?.message ?? e); out[t] = null; }
      }));
      if (alive) { setData(out); setErrs(er); }
    })();
    return () => { alive = false; };
  }, []);

  const missions = data.missoes ?? [];
  const regionals = data.regionais ?? [];
  const sectors = data.setores ?? [];
  const missionName = useMemo(() => new Map(missions.map((m) => [m.id, nameOf(m)])), [missions]);
  const regionalName = useMemo(() => new Map(regionals.map((r) => [r.id, nameOf(r)])), [regionals]);

  const rows = (data[tab] ?? []).filter((r) => !search || nameOf(r).toLowerCase().includes(search.toLowerCase()));

  const sub = (r: Row): string => {
    if (tab === 'missoes') return regionalName.get(r.regional_id) ?? 'Sem regional';
    if (tab === 'setores') return missionName.get(r.mission_id) ?? '';
    if (tab === 'membros') return [r.group_name ?? r.grupo, r.nivel_formativo].filter(Boolean).join(' · ');
    if (tab === 'regionais') return `${missions.filter((m) => m.regional_id === r.id).length} missões`;
    return '';
  };

  return (
    <div className="sh-card mb-4">
      <p className="inv-label mb-3">Estrutura vinda do Wop</p>
      <div className="flex gap-2 mb-3" style={{ overflowX: 'auto' }}>
        {(Object.keys(TABLES) as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => { setTab(t); setSearch(''); }}
            className={`sh-btn ${tab === t ? 'sh-btn-primary' : 'sh-btn-secondary'}`}>
            {LABELS[t]}{data[t] ? ` (${data[t]!.length})` : ''}
          </button>
        ))}
      </div>

      {errs[tab] && (
        <p className="text-sm mb-2" style={{ color: 'var(--sh-danger)' }}>Não consegui ler esta lista: {errs[tab]}</p>
      )}
      {data[tab] && data[tab]!.length === 0 && !errs[tab] && (
        <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
          Vazio. {tab === 'regionais' || tab === 'membros' ? 'Rode «Ressincronizar tudo» acima.' : ''}
        </p>
      )}

      {tab === 'membros' && (data.membros?.length ?? 0) > 0 && (
        <input className="inv-input mb-2" placeholder="Buscar membro" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}

      <div className="flex flex-col">
        {rows.slice(0, 200).map((r, i) => (
          <div key={r.id ?? i} style={{ padding: '8px 0', borderTop: '1px solid var(--sh-border)' }}>
            <p className="font-bold" style={{ overflowWrap: 'anywhere' }}>{nameOf(r)}</p>
            {sub(r) && <p className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{sub(r)}</p>}
          </div>
        ))}
        {rows.length > 200 && <p className="text-xs mt-2" style={{ color: 'var(--sh-text-faint)' }}>Mostrando 200 de {rows.length}. Use a busca.</p>}
      </div>
    </div>
  );
}
