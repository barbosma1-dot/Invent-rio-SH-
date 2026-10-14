import { create } from 'zustand';
import { supabase } from './lib/supabase';

export interface Mission { id: string; name: string; regional_id?: string | null }
export interface Regional { id: string; name: string }
export interface Sector { id: string; mission_id: string; name: string; active: boolean }
export interface AccessRow {
  mission_id: string;
  sector_id: string | null;
  access: 'gestor' | 'coordenador' | 'membro';
}

const K_MISSION = 'inv.mission';
const K_SECTOR = 'inv.sector';

function readLS(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}
function writeLS(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sem armazenamento: segue sem lembrar */ }
}

interface ScopeState {
  loaded: boolean;
  loading: boolean;
  error: string;
  isAdmin: boolean;
  missions: Mission[];
  regionals: Regional[];
  sectors: Sector[];
  access: AccessRow[];
  missionId: string;
  sectorId: string; // '' = todos os setores da missão
  missionNotice: string; // aviso quando a missão lembrada deixou de existir
  clearMissionNotice: () => void;
  load: (userId: string, force?: boolean) => Promise<void>;
  setMission: (id: string) => void;
  setSector: (id: string) => void;
  canEditSector: (sectorId: string) => boolean;
  reset: () => void;
}

export const useScope = create<ScopeState>((set, get) => ({
  loaded: false,
  loading: false,
  error: '',
  isAdmin: false,
  missions: [],
  regionals: [],
  sectors: [],
  access: [],
  missionId: '',
  sectorId: '',
  missionNotice: '',
  clearMissionNotice: () => set({ missionNotice: '' }),

  load: async (userId, force = false) => {
    if (!supabase) return;
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true, error: '' });

    const [p, a, m, s, r] = await Promise.all([
      supabase.from('inv_profiles').select('is_admin').eq('id', userId).maybeSingle(),
      supabase.from('inv_access').select('mission_id,sector_id,access').eq('user_id', userId),
      supabase.from('inv_missions').select('*').eq('active', true).order('name'),
      // traz também os setores desativados no Wop: itens antigos continuam com o nome do setor
      supabase.from('inv_sectors').select('id,mission_id,name,active').order('name'),
      supabase.from('inv_regionals').select('id,name').order('name'), // pode não existir ainda: erro é ignorado
    ]);

    const err = p.error || a.error || m.error || s.error;
    if (err) {
      set({ loading: false, loaded: false, error: err.message });
      return;
    }

    const missions = (m.data ?? []) as Mission[];
    const sectors = (s.data ?? []) as Sector[];
    const access = (a.data ?? []) as AccessRow[];

    const regionals = (r.error ? [] : (r.data ?? [])) as Regional[];
    // Lista todas as missões ativas (mesmo sem setor ainda).
    const list = missions;

    const wanted = get().missionId || readLS(K_MISSION);
    let missionId = wanted;
    let missionNotice = '';
    if (!list.some((x) => x.id === missionId)) {
      missionId = list[0]?.id ?? '';
      if (wanted && missionId) {
        missionNotice = 'A missão que você estava usando não está mais disponível. Mostrando ' + (list[0]?.name ?? '') + '.';
      }
    }
    if (missionId) writeLS(K_MISSION, missionId);
    let sectorId = get().sectorId || readLS(K_SECTOR);
    if (!sectors.some((x) => x.id === sectorId && x.mission_id === missionId)) sectorId = '';

    set({
      loading: false,
      loaded: true,
      isAdmin: !!p.data?.is_admin,
      missions: list,
      regionals,
      sectors,
      access,
      missionId,
      sectorId,
      missionNotice,
    });
  },

  setMission: (id) => {
    writeLS(K_MISSION, id);
    writeLS(K_SECTOR, '');
    set({ missionId: id, sectorId: '', missionNotice: '' });
  },

  setSector: (id) => {
    writeLS(K_SECTOR, id);
    set({ sectorId: id });
  },

  // Espelha as regras do banco (o banco é quem decide de verdade).
  canEditSector: (sectorId) => {
    const { isAdmin, sectors, access } = get();
    if (isAdmin) return true;
    const sector = sectors.find((x) => x.id === sectorId);
    if (!sector) return false;
    return access.some(
      (r) =>
        r.mission_id === sector.mission_id &&
        (r.access === 'gestor' || (r.access === 'coordenador' && r.sector_id === sectorId)),
    );
  },

  reset: () =>
    set({
      loaded: false, loading: false, error: '', isAdmin: false,
      missions: [], regionals: [], sectors: [], access: [], missionId: '', sectorId: '', missionNotice: '',
    }),
}));
