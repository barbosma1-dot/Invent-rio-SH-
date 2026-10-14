import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageOff, Wrench } from 'lucide-react';
import { PageHeader } from '../kit';
import { supabase } from '../lib/supabase';
import { photoUrl } from '../lib/items';
import { fmtDate } from '../lib/movements';
import { formatCurrency } from '../lib/utils';
import { useScope } from '../scopeStore';
import { useSession } from '../store';
import { APP_VERSION } from '../brand';
import { ItemDetail } from './ItemDetail';

interface Totals {
  mission_id: string; sector_id: string;
  n_ativos: number; n_baixados: number;
  valor_pago: number | string; valor_estimado: number | string; sem_valor: number;
  reparos_abertos: number; reparos_concluidos: number; custo_reparos: number | string;
}
interface RepairRow {
  id: string; item_id: string; sector_id: string; opened_at: string; description: string;
  cost: number | null; closed_at: string | null; notes: string | null;
  inv_items: { name: string; photo_path: string | null; updated_at: string } | null;
}

type View = 'resumo' | 'reparos';
type RFilter = 'abertos' | 'concluidos';
const n = (v: number | string | null | undefined) => Number(v ?? 0);
const chip = { minHeight: 36, padding: '0 0.7rem', fontSize: '0.8rem' } as const;

