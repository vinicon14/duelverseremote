import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Crown } from 'lucide-react';
import { useProMode } from '@/hooks/useProMode';
import NotFound from '@/pages/NotFound';

interface ProGuardProps {
  children: React.ReactNode;
}

// Cache local para evitar verificações excessivas
const PRO_CACHE_KEY = 'duelverse_pro_cache';
const CACHE_DURATION = 5000; // 5 segundos

interface ProCache {
  isPro: boolean;
  timestamp: number;
  userId: string;
}

export const ProGuard = ({ children }: ProGuardProps) => {
  const location = useLocation();
  const { toast } = useToast();
  const { setProMode } = useProMode();
  const [checking, setChecking] = useState(true);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  // Verificar cache local
  const getCachedStatus = useCallback((userId: string): boolean | null => {
    try {
      const cacheData = localStorage.getItem(PRO_CACHE_KEY);
      if (cacheData) {
        const cache: ProCache = JSON.parse(cacheData);
        if (cache.userId === userId && Date.now() - cache.timestamp < CACHE_DURATION) {
          return cache.isPro;
        }
      }
    } catch {
      // Ignore cache errors
    }
    return null;
  }, []);

  // Salvar no cache
  const setCachedStatus = useCallback((userId: string, status: boolean) => {
    try {
      const cache: ProCache = {
        isPro: status,
        timestamp: Date.now(),
        userId
      };
      localStorage.setItem(PRO_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore cache errors
    }
  }, []);

  // Verificar status PRO do usuário
  const checkProStatus = useCallback(async (userId: string, useCache = true): Promise<boolean> => {
    // Verificar cache primeiro
    if (useCache) {
      const cached = getCachedStatus(userId);
      if (cached !== null) return cached;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        setCachedStatus(userId, false);
        return false;
      }

      const isUserPro = data.account_type === 'pro';
      setCachedStatus(userId, isUserPro);
      return isUserPro;
    } catch {
      setCachedStatus(userId, false);
      return false;
    }
  }, [getCachedStatus, setCachedStatus]);

  // Função para remover todos os anúncios do DOM
  const removeAllAds = useCallback(() => {
    const adSelectors = [
      'script[src*="pagead2.googlesyndication.com"]',
      'script[src*="monetag.com"]',
      'meta[name="monetag"]',
      'iframe[id*="google_ads_iframe"]',
      '.adsbygoogle',
      '.ad-container',
      '[class*="advertisement"]'
    ];

    adSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });

    if ((window as any).adsbygoogle) {
      delete (window as any).adsbygoogle;
    }
  }, []);

  useEffect(() => {
    // Remover anúncios imediatamente ao entrar em rota PRO
    removeAllAds();

    let isSubscribed = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const initializeProCheck = async () => {
      try {
        // Obter sessão atual
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          if (isSubscribed) {
            setIsPro(false);
            setChecking(false);
            setProMode(false);
          }
          return;
        }

        const userId = session.user.id;

        // Verificação inicial
        const proStatus = await checkProStatus(userId, true);
        
        if (!isSubscribed) return;

        if (!proStatus) {
          // Usuário não é PRO - mostrar 404
          setIsPro(false);
          setChecking(false);
          setProMode(false);
          return;
        }

        // Usuário é PRO - permitir acesso
        setIsPro(true);
        setChecking(false);
        setProMode(true);

        // Configurar realtime listener para mudanças no account_type
        realtimeChannel = supabase
          .channel(`pro_check_${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
              filter: `user_id=eq.${userId}`
            },
            async (payload) => {
              if (!isSubscribed) return;
              
              const newAccountType = payload.new?.account_type;
              
              if (newAccountType !== 'pro') {
                // Usuário não é mais PRO! - Limpar cache e mostrar 404
                localStorage.removeItem(PRO_CACHE_KEY);
                setIsPro(false);
                setProMode(false);
                
                toast({
                  title: 'Acesso Revogado',
                  description: 'Sua conta não é mais PRO.',
                  variant: 'destructive'
                });
              }
            }
          )
          .subscribe();

        // Verificação ao retornar à aba
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            checkProStatus(userId, false).then(status => {
              if (!status && isSubscribed) {
                setIsPro(false);
                setProMode(false);
              }
            });
          }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };

      } catch (error) {
        console.error('ProGuard error:', error);
        if (isSubscribed) {
          setIsPro(false);
          setChecking(false);
          setProMode(false);
        }
      }
    };

    initializeProCheck();

    return () => {
      isSubscribed = false;
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [toast, checkProStatus, removeAllAds, setProMode]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Verificando acesso PRO...</p>
        </div>
      </div>
    );
  }

  // Se não for PRO, retornar página 404
  if (!isPro) {
    return <NotFound />;
  }

  return (
    <>
      {/* Indicador sutil de modo PRO */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-yellow-500/10 via-yellow-500/5 to-yellow-500/10 border-b border-yellow-500/20 px-4 py-1 text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <Crown className="w-3 h-3" />
          <span>Modo PRO Ativo</span>
          <Crown className="w-3 h-3" />
        </div>
      </div>
      {/* Adicionar padding-top para compensar a barra */}
      <div className="pt-6">
        {children}
      </div>
    </>
  );
};

export default ProGuard;
