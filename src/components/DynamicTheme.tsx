/**
 * DuelVerse - Dynamic Theme Provider
 * 
 * Aplica temas visuais diferentes baseado no TCG ativo.
 */
import { useEffect, useContext } from 'react';
import { TcgType } from '@/contexts/TcgContext';

// Import the context directly to avoid the throwing useTcg hook
import React from 'react';

const TcgContext = React.createContext<{ activeTcg: TcgType } | undefined>(undefined);

const TCG_THEMES: Record<TcgType, Record<string, string>> = {
  yugioh: {
    '--primary': '270 80% 55%',
    '--primary-foreground': '0 0% 100%',
    '--primary-glow': '270 90% 70%',
    '--accent': '315 85% 60%',
    '--accent-foreground': '0 0% 100%',
    '--ring': '270 80% 55%',
    '--gradient-mystic': 'linear-gradient(135deg, hsl(270 80% 55%) 0%, hsl(315 85% 60%) 100%)',
    '--shadow-mystic': '0 10px 40px -10px hsl(270 80% 55% / 0.5)',
  },
  magic: {
    '--primary': '35 90% 50%',
    '--primary-foreground': '0 0% 100%',
    '--primary-glow': '40 95% 65%',
    '--accent': '0 75% 50%',
    '--accent-foreground': '0 0% 100%',
    '--ring': '35 90% 50%',
    '--gradient-mystic': 'linear-gradient(135deg, hsl(35 90% 50%) 0%, hsl(0 75% 50%) 100%)',
    '--shadow-mystic': '0 10px 40px -10px hsl(35 90% 50% / 0.5)',
  },
  pokemon: {
    '--primary': '45 100% 50%',
    '--primary-foreground': '0 0% 10%',
    '--primary-glow': '50 100% 60%',
    '--accent': '210 80% 55%',
    '--accent-foreground': '0 0% 100%',
    '--ring': '45 100% 50%',
    '--gradient-mystic': 'linear-gradient(135deg, hsl(45 100% 50%) 0%, hsl(210 80% 55%) 100%)',
    '--shadow-mystic': '0 10px 40px -10px hsl(45 100% 50% / 0.5)',
  },
};

export const DynamicTheme = () => {
  const { activeTcg } = useTcg();

  useEffect(() => {
    const root = document.documentElement;
    const theme = TCG_THEMES[activeTcg];
    if (theme) {
      Object.entries(theme).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }

    return () => {
      Object.keys(theme || {}).forEach(key => {
        root.style.removeProperty(key);
      });
    };
  }, [activeTcg]);

  return null;
};