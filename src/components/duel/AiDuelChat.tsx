import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Bot, Mic, MicOff, Send, X, Minimize2, Move, Brain, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDraggable } from '@/hooks/useDraggable';
import type { AiChatMessage } from '@/hooks/useAiDuel';
import type { FieldState } from './DuelFieldBoard';

interface AiDuelChatProps {
  messages: AiChatMessage[];
  isAiThinking: boolean;
  isAiTurn: boolean;
  isListening: boolean;
  onSendMessage: (message: string, fieldState: FieldState, playerLP: number) => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onStartAiTurn: (fieldState: FieldState, playerLP: number) => void;
  onStopAiMode: () => void;
  fieldState: FieldState;
  playerLP: number;
}

export const AiDuelChat = ({
  messages,
  isAiThinking,
  isAiTurn,
  isListening,
  onSendMessage,
  onStartListening,
  onStopListening,
  onStartAiTurn,
  onStopAiMode,
  fieldState,
  playerLP,
}: AiDuelChatProps) => {
  const [inputText, setInputText] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { position, isDragging, elementRef, dragHandlers } = useDraggable({
    initialPosition: { x: window.innerWidth - 340, y: 80 },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim(), fieldState, playerLP);
    setInputText('');
  };

  if (isMinimized) {
    return (
      <div
        ref={elementRef}
        onClick={() => !isDragging && setIsMinimized(false)}
        className="fixed z-50 bg-card/95 backdrop-blur-sm border border-primary/30 rounded-lg shadow-lg flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
        style={{ left: position.x, top: position.y }}
        {...dragHandlers}
      >
        <Bot className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">Chat IA</span>
        {isAiThinking && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        {messages.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1">{messages.length}</Badge>
        )}
      </div>
    );
  }

  return (
    <div
      ref={elementRef}
      className="fixed z-50 w-80 bg-card/95 backdrop-blur-sm border border-primary/30 rounded-lg shadow-2xl overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-2 border-b border-border bg-primary/10 cursor-grab"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2">
          <Move className="h-3 w-3 text-muted-foreground" />
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Chat com IA</span>
          {isAiThinking && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 animate-pulse">
              <Brain className="h-2 w-2 mr-0.5" />
              Pensando...
            </Badge>
          )}
          {isAiTurn && (
            <Badge className="text-[10px] h-4 px-1 bg-yellow-500 text-black">
              Turno IA
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(true)}>
            <Minimize2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onStopAiMode}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="h-60 p-2" ref={scrollRef as any}>
        <div className="space-y-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "text-xs rounded-lg px-2 py-1.5 max-w-[90%]",
                msg.role === 'ai' && "bg-primary/10 text-foreground mr-auto",
                msg.role === 'player' && "bg-accent/20 text-foreground ml-auto",
                msg.role === 'system' && "bg-muted/50 text-muted-foreground mx-auto text-center italic text-[10px]"
              )}
            >
              {msg.role === 'ai' && <span className="font-bold text-primary">🤖 IA: </span>}
              {msg.role === 'player' && <span className="font-bold text-accent-foreground">Você: </span>}
              {msg.content}
            </div>
          ))}
          {isAiThinking && (
            <div className="bg-primary/10 text-foreground mr-auto text-xs rounded-lg px-2 py-1.5 flex items-center gap-1">
              <Bot className="h-3 w-3 text-primary" />
              <span className="animate-pulse">Pensando...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Controls */}
      <div className="p-2 border-t border-border space-y-2">
        {/* Pass turn to AI button */}
        {!isAiTurn && (
          <Button
            onClick={() => onStartAiTurn(fieldState, playerLP)}
            className="w-full text-xs h-7"
            variant="outline"
            disabled={isAiThinking}
          >
            <Bot className="h-3 w-3 mr-1" />
            Passar turno para IA
          </Button>
        )}

        {/* Chat input */}
        <div className="flex gap-1">
          <Button
            variant={isListening ? "destructive" : "outline"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={isListening ? onStopListening : onStartListening}
            title={isListening ? "Parar de ouvir" : "Falar com a IA"}
          >
            {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          </Button>
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Fale com a IA..."
            className="h-8 text-xs"
          />
          <Button
            onClick={handleSend}
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!inputText.trim() || isAiThinking}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
        
        {isListening && (
          <div className="flex items-center gap-1 text-[10px] text-primary animate-pulse">
            <Mic className="h-2 w-2" />
            Ouvindo... Fale algo!
          </div>
        )}
      </div>
    </div>
  );
};