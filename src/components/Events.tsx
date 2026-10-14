import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Inbox } from 'lucide-react';
import { PageHeader } from '../kit';
import { supabase } from '../lib/supabase';
import { EVENT_COLUMNS, loadEventCounts, type EventCounts, type EventFull } from '../lib/events';
import { fmtDate } from '../lib/movements';
import { useScope } from '../scopeStore';
import { EventDetail } from './EventDetail';
import { EventForm } from './EventForm';
import { LoanRequestForm } from './LoanRequestForm';
import { notifyLoansChanged } from './Loans';

type Filter = 'pendentes' | 'todos';

export function Events() {
  const { loaded, missions, sectors, missionId, sectorId, setMission, setSector, canEditSector } = useScope();
  const [events, setEvents] = useState<EventFull[]>([]);
  const [counts, setCounts] = useState<Map<string, EventCounts>>(new Map());
  const [filter, setFilter] = useState<Filter>('todos');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [ask, setAsk] = useState<{ sectorId?: string; eventId?: string } | null>(null);
  const [notice, setNotice] = useState('');

  const missionSectors = useMemo(() => sectors.filter((s) => s.mission_id === missionId && s.active), [sectors, missionId]);
  const sectorName = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);
  const canCreate = sectorId ? canEditSector(sectorId) : missionSectors.some((s) => canEditSector(s.id));

  const reload = useCallback(async () => {
    if (!supabase || !missionId) { setEvents([]); return; }
    setFetching(true); setError('');
    let q = supabase.from('inv_events').select(EVENT_COLUMNS).eq('mission_id', missionId);
    if (sectorId) q = q.eq('sector_id', sectorId);
    const r = await q.order('event_date', { ascending: false, nullsFirst: true }).range(0, 499);
    if (r.error) { setError(r.error.message); setFetching(false); return; }
    const list = (r.data ?? []) as EventFull[];
    setEvents(list);
    setCounts(await loadEventCounts(list.map((e) => e.id)));
    setFetching(false);
  }, [missionId, sectorId]);

  useEffect(() => { if (loaded) reload(); }, [loaded, reload]);

  const visible = useMemo(
    () => (filter === 'pendentes' ? events.filter((e) => (counts.get(e.id)?.open ?? 0) > 0) : events),
    [events, counts, filter],
  );
  const totalPend = useMemo(() => events.reduce((n, e) => n + (counts.get(e.id)?.open ?? 0), 0), [events, counts]);

  if (!loaded) {
    return <div className="sh-page"><PageHeader title="Eventos" /><p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p></div>;
  }
  if (missions.length === 0) {
    return (
      <div className="sh-page">
        <PageHeader title="Eventos" subtitle="Materiais separados para cada evento." />
        <div className="sh-card"><p className="font-extrabold">Você ainda não tem acesso a nenhum inventário.</p></div>
      </div>
    );
  }

  return (
    <div className="sh-page">
      <PageHeader
        title="Eventos"
        subtitle={sectorId ? sectorName.get(sectorId) : 'Todos os setores da missão'}
        primary={canCreate ? { label: 'Novo evento', onClick: () => setFormOpen(true) } : undefined}
      />

      <div className="flex gap-2 flex-wrap mb-3">
        <select className="inv-input" style={{ flex: '1 1 12rem' }} value={missionId} onChange={(e) => setMission(e.target.value)} aria-label="Missão">
          {missions.map((m) => <option key={m.id} value={m.id}>{m.name.trim()}</option>)}
        </select>
        <select className="inv-input" style={{ flex: '1 1 12rem' }} value={sectorId} onChange={(e) => setSector(e.target.value)} aria-label="Setor">
          <option value="">Todos os setores</option>
          {missionSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="flex gap-1 flex-wrap mb-3" role="tablist" aria-label="Filtro">
        <button type="button" role="tab" aria-selected={filter === 'todos'} className={`sh-btn ${filter === 'todos' ? 'sh-btn-primary' : 'sh-btn-secondary'}`}
          style={{ minHeight: 36, padding: '0 0.7rem', fontSize: '0.8rem' }} onClick={() => setFilter('todos')}>Todos</button>
        <button type="button" role="tab" aria-selected={filter === 'pendentes'} className={`sh-btn ${filter === 'pendentes' ? 'sh-btn-primary' : 'sh-btn-secondary'}`}
          style={{ minHeight: 36, padding: '0 0.7rem', fontSize: '0.8rem' }} onClick={() => setFilter('pendentes')}>
          Com pendência{totalPend ? ` (${totalPend})` : ''}
        </button>
      </div>

      <button type="button" className="sh-btn sh-btn-secondary mb-3" style={{ minHeight: 40 }} onClick={() => setAsk({ sectorId: sectorId || undefined })}>
        <Inbox size={18} /> Pedir itens de outro setor
      </button>
      {notice && <p className="text-sm font-bold mb-3" style={{ color: 'var(--sh-primary)' }}>{notice}</p>}

      {error && <p className="inv-error mb-3" role="alert">{error}</p>}
      {fetching && events.length === 0 && <p style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>}
      {!fetching && !error && visible.length === 0 && (
        <div className="sh-card">
          <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>
            {filter === 'pendentes' ? 'Nenhum evento com item pendente de volta.' : canCreate ? 'Nenhum evento ainda. Use "Novo evento".' : 'Nenhum evento cadastrado.'}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visible.map((e) => {
          const c = counts.get(e.id) ?? { total: 0, open: 0, overdue: 0 };
          return (
            <li key={e.id} className="sh-card" style={{ padding: 0 }}>
              <button type="button" className="flex items-start gap-3 text-left w-full" style={{ padding: '0.75rem', background: 'none', border: 0, color: 'inherit' }} onClick={() => setSelected(e.id)}>
                <span className="inv-soft flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, color: 'var(--sh-primary)' }}>
                  <CalendarDays size={22} />
                </span>
                <span className="flex flex-col min-w-0" style={{ flex: 1, gap: 2 }}>
                  <span className="font-bold" style={{ overflowWrap: 'anywhere' }}>{e.name}</span>
                  <span className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>
                    {[
                      !sectorId ? sectorName.get(e.sector_id) : null,
                      e.event_date ? fmtDate(e.event_date) + (e.end_date && e.end_date !== e.event_date ? ' a ' + fmtDate(e.end_date) : '') : 'sem data',
                    ].filter(Boolean).join(' · ')}
                  </span>
                  <span className="text-xs font-bold" style={{ color: c.overdue ? '#b91c1c' : c.open ? '#b45309' : c.total ? '#15803d' : 'var(--sh-text-muted)' }}>
                    {c.total === 0 ? 'Nenhum item separado'
                      : c.open === 0 ? `${c.total} ${c.total === 1 ? 'item' : 'itens'} · tudo voltou`
                      : `${c.total - c.open} de ${c.total} voltaram · ${c.open} ${c.open === 1 ? 'pendente' : 'pendentes'}${c.overdue ? ` (${c.overdue} atrasado${c.overdue > 1 ? 's' : ''})` : ''}`}
                  </span>
                </span>
              </button>
              <div style={{ padding: '0 0.75rem 0.75rem' }}>
                <button type="button" className="sh-btn sh-btn-secondary" style={{ minHeight: 36, fontSize: '0.8rem' }} onClick={() => setAsk({ sectorId: e.sector_id, eventId: e.id })}>
                  <Inbox size={16} /> Pedir itens para este evento
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <EventForm
        open={formOpen}
        defaultSectorId={sectorId}
        onClose={() => setFormOpen(false)}
        onSaved={(ev) => { setFormOpen(false); reload(); setSelected(ev.id); }}
      />

      <LoanRequestForm
        key={`${ask?.sectorId ?? ''}-${ask?.eventId ?? ''}`}
        open={!!ask}
        fixedSectorId={ask?.sectorId}
        fixedEventId={ask?.eventId}
        onClose={() => setAsk(null)}
        onDone={(msg) => { setAsk(null); setNotice(msg); reload(); notifyLoansChanged(); }}
      />

      {selected && <EventDetail key={selected} eventId={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  );
}
