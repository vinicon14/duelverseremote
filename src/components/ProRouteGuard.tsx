import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccountType } from '@/hooks/useAccountType';
import { Loader2 } from 'lucide-react';

interface ProRouteGuardProps {
  children: React.ReactNode;
}

export const ProRouteGuard = ({ children }: ProRouteGuardProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    if (loading) return;

    if (!isPro) {
      // User is not PRO, redirect to regular home
      console.log('Acesso NEGADO à rota PRO - usuário não é PRO');
      navigate('/', { replace: true });
    }
  }, [isPro, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isPro) {
    return null;
  }

  return <>{children}</>;
};