export function Home() {
  const user = useSession((s) => s.user);
  const { loaded, missions, sectors, missionId, setMission } = useScope();
  const [view, setView] = useState<View>('resumo');
  const [totals, setTotals] = useState<Totals[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [rFilter, setRFilter] = useState<RFilter>('abertos');
  const [rSector, setRSector] = useState('');
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);

  const sectorMap = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

  const reload = useCallback(async () => {
    if (!supabase || !missionId) { setTotals([]); setRepairs([]); return; }
    setFetching(true); setError('');
    const [t, r] = await Promise.all([
      supabase.from('inv_sector_totals').select('*').eq('mission_id', missionId),
      supabase.from('inv_repairs')
        .select('id,item_id,sector_id,opened_at,description,cost,closed_at,notes,inv_items(name,photo_path,updated_at)')
        .eq('mission_id', missionId).order('opened_at', { ascending: false }).range(0, 499),
    ]);
    if (t.error) setError(t.error.message);
    else if (r.error) setError(r.error.message);
    setTotals((t.data ?? []) as Totals[]);
    setRepairs((r.data ?? []) as unknown as RepairRow[]);
    setFetching(false);
  }, [missionId]);

  useEffect(() => { if (loaded) reload(); }, [loaded, reload]);

  const mission = useMemo(() => {
    const z = { itens: 0, baixados: 0, pago: 0, estimado: 0, semValor: 0, abertos: 0, concluidos: 0, custo: 0 };
    totals.forEach((t) => {
      z.itens += t.n_ativos; z.baixados += t.n_baixados; z.pago += n(t.valor_pago); z.estimado += n(t.valor_estimado);
      z.semValor += t.sem_valor; z.abertos += t.reparos_abertos; z.concluidos += t.reparos_concluidos; z.custo += n(t.custo_reparos);
    });
    return z;
  }, [totals]);

  const bySector = useMemo(() => totals
    .filter((t) => t.n_ativos + t.n_baixados + t.reparos_abertos + t.reparos_concluidos > 0)
    .sort((a, b) => (sectorMap.get(a.sector_id)?.name ?? '').localeCompare(sectorMap.get(b.sector_id)?.name ?? '', 'pt-BR')),
  [totals, sectorMap]);
  const emptySectors = totals.length - bySector.length;

  const repairSectors = useMemo(() => {
    const ids = new Set(repairs.map((r) => r.sector_id));
    return [...ids].map((id) => [id, sectorMap.get(id)?.name ?? '—'] as const).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [repairs, sectorMap]);

  const openCount = repairs.filter((r) => !r.closed_at).length;
  const repairList = useMemo(() => repairs.filter((r) =>
    (rFilter === 'abertos' ? !r.closed_at : !!r.closed_at) && (!rSector || r.sector_id === rSector)),
  [repairs, rFilter, rSector]);
  const listCost = repairList.reduce((s, r) => s + n(r.cost), 0);

  if (!loaded) {
    return <div className="sh-page"><PageHeader title="Início" /><p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p></div>;
  }
  if (missions.length === 0) {
    return (
      <div className="sh-page">
        <PageHeader title="Início" />
        <div className="sh-card"><p className="font-extrabold">Você ainda não tem acesso a nenhum inventário.</p></div>
      </div>
    );
  }

  const stat = (label: string, value: string, color?: string) => (
    <div className="flex flex-col" style={{ minWidth: 0 }}>
      <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{label}</span>
      <span className="font-extrabold" style={{ color, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );

  return (
    <div className="sh-page">
      <PageHeader title="Início" subtitle="Valores e reparos da missão." />

      <select className="inv-input mb-3" value={missionId} onChange={(e) => setMission(e.target.value)} aria-label="Missão">
        {missions.map((m) => <option key={m.id} value={m.id}>{m.name.trim()}</option>)}
      </select>

      <div className="flex gap-1 flex-wrap mb-3" role="tablist" aria-label="Visão">
        <button type="button" role="tab" aria-selected={view === 'resumo'} className={`sh-btn ${view === 'resumo' ? 'sh-btn-primary' : 'sh-btn-secondary'}`} style={chip} onClick={() => setView('resumo')}>Resumo</button>
        <button type="button" role="tab" aria-selected={view === 'reparos'} className={`sh-btn ${view === 'reparos' ? 'sh-btn-primary' : 'sh-btn-secondary'}`} style={chip} onClick={() => setView('reparos')}>
          Reparos{openCount ? ` (${openCount})` : ''}
        </button>
      </div>

      {error && <p className="inv-error mb-3" role="alert">{error}</p>}
      {fetching && totals.length === 0 && <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>}

      {view === 'resumo' && !error && (
        <>
          <div className="sh-card mb-3">
            <p className="inv-label mb-2">Missão inteira</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {stat('Itens no inventário', String(mission.itens))}
              {stat('Valor total', formatCurrency(mission.pago + mission.estimado))}
              {stat('Pago na compra', formatCurrency(mission.pago))}
              {stat('Estimado (doado)', formatCurrency(mission.estimado))}
              {stat('Gasto em reparos', formatCurrency(mission.custo))}
              {stat('Em reparo agora', String(mission.abertos), mission.abertos ? '#b91c1c' : undefined)}
            </div>
            <p className="text-xs mt-3" style={{ color: 'var(--sh-text-faint)' }}>
              Não contam itens baixados{mission.baixados ? ` (${mission.baixados})` : ''}
              {mission.semValor ? ` · ${mission.semValor} ${mission.semValor === 1 ? 'item sem valor informado' : 'itens sem valor informado'}` : ''}.
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {bySector.map((t) => {
              const sec = sectorMap.get(t.sector_id);
              return (
                <li key={t.sector_id} className="sh-card">
                  <p className="font-bold mb-2" style={{ overflowWrap: 'anywhere' }}>{sec?.name ?? '—'}{sec && !sec.active ? ' (inativo)' : ''}</p>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    {stat('Itens', String(t.n_ativos))}
                    {stat('Valor total', formatCurrency(n(t.valor_pago) + n(t.valor_estimado)))}
                    {stat('Pago / estimado', `${formatCurrency(n(t.valor_pago))} / ${formatCurrency(n(t.valor_estimado))}`)}
                    {stat('Reparos', `${formatCurrency(n(t.custo_reparos))}${t.reparos_abertos ? ` · ${t.reparos_abertos} aberto${t.reparos_abertos > 1 ? 's' : ''}` : ''}`, t.reparos_abertos ? '#b91c1c' : undefined)}
                  </div>
                </li>
              );
            })}
          </ul>
          {!fetching && bySector.length === 0 && (
            <div className="sh-card"><p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Nenhum item cadastrado nesta missão ainda.</p></div>
          )}
          {emptySectors > 0 && bySector.length > 0 && (
            <p className="text-xs mt-2" style={{ color: 'var(--sh-text-faint)' }}>{emptySectors} {emptySectors === 1 ? 'setor sem itens' : 'setores sem itens'} não aparecem aqui.</p>
          )}
        </>
      )}

      {view === 'reparos' && !error && (
        <>
          <div className="flex gap-2 flex-wrap mb-3">
            <div className="flex gap-1" role="tablist" aria-label="Situação do reparo">
              <button type="button" role="tab" aria-selected={rFilter === 'abertos'} className={`sh-btn ${rFilter === 'abertos' ? 'sh-btn-primary' : 'sh-btn-secondary'}`} style={chip} onClick={() => setRFilter('abertos')}>Em aberto</button>
              <button type="button" role="tab" aria-selected={rFilter === 'concluidos'} className={`sh-btn ${rFilter === 'concluidos' ? 'sh-btn-primary' : 'sh-btn-secondary'}`} style={chip} onClick={() => setRFilter('concluidos')}>Concluídos</button>
            </div>
            <select className="inv-input" style={{ flex: '1 1 10rem' }} value={rSector} onChange={(e) => setRSector(e.target.value)} aria-label="Setor">
              <option value="">Todos os setores</option>
              {repairSectors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>

          {repairList.length > 0 && (
            <p className="text-xs mb-2" style={{ color: 'var(--sh-text-muted)' }}>
              {repairList.length} {repairList.length === 1 ? 'reparo' : 'reparos'}{listCost > 0 ? ` · custo ${formatCurrency(listCost)}` : ''}
            </p>
          )}
          {!fetching && repairList.length === 0 && (
            <div className="sh-card"><p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>{rFilter === 'abertos' ? 'Nenhum item em reparo.' : 'Nenhum reparo concluído.'}</p></div>
          )}

          <ul className="flex flex-col gap-2">
            {repairList.map((r) => {
              const img = r.inv_items ? photoUrl(r.inv_items.photo_path, r.inv_items.updated_at) : null;
              return (
                <li key={r.id}>
                  <button type="button" className="sh-card flex items-start gap-3 text-left w-full" style={{ padding: '0.75rem' }} onClick={() => setItemId(r.item_id)}>
                    <span className="inv-soft flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}>
                      {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={20} />}
                    </span>
                    <span className="flex flex-col min-w-0" style={{ flex: 1, gap: 2 }}>
                      <span className="font-bold" style={{ overflowWrap: 'anywhere' }}>{r.inv_items?.name ?? 'Item'}</span>
                      <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{sectorMap.get(r.sector_id)?.name ?? ''}</span>
                      <span className="text-sm" style={{ overflowWrap: 'anywhere' }}>{r.description}</span>
                      <span className="text-xs font-bold" style={{ color: r.closed_at ? '#15803d' : '#b91c1c' }}>
                        <Wrench size={12} style={{ display: 'inline', marginRight: 4 }} />
                        {r.closed_at ? `Concluído em ${fmtDate(r.closed_at)}` : `Aberto em ${fmtDate(r.opened_at)}`}
                        {r.cost != null ? ` · ${formatCurrency(Number(r.cost))}` : ''}
                      </span>
                      {r.closed_at && r.notes && <span className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>{r.notes}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {repairs.length >= 500 && <p className="text-xs mt-2" style={{ color: 'var(--sh-text-faint)' }}>Mostrando os 500 reparos mais recentes.</p>}
        </>
      )}

      <p className="text-xs mt-4" style={{ color: 'var(--sh-text-faint)', overflowWrap: 'anywhere' }}>{user?.email} · Versão {APP_VERSION}</p>

      {itemId && <ItemDetail key={itemId} itemId={itemId} onClose={() => setItemId(null)} onChanged={reload} />}
    </div>
  );
}
