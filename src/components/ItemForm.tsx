import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Camera, ImageOff, Plus } from 'lucide-react';
import { Modal, ModalActions } from '../kit';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image';
import { locationPath, parseMoney, photoUrl, uploadItemPhoto, type Item, type Loc } from '../lib/items';
import { useScope } from '../scopeStore';
import { useSession } from '../store';

const FORM_ID = 'item-form';

/** Escolha do local de guarda em níveis (sala > armário > prateleira) com criação na hora. */
function LocationPicker({
  locs, sectorId, value, onChange, onCreated,
}: {
  locs: Loc[]; sectorId: string; value: string | null;
  onChange: (id: string | null) => void; onCreated: (l: Loc) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [where, setWhere] = useState<'inside' | 'beside' | 'root'>('root');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(locs.map((l) => [l.id, l])), [locs]);
  const childrenOf = (parent: string | null) =>
    locs.filter((l) => (l.parent_id ?? null) === parent).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  // cadeia da raiz até o local escolhido
  const chain: string[] = [];
  let cur = value ? byId.get(value) : undefined;
  let guard = 0;
  while (cur && guard++ < 20) {
    chain.unshift(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }

  const levels: { parent: string | null; selected: string }[] = [];
  for (let i = 0; i <= chain.length; i++) {
    const parent = i === 0 ? null : chain[i - 1];
    if (childrenOf(parent).length === 0) break;
    levels.push({ parent, selected: chain[i] ?? '' });
  }

  const selected = value ? byId.get(value) : undefined;

  function openAdd() {
    setWhere(selected ? 'inside' : 'root');
    setName('');
    setErr('');
    setAdding(true);
  }

  async function create() {
    if (!supabase || !name.trim()) return;
    setBusy(true);
    setErr('');
    const parent_id = where === 'root' ? null : where === 'inside' ? (selected?.id ?? null) : (selected?.parent_id ?? null);
    const { data, error } = await supabase
      .from('inv_locations')
      .insert({ sector_id: sectorId, parent_id, name: name.trim(), sort_order: childrenOf(parent_id).length })
      .select('id,sector_id,parent_id,name,sort_order')
      .single();
    setBusy(false);
    if (error || !data) { setErr(error?.message ?? 'Não foi possível criar o local.'); return; }
    onCreated(data as Loc);
    onChange((data as Loc).id);
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {levels.map((lv, i) => (
        <select
          key={`${lv.parent ?? 'root'}-${i}`}
          className="inv-input"
          value={lv.selected}
          onChange={(e) => onChange(e.target.value || lv.parent)}
          aria-label={`Local, nível ${i + 1}`}
        >
          <option value="">{i === 0 ? '— sem local definido —' : '— escolha mais um nível (opcional) —'}</option>
          {childrenOf(lv.parent).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      ))}
      {levels.length === 0 && !adding && (
        <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Este setor ainda não tem locais cadastrados.</p>
      )}

      {!adding ? (
        <button type="button" className="sh-btn sh-btn-secondary" onClick={openAdd}>
          <Plus size={16} /> Novo local
        </button>
      ) : (
        <div className="sh-card flex flex-col gap-2" style={{ padding: '0.75rem' }}>
          <input className="inv-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Sala 2, Armário azul)" maxLength={80} />
          <select className="inv-input" value={where} onChange={(e) => setWhere(e.target.value as typeof where)}>
            {selected && <option value="inside">Dentro de «{locationPath(locs, selected.id)}»</option>}
            {selected?.parent_id && <option value="beside">Ao lado, em «{locationPath(locs, selected.parent_id)}»</option>}
            <option value="root">No nível principal (ex.: uma sala)</option>
          </select>
          {err && <p className="inv-error">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setAdding(false)} disabled={busy}>Cancelar</button>
            <button type="button" className="sh-btn sh-btn-primary" onClick={create} disabled={busy || !name.trim()}>Criar local</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ItemForm({
  open, onClose, onSaved, item, defaultSectorId, categories,
}: {
  open: boolean; onClose: () => void; onSaved: (id: string, warning?: string) => void;
  item?: Item | null; defaultSectorId?: string; categories: string[];
}) {
  const user = useSession((s) => s.user);
  const { sectors, missionId, canEditSector } = useScope();
  const editableSectors = useMemo(
    () => sectors.filter((s) => s.active && s.mission_id === missionId && canEditSector(s.id)),
    [sectors, missionId, canEditSector],
  );

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState('');
  const [valueText, setValueText] = useState('');
  const [valueKind, setValueKind] = useState<'compra' | 'estimado'>('compra');
  const [acquiredAt, setAcquiredAt] = useState('');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // preenche ao abrir
  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setPhotoFile(null);
    if (item) {
      setName(item.name);
      setCategory(item.category ?? '');
      setDescription(item.description ?? '');
      setSectorId(item.sector_id);
      setLocationId(item.location_id);
      setLocationNote(item.location_note ?? '');
      setValueText(item.value != null ? String(item.value).replace('.', ',') : '');
      setValueKind(item.value_kind ?? 'compra');
      setAcquiredAt(item.acquired_at ?? '');
      setNotes(item.notes ?? '');
      setPreview(photoUrl(item.photo_path, item.updated_at));
    } else {
      setName(''); setCategory(''); setDescription('');
      const first = editableSectors.find((s) => s.id === defaultSectorId) ?? editableSectors[0];
      setSectorId(first?.id ?? '');
      setLocationId(null); setLocationNote('');
      setValueText(''); setValueKind('compra'); setAcquiredAt(''); setNotes('');
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  // locais do setor escolhido
  useEffect(() => {
    if (!open || !sectorId || !supabase) { setLocs([]); return; }
    let alive = true;
    supabase
      .from('inv_locations')
      .select('id,sector_id,parent_id,name,sort_order')
      .eq('sector_id', sectorId)
      .then(({ data }) => { if (alive) setLocs((data ?? []) as Loc[]); });
    return () => { alive = false; };
  }, [open, sectorId]);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function changeSector(id: string) {
    setSectorId(id);
    setLocationId(null); // local pertence a um setor
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setError('');
    if (!name.trim()) { setError('Dê um nome ao item.'); return; }
    if (!sectorId) { setError('Escolha o setor.'); return; }
    const money = parseMoney(valueText);
    if (money !== null && Number.isNaN(money)) { setError('Valor inválido. Use números, por exemplo 49,90.'); return; }

    setBusy(true);
    const payload = {
      name: name.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
      location_id: locationId,
      location_note: locationNote.trim() || null,
      value: money,
      value_kind: money === null ? null : valueKind,
      acquired_at: acquiredAt || null,
      notes: notes.trim() || null,
    };

    try {
      let saved: { id: string; mission_id: string; sector_id: string };
      if (item) {
        const { data, error: err } = await supabase
          .from('inv_items').update(payload).eq('id', item.id)
          .select('id,mission_id,sector_id').single();
        if (err || !data) throw new Error(err?.message ?? 'Não foi possível salvar.');
        saved = data;
      } else {
        const id = crypto.randomUUID();
        const sector = sectors.find((s) => s.id === sectorId);
        const { data, error: err } = await supabase
          .from('inv_items')
          .insert({ id, sector_id: sectorId, mission_id: sector?.mission_id ?? missionId, ...payload })
          .select('id,mission_id,sector_id').single();
        if (err || !data) throw new Error(err?.message ?? 'Não foi possível salvar.');
        saved = data;
      }

      if (photoFile) {
        try {
          const blob = await compressImage(photoFile);
          const path = await uploadItemPhoto(saved, blob);
          const { error: perr } = await supabase.from('inv_items').update({ photo_path: path }).eq('id', saved.id);
          if (perr) throw new Error(perr.message);
        } catch (pe) {
          // o item já foi salvo; só a foto falhou
          setBusy(false);
          onSaved(saved.id, `O item foi salvo, mas a foto não subiu: ${(pe as Error).message} Abra o item, toque em Editar e tente a foto de novo.`);
          return;
        }
      }
      setBusy(false);
      onSaved(saved.id);
    } catch (ex) {
      setBusy(false);
      setError((ex as Error).message);
    }
  }

  const sectorName = sectors.find((s) => s.id === sectorId)?.name ?? '';

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={item ? 'Editar item' : 'Novo item'}
      size="lg"
      footer={<ModalActions onCancel={onClose} formId={FORM_ID} confirmLabel={item ? 'Salvar' : 'Cadastrar'} loading={busy} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        {/* foto */}
        <div className="flex items-center gap-3">
          <div
            className="inv-soft flex items-center justify-center"
            style={{ width: 96, height: 96, borderRadius: 16, overflow: 'hidden', flexShrink: 0, color: 'var(--sh-text-muted)' }}
          >
            {preview
              ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <ImageOff size={28} />}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="sh-btn sh-btn-secondary" style={{ cursor: 'pointer' }}>
              <Camera size={16} /> {preview ? 'Trocar foto' : 'Tirar / escolher foto'}
              <input
                type="file" accept="image/*" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotoFile(f); e.target.value = ''; }}
              />
            </label>
            <span className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>A foto é reduzida antes de enviar.</span>
          </div>
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="it-name">Nome *</label>
          <input id="it-name" className="inv-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="it-cat">Categoria</label>
          <input id="it-cat" className="inv-input" list="it-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Som, Cozinha, Cadeiras" maxLength={60} />
          <datalist id="it-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="it-sector">Setor *</label>
          {item ? (
            <>
              <input id="it-sector" className="inv-input" value={sectorName} disabled />
              <span className="text-xs" style={{ color: 'var(--sh-text-faint)' }}>O setor não muda depois do cadastro.</span>
            </>
          ) : (
            <select id="it-sector" className="inv-input" value={sectorId} onChange={(e) => changeSector(e.target.value)} required>
              {editableSectors.length === 0 && <option value="">Sem setor para cadastrar</option>}
              {editableSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        <div className="inv-field">
          <span className="inv-label">Onde fica guardado</span>
          {sectorId
            ? <LocationPicker locs={locs} sectorId={sectorId} value={locationId} onChange={setLocationId} onCreated={(l) => setLocs((p) => [...p, l])} />
            : <p className="text-sm" style={{ color: 'var(--sh-text-muted)' }}>Escolha o setor primeiro.</p>}
          <input className="inv-input" value={locationNote} onChange={(e) => setLocationNote(e.target.value)} placeholder="Detalhe do local (opcional)" maxLength={120} />
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="it-val">Valor (R$)</label>
          <div className="flex gap-2">
            <input id="it-val" className="inv-input" inputMode="decimal" value={valueText} onChange={(e) => setValueText(e.target.value)} placeholder="0,00" />
            <select className="inv-input" value={valueKind} onChange={(e) => setValueKind(e.target.value as typeof valueKind)} aria-label="Tipo do valor" style={{ maxWidth: '11rem' }}>
              <option value="compra">Pago na compra</option>
              <option value="estimado">Estimado (doado)</option>
            </select>
          </div>
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="it-date">Data de aquisição</label>
          <input id="it-date" type="date" className="inv-input" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)} />
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="it-desc">Descrição</label>
          <textarea id="it-desc" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 72 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="inv-field">
          <label className="inv-label" htmlFor="it-notes">Observações</label>
          <textarea id="it-notes" className="inv-input" style={{ padding: '0.6rem 0.9rem', minHeight: 72 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="inv-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
