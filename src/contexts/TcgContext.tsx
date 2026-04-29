/**
 * DuelVerse - TCG Context Provider
 * Sistema de perfis multi-TCG
 * 
 * Gerencia o perfil ativo do usuário e o TCG selecionado.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TcgType = 'yugioh' | 'genesis' | 'rush_duel';
type LegacyTcgType = TcgType | 'magic' | 'pokemon';

export const normalizeTcgType = (tcg: string | null | undefined): TcgType => {
  switch (tcg as LegacyTcgType | undefined) {
    case 'genesis':
    case 'magic':
      return 'genesis';
    case 'rush_duel':
    case 'pokemon':
      return 'rush_duel';
    case 'yugioh':
    default:
      return 'yugioh';
  }
};

export interface TcgProfile {
  id: string;
  user_id: string;
  tcg_type: TcgType;
  username: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  points: number;
  level: number;
  xp_total: number;
  xp_level: number;
  xp_last_daily_claim: string | null;
  xp_ads_watched: number;
}

interface TcgContextType {
  activeTcg: TcgType;
  activeProfile: TcgProfile | null;
  profiles: TcgProfile[];
  setActiveTcg: (tcg: TcgType) => void;
  switchProfile: (profileId: string) => void;
  createProfile: (tcg: TcgType, username?: string) => Promise<boolean>;
  refreshProfiles: () => Promise<void>;
  isLoading: boolean;
}

const TcgContext = createContext<TcgContextType | undefined>(undefined);

export const useTcg = () => {
  const ctx = useContext(TcgContext);
  if (!ctx) throw new Error('useTcg must be used within TcgProvider');
  return ctx;
};

export const TcgProvider = ({ children }: { children: ReactNode }) => {
  const [activeTcg, setActiveTcgState] = useState<TcgType>(() => {
    const normalized = normalizeTcgType(localStorage.getItem('activeTcg'));
    localStorage.setItem('activeTcg', normalized);
    return normalized;
  });
  const [activeProfile, setActiveProfile] = useState<TcgProfile | null>(null);
  const [profiles, setProfiles] = useState<TcgProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfiles = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfiles([]);
      setActiveProfile(null);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('tcg_profiles')
      .select('*')
      .eq('user_id', user.id);

    if (!error && data) {
      const mapped = data.map(p => ({
        ...p,
        tcg_type: normalizeTcgType(p.tcg_type),
        xp_total: (p as any).xp_total || 0,
        xp_level: (p as any).xp_level || 1,
        xp_last_daily_claim: (p as any).xp_last_daily_claim || null,
        xp_ads_watched: (p as any).xp_ads_watched || 0,
      }));
      const deduped = Object.values(
        mapped.reduce<Record<TcgType, TcgProfile>>((acc, profile) => {
          const current = acc[profile.tcg_type];
          if (!current || profile.points + profile.wins >= current.points + current.wins) {
            acc[profile.tcg_type] = profile;
          }
          return acc;
        }, {} as Record<TcgType, TcgProfile>)
      );
      setProfiles(deduped);

      // Set active profile based on saved TCG
      const savedTcg = normalizeTcgType(localStorage.getItem('activeTcg'));
      localStorage.setItem('activeTcg', savedTcg);
      const match = deduped.find(p => p.tcg_type === savedTcg) || deduped[0];
      if (match) {
        setActiveProfile(match);
        setActiveTcgState(match.tcg_type);
        localStorage.setItem('activeTcg', match.tcg_type);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProfiles();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchProfiles();
    });

    return () => subscription.unsubscribe();
  }, []);

  const setActiveTcg = (tcg: TcgType) => {
    const normalized = normalizeTcgType(tcg);
    setActiveTcgState(normalized);
    localStorage.setItem('activeTcg', normalized);
    const match = profiles.find(p => p.tcg_type === normalized);
    if (match) setActiveProfile(match);
  };

  const switchProfile = (profileId: string) => {
    const match = profiles.find(p => p.id === profileId);
    if (match) {
      setActiveProfile(match);
      setActiveTcgState(match.tcg_type);
      localStorage.setItem('activeTcg', match.tcg_type);
    }
  };

  const createProfile = async (tcg: TcgType, username?: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Se não receber username, buscar do perfil principal
    let finalUsername = username?.trim();
    if (!finalUsername) {
      const { data: mainProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .maybeSingle();
      finalUsername = mainProfile?.username || user.email?.split('@')[0] || 'Duelista';
    }

    const { error } = await supabase
      .from('tcg_profiles')
      .insert({
        user_id: user.id,
        tcg_type: tcg,
        username: finalUsername,
      });

    if (error) {
      console.error('Error creating TCG profile:', error);
      return false;
    }

    const normalized = normalizeTcgType(tcg);
    localStorage.setItem('activeTcg', normalized);
    setActiveTcgState(normalized);

    // XP de boas-vindas para o novo perfil TCG
    try {
      await (supabase.rpc as any)('award_xp', {
        _tcg_type: normalized,
        _amount: 50,
        _reason: 'welcome_bonus',
      });
    } catch (xpError) {
      console.warn('Welcome XP skipped:', xpError);
    }

    await fetchProfiles();
    return true;
  };

  return (
    <TcgContext.Provider value={{
      activeTcg,
      activeProfile,
      profiles,
      setActiveTcg,
      switchProfile,
      createProfile,
      refreshProfiles: fetchProfiles,
      isLoading
    }}>
      {children}
    </TcgContext.Provider>
  );
};
