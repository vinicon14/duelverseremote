/**
 * DuelVerse - Hook de Administrador
 * Desenvolvido por Vinícius
 * 
 * Verifica se o usuário atual é um administrador.
 * Usa função RPC para bypassar políticas RLS.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAdmin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Usa função RPC para verificar admin (bypass RLS)
        const { data, error } = await supabase.rpc('check_is_admin');
        
        if (error) {
          console.error('Erro ao verificar admin:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    };

    checkAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdmin();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isAdmin, loading };
};
