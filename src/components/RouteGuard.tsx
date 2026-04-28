import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredPlan?: 'free' | 'pro';
  requireAuth?: boolean;
}

export const RouteGuard = ({ 
  children, 
  requiredPlan = 'free',
  requireAuth = false 
}: RouteGuardProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Se requer autenticação e não está logado
      if (requireAuth && !session) {
        navigate('/auth', { replace: true });
        return;
      }

      if (!session) {
        setLoading(false);
        setHasAccess(!requireAuth);
        return;
      }

      // Verificar plano do usuário
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('user_id', session.user.id)
        .single();

      const userPlan = profile?.account_type || 'free';

      if (requiredPlan === 'pro') {
        if (userPlan === 'pro') {
          setHasAccess(true);
        } else {
          // FREE user trying to access PRO route - show 404
          navigate('/404', { replace: true });
          return;
        }
      } else {
        // FREE route - always accessible to authenticated users
        setHasAccess(true);
      }

      setLoading(false);
    };

    checkAccess();
  }, [navigate, location, requiredPlan, requireAuth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
};

// Hook para verificar se está em rota PRO
export const useIsProRoute = () => {
  const location = useLocation();
  return location.pathname.startsWith('/pro');
};

// Hook para verificar se pode acessar rotas PRO
export const useCanAccessPro = () => {
  const [canAccess, setCanAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCanAccess(false);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('user_id', session.user.id)
        .single();

      setCanAccess(profile?.account_type === 'pro');
      setLoading(false);
    };

    check();
  }, []);

  return { canAccess, loading };
};
