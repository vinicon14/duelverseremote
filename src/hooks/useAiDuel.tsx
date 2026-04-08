import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { FieldState, GameCard, FieldZoneType } from '@/components/duel/DuelFieldBoard';

export interface AiChatMessage {
  id: string;
  role: 'ai' | 'player' | 'system';
  content: string;
  timestamp: Date;
}

export interface AiDeckCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  card_images?: { id: number; image_url: string; image_url_small: string; image_url_cropped: string }[];
}

interface AiDecision {
  action: string;
  card?: string;
  zone?: string;
  target?: string;
  position?: string;
  chatMessage?: string;
  reasoning?: string;
}

export const useAiDuel = () => {
  const { toast } = useToast();
  const [aiMode, setAiMode] = useState(false);
  const [aiDeck, setAiDeck] = useState<AiDeckCard[]>([]);
  const [aiHand, setAiHand] = useState<AiDeckCard[]>([]);
  const [aiGraveyard, setAiGraveyard] = useState<AiDeckCard[]>([]);
  const [aiBanished, setAiBanished] = useState<AiDeckCard[]>([]);
  const [aiExtraDeck, setAiExtraDeck] = useState<AiDeckCard[]>([]);
  const [aiField, setAiField] = useState<Record<string, any>>({});
  const [aiLP, setAiLP] = useState(8000);
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiTurnPhase, setAiTurnPhase] = useState<string>('waiting');
  const [isAiTurn, setIsAiTurn] = useState(false);
  const conversationHistoryRef = useRef<{ role: string; content: string }[]>([]);
  const [speechText, setSpeechText] = useState('');
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);

  const addChatMessage = useCallback((role: AiChatMessage['role'], content: string) => {
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
    }]);
  }, []);

  const initAiDeck = useCallback((deckCards: AiDeckCard[]) => {
    // Separate main deck and extra deck
    const EXTRA_TYPES = ['fusion', 'synchro', 'xyz', 'link'];
    const mainCards: AiDeckCard[] = [];
    const extraCards: AiDeckCard[] = [];
    
    deckCards.forEach(card => {
      const typeLower = (card.type || '').toLowerCase();
      if (EXTRA_TYPES.some(t => typeLower.includes(t))) {
        extraCards.push(card);
      } else {
        mainCards.push(card);
      }
    });

    // Shuffle main deck
    const shuffled = [...mainCards].sort(() => Math.random() - 0.5);
    
    // Draw initial hand (5 cards)
    const hand = shuffled.slice(0, 5);
    const remaining = shuffled.slice(5);

    setAiDeck(remaining);
    setAiHand(hand);
    setAiExtraDeck(extraCards);
    setAiGraveyard([]);
    setAiBanished([]);
    setAiField({});
    setAiLP(8000);
    setIsAiTurn(false);
    setAiTurnPhase('waiting');

    addChatMessage('ai', '🎴 Deck carregado! Comprei 5 cartas. Boa sorte, duelista! Que o melhor vença! 🔥');
    addChatMessage('system', 'IA pronta para duelar. Você começa!');
  }, [addChatMessage]);

  const startAiMode = useCallback((deckCards: AiDeckCard[]) => {
    setAiMode(true);
    initAiDeck(deckCards);
    toast({ title: "🤖 Modo IA Ativado!", description: "A IA está pronta para duelar!" });
  }, [initAiDeck, toast]);

  const stopAiMode = useCallback(() => {
    setAiMode(false);
    setAiDeck([]);
    setAiHand([]);
    setAiGraveyard([]);
    setAiBanished([]);
    setAiExtraDeck([]);
    setAiField({});
    setChatMessages([]);
    setIsAiTurn(false);
    conversationHistoryRef.current = [];
    stopListening();
    toast({ title: "Modo IA Desativado", description: "A IA foi desconectada." });
  }, [toast]);

  const requestAiAction = useCallback(async (
    playerFieldState: FieldState,
    playerLP: number,
    playerAction?: any,
    playerSpeechInput?: string,
  ) => {
    if (!aiMode || isAiThinking) return null;
    
    setIsAiThinking(true);
    
    try {
      // Build game state for the AI
      const gameState = {
        aiField,
        aiHand: aiHand.map(c => ({ name: c.name, type: c.type, atk: c.atk, def: c.def, level: c.level, desc: c.desc })),
        aiGraveyard: aiGraveyard.map(c => ({ name: c.name, type: c.type })),
        aiBanished: aiBanished.map(c => ({ name: c.name, type: c.type })),
        aiExtraDeck: aiExtraDeck.map(c => ({ name: c.name, type: c.type, atk: c.atk, def: c.def, level: c.level })),
        aiLP,
        aiDeckCount: aiDeck.length,
        playerField: {
          monsters: Object.entries(playerFieldState)
            .filter(([k]) => k.startsWith('monster') && playerFieldState[k as keyof FieldState])
            .map(([k, v]) => {
              const card = v as GameCard;
              return card ? { name: card.isFaceDown ? '???' : card.name, atk: card.atk, def: card.def, position: card.position, isFaceDown: card.isFaceDown } : null;
            }).filter(Boolean),
          spells: Object.entries(playerFieldState)
            .filter(([k]) => k.startsWith('spell') && playerFieldState[k as keyof FieldState])
            .map(([k, v]) => {
              const card = v as GameCard;
              return card ? { name: card.isFaceDown ? '???' : card.name, isFaceDown: card.isFaceDown } : null;
            }).filter(Boolean),
          fieldSpell: playerFieldState.fieldSpell ? { name: playerFieldState.fieldSpell.name } : null,
        },
        playerHandCount: playerFieldState.hand.length,
        playerGraveyard: playerFieldState.graveyard.map(c => ({ name: c.name, type: c.type })),
        playerLP,
      };

      const { data, error } = await supabase.functions.invoke('ai-duel-engine', {
        body: {
          gameState,
          playerAction,
          conversationHistory: conversationHistoryRef.current.slice(-10),
          playerSpeech: playerSpeechInput || speechText || undefined,
          turnPhase: aiTurnPhase,
        },
      });

      if (error) {
        console.error('AI duel engine error:', error);
        addChatMessage('system', '⚠️ Erro na IA. Tentando novamente...');
        return null;
      }

      const decision: AiDecision = data?.decision;
      if (!decision) return null;

      // Add chat message from AI
      if (decision.chatMessage) {
        addChatMessage('ai', decision.chatMessage);
      }

      // Update conversation history
      conversationHistoryRef.current.push(
        { role: 'user', content: `Game state update. Player action: ${JSON.stringify(playerAction || 'none')}` },
        { role: 'assistant', content: JSON.stringify(decision) }
      );

      // Execute AI action on its own state
      executeAiAction(decision);

      // Clear speech text after processing
      setSpeechText('');

      return decision;
    } catch (err) {
      console.error('AI request failed:', err);
      addChatMessage('system', '⚠️ Falha na comunicação com a IA.');
      return null;
    } finally {
      setIsAiThinking(false);
    }
  }, [aiMode, isAiThinking, aiField, aiHand, aiGraveyard, aiBanished, aiExtraDeck, aiLP, aiDeck.length, aiTurnPhase, speechText, addChatMessage]);

  const executeAiAction = useCallback((decision: AiDecision) => {
    const { action, card: cardName, zone, position } = decision;

    switch (action) {
      case 'normal_summon':
      case 'special_summon': {
        const cardIndex = aiHand.findIndex(c => c.name === cardName);
        if (cardIndex >= 0) {
          const card = aiHand[cardIndex];
          const newHand = [...aiHand];
          newHand.splice(cardIndex, 1);
          setAiHand(newHand);
          
          const targetZone = zone || 'monster1';
          setAiField(prev => ({
            ...prev,
            [targetZone]: {
              ...card,
              position: position || 'attack',
              isFaceDown: false,
            },
          }));
        }
        break;
      }
      case 'set_monster': {
        const cardIndex = aiHand.findIndex(c => c.name === cardName);
        if (cardIndex >= 0) {
          const card = aiHand[cardIndex];
          const newHand = [...aiHand];
          newHand.splice(cardIndex, 1);
          setAiHand(newHand);
          
          const targetZone = zone || 'monster1';
          setAiField(prev => ({
            ...prev,
            [targetZone]: {
              ...card,
              position: 'defense',
              isFaceDown: true,
            },
          }));
        }
        break;
      }
      case 'activate_spell':
      case 'set_spell_trap': {
        const cardIndex = aiHand.findIndex(c => c.name === cardName);
        if (cardIndex >= 0) {
          const card = aiHand[cardIndex];
          const newHand = [...aiHand];
          newHand.splice(cardIndex, 1);
          setAiHand(newHand);
          
          if (action === 'set_spell_trap') {
            const targetZone = zone || 'spell1';
            setAiField(prev => ({
              ...prev,
              [targetZone]: { ...card, isFaceDown: true },
            }));
          } else {
            // Spell activation - goes to graveyard after use (simplified)
            setAiGraveyard(prev => [...prev, card]);
          }
        }
        break;
      }
      case 'draw': {
        if (aiDeck.length > 0) {
          const drawn = aiDeck[0];
          setAiDeck(prev => prev.slice(1));
          setAiHand(prev => [...prev, drawn]);
          addChatMessage('system', `IA comprou 1 carta. (Deck: ${aiDeck.length - 1})`);
        }
        break;
      }
      case 'end_turn': {
        setIsAiTurn(false);
        setAiTurnPhase('waiting');
        addChatMessage('system', '🔄 Turno da IA finalizado. Seu turno!');
        break;
      }
      case 'pass':
      default:
        break;
    }
  }, [aiHand, aiDeck, addChatMessage]);

  const startAiTurn = useCallback(async (playerFieldState: FieldState, playerLP: number) => {
    if (!aiMode) return;
    
    setIsAiTurn(true);
    addChatMessage('system', '🤖 Turno da IA!');

    // Draw phase
    setAiTurnPhase('draw');
    if (aiDeck.length > 0) {
      const drawn = aiDeck[0];
      setAiDeck(prev => prev.slice(1));
      setAiHand(prev => [...prev, drawn]);
    }

    // Let AI make multiple actions
    setAiTurnPhase('main1');
    
    // Request AI actions in sequence with delays for realism
    const makeActions = async (actionsLeft: number) => {
      if (actionsLeft <= 0) {
        setIsAiTurn(false);
        setAiTurnPhase('waiting');
        addChatMessage('system', '🔄 Turno da IA finalizado. Seu turno!');
        return;
      }

      const decision = await requestAiAction(playerFieldState, playerLP);
      if (!decision || decision.action === 'end_turn' || decision.action === 'pass') {
        setIsAiTurn(false);
        setAiTurnPhase('waiting');
        if (decision?.action !== 'end_turn') {
          addChatMessage('system', '🔄 Turno da IA finalizado. Seu turno!');
        }
        return;
      }

      // Wait 2-4 seconds for realism before next action
      setTimeout(() => makeActions(actionsLeft - 1), 2000 + Math.random() * 2000);
    };

    // Small delay before first action
    setTimeout(() => makeActions(5), 1500);
  }, [aiMode, aiDeck, requestAiAction, addChatMessage]);

  // Speech-to-text with Web Speech API
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({ title: "Não suportado", description: "Seu navegador não suporta reconhecimento de voz.", variant: "destructive" });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setSpeechText(finalTranscript);
        addChatMessage('player', `🎤 ${finalTranscript}`);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Restart if still in AI mode
      if (aiMode && isListening) {
        try { recognition.start(); } catch {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
    }
  }, [aiMode, isListening, toast, addChatMessage]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Send a typed chat message to the AI
  const sendChatToAi = useCallback(async (message: string, playerFieldState: FieldState, playerLP: number) => {
    addChatMessage('player', message);
    await requestAiAction(playerFieldState, playerLP, undefined, message);
  }, [addChatMessage, requestAiAction]);

  // Broadcast AI field state to opponent viewer channel
  const broadcastAiState = useCallback((duelId: string) => {
    if (!aiMode || !duelId) return;
    
    const channel = supabase.channel(`deck-sync-${duelId}`);
    
    // Build opponent state from AI data for the FloatingOpponentViewer
    const monsterZones: Record<string, any> = {};
    const spellZones: Record<string, any> = {};
    
    Object.entries(aiField).forEach(([zone, card]) => {
      if (zone.startsWith('monster')) {
        monsterZones[zone] = card;
      } else if (zone.startsWith('spell')) {
        spellZones[zone] = card;
      }
    });

    channel.send({
      type: 'broadcast',
      event: 'deck-state',
      payload: {
        userId: 'ai-opponent',
        hand: aiHand.length,
        field: [],
        monsterZones,
        spellZones,
        graveyard: aiGraveyard.map(c => ({
          id: c.id,
          name: c.name,
          image: c.card_images?.[0]?.image_url_small || '',
          type: c.type,
          atk: c.atk,
          def: c.def,
        })),
        banished: aiBanished.map(c => ({
          id: c.id,
          name: c.name,
          image: c.card_images?.[0]?.image_url_small || '',
        })),
        deckCount: aiDeck.length,
        extraCount: aiExtraDeck.length,
      },
    });
  }, [aiMode, aiField, aiHand, aiGraveyard, aiBanished, aiDeck, aiExtraDeck]);

  // Auto-broadcast AI state when it changes
  useEffect(() => {
    // This effect is handled by the component that uses this hook
  }, [aiField, aiHand, aiGraveyard, aiBanished]);

  return {
    aiMode,
    aiDeck,
    aiHand,
    aiGraveyard,
    aiBanished,
    aiExtraDeck,
    aiField,
    aiLP,
    setAiLP,
    chatMessages,
    isAiThinking,
    isAiTurn,
    aiTurnPhase,
    startAiMode,
    stopAiMode,
    requestAiAction,
    startAiTurn,
    addChatMessage,
    sendChatToAi,
    broadcastAiState,
    isListening,
    startListening,
    stopListening,
    speechText,
  };
};