import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { FloatingOpponentViewer } from './FloatingOpponentViewer';
import { cn } from '@/lib/utils';

interface SplitScreenArenaProps {
  duelId: string;
  currentUserId: string;
  opponentUsername?: string;
  onOpenDeckViewer: () => void;
}

export const SplitScreenArena = ({
  duelId,
  currentUserId,
  opponentUsername = 'Oponente',
  onOpenDeckViewer,
}: SplitScreenArenaProps) => {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <div className="h-full w-full bg-gradient-to-b from-background to-card flex">
      {/* Player Side - Left (Physical/Digital Field) */}
      <div className={cn(
        "relative transition-all duration-300 border-r border-border flex flex-col bg-black/40",
        isMinimized ? "w-16 gap-2 items-center justify-center p-2" : "w-1/2 gap-4 p-4"
      )}>
        {isMinimized ? (
          <>
            <Button
              onClick={() => setIsMinimized(false)}
              size="sm"
              variant="ghost"
              className="rotate-180 h-8"
              title="Expandir campo do jogador"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={onOpenDeckViewer}
              size="sm"
              variant="ghost"
              className="h-8 p-0"
              title="Abrir editor de deck"
            >
              <Layers className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Seu Campo</h2>
              <div className="flex gap-2">
                <Button
                  onClick={onOpenDeckViewer}
                  size="sm"
                  variant="outline"
                  className="bg-amber-600/95 hover:bg-amber-700 text-white"
                  title="Abrir editor de deck"
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Editor
                </Button>
                <Button
                  onClick={() => setIsMinimized(true)}
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  title="Minimizar campo"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Minimalist instruction area */}
            <div className="flex-1 flex items-center justify-center text-center">
              <div className="space-y-4 text-muted-foreground">
                <p className="text-sm">📱 Câmera Digital</p>
                <p className="text-xs">ou</p>
                <p className="text-sm">🎬 Câmera Física</p>
                <p className="text-xs mt-4 opacity-75">Clique em "Editor" para gerenciar seu deck</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Opponent Field - Right Side */}
      <div className={cn(
        "relative transition-all duration-300 flex flex-col flex-1",
        isMinimized ? "w-[calc(100%-4rem)]" : ""
      )}>
        <FloatingOpponentViewer
          duelId={duelId}
          currentUserId={currentUserId}
          opponentUsername={opponentUsername}
          isFullScreen={true}
        />
      </div>
    </div>
  );
};
