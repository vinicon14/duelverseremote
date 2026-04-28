import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import "./PageTransition.css";

const MAIN_ROUTES = [
  '/',
  '/duels',
  '/matchmaking',
  '/tournaments',
  '/friends',
  '/ranking',
  '/deck-builder',
  '/store',
  '/my-items'
];

export function PageNavigationArrows() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showArrows, setShowArrows] = useState(false);
  
  // Apenas mostrar setas se estiver em uma das rotas principais
  const currentIndex = MAIN_ROUTES.indexOf(location.pathname);
  
  useEffect(() => {
    if (currentIndex !== -1) {
      setShowArrows(true);
    } else {
      setShowArrows(false);
    }
  }, [currentIndex]);
  
  const handlePrev = () => {
    if (currentIndex > 0) {
      document.getElementById('root')?.classList.add('page-turn-right');
      setTimeout(() => {
        navigate(MAIN_ROUTES[currentIndex - 1]);
        setTimeout(() => document.getElementById('root')?.classList.remove('page-turn-right'), 50);
      }, 300);
    }
  };

  const handleNext = () => {
    if (currentIndex < MAIN_ROUTES.length - 1) {
      document.getElementById('root')?.classList.add('page-turn-left');
      setTimeout(() => {
        navigate(MAIN_ROUTES[currentIndex + 1]);
        setTimeout(() => document.getElementById('root')?.classList.remove('page-turn-left'), 50);
      }, 300);
    }
  };

  // Suporte a Swipe para dispositivos Mobile (Nativo e Browser Mobile)
  useEffect(() => {
    if (!showArrows) return;

    let touchStartX = 0;
    let touchEndX = 0;
    
    function handleTouchStart(e: TouchEvent) {
      touchStartX = e.changedTouches[0].screenX;
    }
    
    function handleTouchEnd(e: TouchEvent) {
      touchEndX = e.changedTouches[0].screenX;
      const swipeDistance = touchStartX - touchEndX;
      
      // Swipe para Esquerda = Ir para Direita (Next)
      if (swipeDistance > 80) handleNext();
      // Swipe para Direita = Ir para Esquerda (Prev)
      if (swipeDistance < -80) handlePrev();
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [currentIndex, showArrows]);

  if (!showArrows) return null;

  return (
    <div className="fixed top-1/2 -translate-y-1/2 left-0 right-0 pointer-events-none z-[40] hidden md:flex justify-between items-center px-1 md:px-3">
      {currentIndex > 0 ? (
        <button 
          onClick={handlePrev}
          className="pointer-events-auto group w-12 h-32 flex items-center justify-center rounded-r-2xl bg-gradient-to-r from-background/80 to-transparent hover:from-primary/30 hover:to-transparent border-l-4 border-transparent hover:border-primary transition-all duration-300"
        >
          <ChevronLeft className="w-8 h-8 text-white/50 group-hover:text-white transition-colors group-hover:scale-125" />
        </button>
      ) : <div />}

      {currentIndex < MAIN_ROUTES.length - 1 ? (
        <button 
          onClick={handleNext}
          className="pointer-events-auto group w-12 h-32 flex items-center justify-center rounded-l-2xl bg-gradient-to-l from-background/80 to-transparent hover:from-primary/30 hover:to-transparent border-r-4 border-transparent hover:border-primary transition-all duration-300"
        >
          <ChevronRight className="w-8 h-8 text-white/50 group-hover:text-white transition-colors group-hover:scale-125" />
        </button>
      ) : <div />}
    </div>
  );
}
