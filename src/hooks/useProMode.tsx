import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProModeContextType {
  isProMode: boolean;
  setProMode: (value: boolean) => void;
  checkProStatus: () => Promise<boolean>;
}

const ProModeContext = createContext<ProModeContextType | undefined>(undefined);

const PRO_MODE_KEY = 'duelverse_pro_mode';

export const ProModeProvider = ({ children }: { children: ReactNode }) => {
  const [isProMode, setIsProMode] = useState(false);

  // Carregar estado inicial do localStorage
  useEffect(() => {
    const stored = localStorage.getItem(PRO_MODE_KEY);
    if (stored) {
      setIsProMode(stored === 'true');
    }
  }, []);

  // Salvar no localStorage quando mudar
  const setProMode = (value: boolean) => {
    setIsProMode(value);
    localStorage.setItem(PRO_MODE_KEY, value ? 'true' : 'false');
  };

  // Verificar status PRO no banco
  const checkProStatus = async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setProMode(false);
        return false;
      }

      const { data } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('user_id', session.user.id)
        .single();

      const isPro = data?.account_type === 'pro';
      setProMode(isPro);
      return isPro;
    } catch {
      setProMode(false);
      return false;
    }
  };

  // Verificar ao montar o componente
  useEffect(() => {
    checkProStatus();

    // Listener para mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkProStatus();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ProModeContext.Provider value={{ isProMode, setProMode, checkProStatus }}>
      {children}
    </ProModeContext.Provider>
  );
};

export const useProMode = () => {
  const context = useContext(ProModeContext);
  if (context === undefined) {
    throw new Error('useProMode must be used within a ProModeProvider');
  }
  return context;
};
