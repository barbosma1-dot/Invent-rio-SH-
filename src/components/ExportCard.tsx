import { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { useScope } from '../scopeStore';
import { buildExport, download, exportFileName, type ExportKind } from '../lib/export';

const KINDS: { id: ExportKind; label: string; hint: string }[] = [
  { id: 'itens', label: 'Itens', hint: 'Inventário completo: situação, local, valor e observações.' },
  { id: 'movimentos', label: 'Movimentos', hint: 'Entradas, saídas e retornos.' },
  { id: 'reparos', label: 'Reparos', hint: 'Reparos abertos e concluídos, com custo.' },
];

/** Exporta para planilha (CSV, abre no Excel e no Google Planilhas). Só sai o que a pessoa já pode ver. */
export function ExportCard() {
  const { missions, sectors, missionId: scopeMission } = useScope();
  const [missionId, setMissionId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const mid = missionId || scopeMission;
  const missionSectors = useMemo(() => sectors.filter((s) => s.mission_id === mid), [sectors, mid]);
  const sectorNames = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);

  async function run(kind: ExportKind) {
    if (busy || !mid) return;
    setBusy(kind); setMsg(''); setErr('');
    try {
      const { csv, count } = await buildExport(kind, { missionId: mid, sectorId, sectorNames });
      if (count === 0) { setMsg('Nada para exportar neste filtro.'); }
      else {
        download(exportFileName(kind, missions.find((m) => m.id === mid)?.name ?? '', sectorId ? (sectorNames.get(sectorId) ?? '') : ''), csv);
        setMsg(`${count} ${count === 1 ? 'linha exportada' : 'linhas exportadas'}. Abra o arquivo no Excel ou no Google Planilhas.`);
      }
    } catch (e: any) { setErr(e?.message ?? 'Não consegui exportar.'); }
    setBusy(null);
  }

  if (missions.length === 0) return null;
  return (
    <div className="sh-card mb-4">
      <p className="inv-label mb-3">Exportar para planilha</p>
      <div className="flex flex-col gap-2 mb-3">
        {missions.length > 1 && (
          <select className="inv-input" value={mid} onChange={(e) => { setMissionId(e.target.value); setSectorId(''); }} aria-label="Missão">
            {missions.map((m) => <option key={m.id} value={m.id}>{m.name.trim()}</option>)}
          </select>
        )}
        <select className="inv-input" value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Setor">
          <option value="">Todos os setores</option>
          {missionSectors.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (inativo)'}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className="sh-btn sh-btn-secondary" style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '0.6rem 0.9rem' }} disabled={!!busy} onClick={() => run(k.id)}>
            <FileDown size={18} style={{ flexShrink: 0 }} />
            <span className="flex flex-col">
              <span className="font-bold">{busy === k.id ? 'Gerando…' : `Baixar ${k.label}`}</span>
              <span className="text-xs" style={{ color: 'var(--sh-text-muted)', fontWeight: 400 }}>{k.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--sh-text-faint)' }}>Sem telefones, e-mails ou fotos. Sai só o que o seu acesso permite ver.</p>
      {msg && <p className="text-sm font-bold mt-2" style={{ color: 'var(--sh-primary)' }}>{msg}</p>}
      {err && <p className="inv-error mt-2" role="alert">{err}</p>}
    </div>
  );
}
