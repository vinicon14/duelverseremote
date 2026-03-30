/**
 * DuelVerse - TCG Context Provider
 * Sistema de perfis multi-TCG
 * 
 * Gerencia o perfil ativo do usuário e o TCG selecionado.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TcgType = 'yugioh' | 'magic' | 'pokemon';

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
}

interface TcgContextType {
  activeTcg: TcgType;
  activeProfile: TcgProfile | null;
  profiles: TcgProfile[];
  setActiveTcg: (tcg: TcgType) => void;
  switchProfile: (profileId: string) => void;
  createProfile: (tcg: TcgType, username: string) => Promise<boolean>;
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
    const saved = localStorage.getItem('activeTcg');
    return (saved as TcgType) || 'yugioh';
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
        tcg_type: p.tcg_type as TcgType
      }));
      setProfiles(mapped);

      // Set active profile based on saved TCG
      const savedTcg = localStorage.getItem('activeTcg') || 'yugioh';
      const match = mapped.find(p => p.tcg_type === savedTcg) || mapped[0];
      if (match) {
        setActiveProfile(match);
        setActiveTcgState(match.tcg_type);
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
    setActiveTcgState(tcg);
    localStorage.setItem('activeTcg', tcg);
    const match = profiles.find(p => p.tcg_type === tcg);
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

    await fetchProfiles();
    setActiveTcg(tcg);
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
