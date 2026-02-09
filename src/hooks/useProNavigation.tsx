import { useNavigate, useLocation } from 'react-router-dom';
import { useProMode } from './useProMode';

export const useProNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isProMode } = useProMode();

  // Navegar para uma rota, mantendo o /pro se estiver em modo PRO
  const navigateTo = (path: string, options?: { replace?: boolean; state?: any }) => {
    // Se estiver em modo PRO e o path não começar com /pro, adicionar
    if (isProMode && !path.startsWith('/pro/') && path !== '/') {
      navigate(`/pro${path}`, options);
    } else if (isProMode && path === '/') {
      navigate('/pro/duels', options);
    } else {
      navigate(path, options);
    }
  };

  // Obter o path atual sem o /pro
  const getCurrentPath = () => {
    return location.pathname.replace(/^\/pro/, '') || '/duels';
  };

  // Verificar se está em uma rota PRO
  const isProRoute = location.pathname.startsWith('/pro/');

  // Gerar link para uma rota (usado em componentes de link)
  const getProLink = (path: string): string => {
    if (isProMode && !path.startsWith('/pro/') && path !== '/') {
      return `/pro${path}`;
    }
    return path;
  };

  return {
    navigateTo,
    getCurrentPath,
    isProRoute,
    getProLink,
    isProMode
  };
};
