import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useScope } from '../scopeStore';

type Level = 'gestor' | 'coordenador' | 'membro';
interface Row { id: string; user_id: string; user_name: string; user_email: string; access: Level; sector_id: string | null; source: string }
interface Cand { id: string; name: string; email: string }

const LEVEL_LABEL: Record<Level, string> = { gestor: 'Gestor da missão', coordenador: 'Coordenador', membro: 'Membro' };
const LEVEL_HINT: Record<Level, string> = {
  gestor: 'Vê e edita a missão inteira.',
  coordenador: 'Edita o setor e autoriza empréstimos dele.',
  membro: 'Consulta e registra saída e retorno no setor.',
};

/** Dar acesso a pessoas que já entraram no app (coordenador e membro de setor; gestor só o admin). */
export function AccessCard() {
  const { isAdmin, access, missions, sectors, missionId: scopeMission } = useScope();
  const [missionId, setMissionId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [cands, setCands] = useState<Cand[]>([]);
  const [picked, setPicked] = useState<Cand | null>(null);
  const [level, setLevel] = useState<Level>('membro');
  const [sectorId, setSectorId] = useState('');
  const [busy, setBusy] = useState(false);

  const mid = missionId || scopeMission;
  const activeSectors = useMemo(() => sectors.filter((s) => s.mission_id === mid && s.active), [sectors, mid]);
  const sectorNames = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);

  const isMissionGestor = useMemo(() => access.some((a) => a.mission_id === mid && a.access === 'gestor'), [access, mid]);
  const canMission = isAdmin || isMissionGestor;
  const canCoordSomewhere = access.some((a) => a.mission_id === mid && a.access === 'coordenador');
  const allowed = isAdmin || canMission || canCoordSomewhere;

  // Níveis que esta pessoa pode conceder (o banco confere de novo)
  const levels: Level[] = useMemo(() => {
    const l: Level[] = ['membro'];
    if (canMission) l.unshift('coordenador');
    if (isAdmin) l.unshift('gestor');
    return l;
  }, [canMission, isAdmin]);

  // Setores onde esta pessoa pode dar acesso
  const grantSectors = useMemo(() => {
    if (canMission) return activeSectors;
    const mine = new Set(access.filter((a) => a.mission_id === mid && a.access === 'coordenador').map((a) => a.sector_id));
    return activeSectors.filter((s) => mine.has(s.id));
  }, [activeSectors, access, canMission, mid]);

  const load = useCallback(async () => {
    if (!supabase || !mid || !allowed) return;
    setLoading(true); setErr('');
    const { data, error } = await supabase.rpc('inv_access_list', { p_mission: mid });
    if (error) setErr(error.message); else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [mid, allowed]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!levels.includes(level)) setLevel(levels[levels.length - 1]); }, [levels, level]);
  useEffect(() => { setSectorId(''); setPicked(null); setQ(''); setCands([]); }, [mid]);

  // Busca de pessoas (a partir de 3 letras)
  useEffect(() => {
    if (!supabase || picked || q.trim().length < 3) { setCands([]); return; }
    const t = setTimeout(async () => {
      const { data, error } = await supabase!.rpc('inv_access_candidates', { p_search: q.trim() });
      if (!error) setCands((data ?? []) as Cand[]);
    }, 300);
    return () => clearTimeout(t);
  }, [q, picked]);

  async function grant() {
    if (!supabase || !picked || busy) return;
    if (level !== 'gestor' && !sectorId) { setErr('Escolha o setor.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.rpc('inv_access_grant', {
      p_user: picked.id, p_mission: mid, p_sector: level === 'gestor' ? null : sectorId, p_access: level,
    });
    if (error) setErr(error.message);
    else {
      setMsg(`${picked.name} agora é ${LEVEL_LABEL[level].toLowerCase()}${level === 'gestor' ? '' : ' em ' + (sectorNames.get(sectorId) ?? 'setor')}.`);
      setPicked(null); setQ(''); setCands([]);
      await load();
    }
    setBusy(false);
  }

  async function revoke(r: Row) {
    if (!supabase || busy) return;
    if (!window.confirm(`Remover o acesso de ${r.user_name}?`)) return;
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.rpc('inv_access_revoke', { p_id: r.id });
    if (error) setErr(error.message); else { setMsg('Acesso removido.'); await load(); }
    setBusy(false);
  }

  if (!allowed || missions.length === 0) return null;

  const gestores = rows.filter((r) => r.sector_id === null);
  const bySector = new Map<string, Row[]>();
  rows.filter((r) => r.sector_id).forEach((r) => bySector.set(r.sector_id!, [...(bySector.get(r.sector_id!) ?? []), r]));

  const renderRow = (r: Row) => (
    <div key={r.id} className="flex items-center gap-2 py-2" style={{ borderTop: '1px solid var(--sh-border)' }}>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>{r.user_name}</p>
        <p className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>
          {LEVEL_LABEL[r.access]} · {r.source === 'local' ? 'dado aqui' : 'vem do Wop'}
        </p>
      </div>
      {r.source === 'local' && (
        <button type="button" className="sh-btn sh-btn-secondary" aria-label={`Remover ${r.user_name}`} disabled={busy} onClick={() => revoke(r)}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );

  return (
    <div className="sh-card mb-4">
      <p className="inv-label mb-1">Acessos da equipe</p>
      <p className="text-xs mb-3" style={{ color: 'var(--sh-text-faint)' }}>
        A pessoa precisa ter entrado no app ao menos uma vez (login) para aparecer na busca.
      </p>

      {missions.length > 1 && (
        <select className="inv-input mb-3" value={mid} onChange={(e) => setMissionId(e.target.value)} aria-label="Missão">
          {missions.map((m) => <option key={m.id} value={m.id}>{m.name.trim()}</option>)}
        </select>
      )}

      {/* Dar acesso */}
      <div className="flex flex-col gap-2 mb-3">
        {picked ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ overflowWrap: 'anywhere' }}>{picked.name}</p>
              <p className="text-xs" style={{ color: 'var(--sh-text-muted)', overflowWrap: 'anywhere' }}>{picked.email}</p>
            </div>
            <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setPicked(null)}>Trocar</button>
          </div>
        ) : (
          <>
            <input className="inv-input" placeholder="Buscar pessoa por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
            {q.trim().length >= 3 && cands.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Ninguém encontrado. A pessoa já entrou no app?</p>
            )}
            {cands.map((c) => (
              <button key={c.id} type="button" className="sh-btn sh-btn-secondary" style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '0.5rem 0.9rem' }} onClick={() => { setPicked(c); setCands([]); }}>
                <span className="flex flex-col">
                  <span className="font-bold">{c.name}</span>
                  <span className="text-xs" style={{ color: 'var(--sh-text-muted)', fontWeight: 400, overflowWrap: 'anywhere' }}>{c.email}</span>
                </span>
              </button>
            ))}
          </>
        )}

        {picked && (
          <>
            <select className="inv-input" value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Nível de acesso">
              {levels.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select>
            <p className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>{LEVEL_HINT[level]}</p>
            {level !== 'gestor' && (
              <select className="inv-input" value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Setor">
                <option value="">Escolha o setor…</option>
                {grantSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button type="button" className="sh-btn sh-btn-primary" disabled={busy} onClick={grant}>
              <UserPlus size={18} /> {busy ? 'Salvando…' : 'Dar acesso'}
            </button>
          </>
        )}
      </div>

      {err && <p className="text-sm mb-2" style={{ color: 'var(--sh-danger, #dc2626)' }}>{err}</p>}
      {msg && <p className="text-sm mb-2" style={{ color: 'var(--sh-text-muted)' }}>{msg}</p>}

      {/* Quem já tem acesso */}
      {loading && <p className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Carregando…</p>}
      {!loading && rows.length === 0 && <p className="text-xs" style={{ color: 'var(--sh-text-muted)' }}>Ninguém com acesso listado nesta missão.</p>}
      {gestores.length > 0 && (
        <div className="mb-2">
          <p className="inv-label mt-2">Gestores da missão</p>
          {gestores.map(renderRow)}
        </div>
      )}
      {[...bySector.entries()].map(([sid, list]) => (
        <div key={sid} className="mb-2">
          <p className="inv-label mt-2">{sectorNames.get(sid) ?? 'Setor'}</p>
          {list.map(renderRow)}
        </div>
      ))}
    </div>
  );
}
