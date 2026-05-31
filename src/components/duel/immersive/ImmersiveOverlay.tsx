/**
 * Overlay visual do Modo Duelista Imersivo.
 *
 * Renderiza apenas quando `active === true` (ambos duelistas com decks digitais
 * abertos). Contém:
 *  - LP animado de cada jogador (cantos superiores)
 *  - Botão flutuante para abrir o painel de configurações
 *  - Painel de configurações (Sheet)
 *  - Badge discreto indicando o modo está ativo
 *
 * Todos os elementos são `pointer-events-none` por padrão, com exceção dos
 * controles, para não atrapalhar o uso do board / WebRTC abaixo.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings2, Sparkles } from "lucide-react";
import { useImmersiveMode } from "./ImmersiveModeProvider";
import { ImmersiveLPDisplay } from "./ImmersiveLPDisplay";
import { ImmersiveSettingsPanel } from "./ImmersiveSettingsPanel";
import { ImmersiveTimeline } from "./ImmersiveTimeline";
import { useImmersiveAudio } from "./useImmersiveAudio";
import type { DuelEvent } from "@/hooks/useDuelEvents";

type Props = {
  player1Label: string;
  player1Lp: number;
  player2Label: string;
  player2Lp: number;
  events?: DuelEvent[];
  isSpectator?: boolean;
};

export const ImmersiveOverlay = ({
  player1Label,
  player1Lp,
  player2Label,
  player2Lp,
  events = [],
  isSpectator = false,
}: Props) => {
  const { active, settings, setSettingsOpen } = useImmersiveMode();
  useImmersiveAudio(active, settings, events[events.length - 1] || null);
  const panelOpacity = Math.max(0.35, settings.uiOpacity / 100);

  return (
    <>
      {/* Painel sempre renderizado para permitir abrir mesmo fora do modo */}
      <ImmersiveSettingsPanel />

      {!active ? null : (
        <div className="pointer-events-none absolute inset-0 z-40" style={{ opacity: panelOpacity }}>
          {/* Badge de modo ativo */}
          <div className="absolute left-1/2 top-2 -translate-x-1/2 pointer-events-none">
            <Badge variant="secondary" className="gap-1 border-primary/40 bg-background/70 backdrop-blur">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold tracking-wider uppercase">Modo Imersivo</span>
            </Badge>
          </div>

          {/* LP esquerdo */}
          <div className="absolute left-2 top-10 sm:left-4 sm:top-12 pointer-events-auto">
            <ImmersiveLPDisplay label={player1Label} lp={player1Lp} align="left" />
          </div>

          {/* LP direito */}
          <div className="absolute right-2 top-10 sm:right-4 sm:top-12 pointer-events-auto">
            <ImmersiveLPDisplay label={player2Label} lp={player2Lp} align="right" />
          </div>

          <ImmersiveTimeline events={events} isSpectator={isSpectator} />

          {/* Botão de configurações */}
          <div className="absolute bottom-3 right-3 pointer-events-auto">
            <Button
              size="icon"
              variant="secondary"
              className="h-10 w-10 rounded-full border border-primary/40 bg-background/80 backdrop-blur shadow-lg"
              onClick={() => setSettingsOpen(true)}
              aria-label="Configurações do Modo Imersivo"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
