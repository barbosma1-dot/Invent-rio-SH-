import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

// T1: guarda só a sessão. Perfil, missão e setor entram na T2/T3.
interface SessionState {
  user: User | null;
  ready: boolean;
  init: () => () => void;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  ready: false,

  init: () => {
    if (!supabase) {
      set({ ready: true });
      return () => {};
    }
    supabase.auth.getSession().then(({ data }) => {
      set({ user: data.session?.user ?? null, ready: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, ready: true });
    });
    return () => data.subscription.unsubscribe();
  },

  signOut: async () => {
    await supabase?.auth.signOut();
    set({ user: null });
  },
}));
