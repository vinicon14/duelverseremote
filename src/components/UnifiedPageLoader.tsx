import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Swords, Sparkles } from "lucide-react";

export function UnifiedPageLoader() {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    // Evita loop no start
    if (location.pathname === '/') return;

    // Dispara a animação de loader
    setIsLoading(true);
    setShowOverlay(true);

    // Oculta a máscara após 900ms, tempo suficiente para a grande maioria
    // dos useEffects paralelos (Supabase/Rest) buscarem seus dados nas views filhas
    // anulando o efeito de "waterfall" picotado que a plataforma vinha sofrendo
    const t = setTimeout(() => {
      setIsLoading(false);
      setTimeout(() => setShowOverlay(false), 300); // tempo do fade out
    }, 900);

    return () => clearTimeout(t);
  }, [location.pathname]);

  if (!showOverlay) return null;

  return (
    <div 
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md transition-opacity duration-300 pointer-events-none ${isLoading ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="relative flex flex-col items-center">
        {/* Animação Minimalista do TCG Loader */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
          <div className="w-16 h-20 rounded-md border-2 border-primary/50 bg-background flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary))] animate-card-fall-0">
             <Swords className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <div className="absolute -inset-4 border border-white/10 rounded-full animate-spin [animation-duration:3s]" />
        </div>
        
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent animate-bounce" />
          <h2 className="text-xl font-bold tracking-[0.2em] text-foreground animate-pulse">
            CARREGANDO...
          </h2>
          <Sparkles className="w-4 h-4 text-accent animate-bounce" style={{ animationDelay: '0.2s' }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2 tracking-widest uppercase">
          Sincronizando Dados Base
        </p>
      </div>
    </div>
  );
}
