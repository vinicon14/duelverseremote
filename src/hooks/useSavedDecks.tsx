import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DeckCard } from '@/components/deckbuilder/DeckPanel';
import { toast } from 'sonner';

interface SavedDeck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  main_deck: DeckCard[];
  extra_deck: DeckCard[];
  side_deck: DeckCard[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface RawSavedDeck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  main_deck: unknown;
  extra_deck: unknown;
  side_deck: unknown;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export const useSavedDecks = () => {
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUser(session?.user?.id || null);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchDecks = useCallback(async () => {
    if (!currentUser) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_decks')
        .select('*')
        .eq('user_id', currentUser)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion with proper parsing
      const parsedData = (data as RawSavedDeck[] || []).map(deck => ({
        ...deck,
        main_deck: (deck.main_deck || []) as DeckCard[],
        extra_deck: (deck.extra_deck || []) as DeckCard[],
        side_deck: (deck.side_deck || []) as DeckCard[],
      }));
      
      setSavedDecks(parsedData);
    } catch (error: any) {
      console.error('Error fetching decks:', error);
      toast.error('Erro ao carregar decks salvos');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchDecks();
    }
  }, [currentUser, fetchDecks]);

  const saveDeck = useCallback(async (
    name: string,
    mainDeck: DeckCard[],
    extraDeck: DeckCard[],
    sideDeck: DeckCard[],
    description?: string,
    isPublic?: boolean,
    existingId?: string
  ) => {
    if (!currentUser) {
      toast.error('Você precisa estar logado para salvar um deck');
      return null;
    }

    setIsLoading(true);
    try {
      // Prepare deck data for storage (serialize card data)
      const deckData = {
        user_id: currentUser,
        name,
        description: description || null,
        main_deck: JSON.parse(JSON.stringify(mainDeck)),
        extra_deck: JSON.parse(JSON.stringify(extraDeck)),
        side_deck: JSON.parse(JSON.stringify(sideDeck)),
        is_public: isPublic || false,
      };

      if (existingId) {
        // Update existing deck
        const { data, error } = await supabase
          .from('saved_decks')
          .update(deckData)
          .eq('id', existingId)
          .eq('user_id', currentUser)
          .select()
          .single();

        if (error) throw error;
        
        toast.success('Deck atualizado com sucesso!');
        await fetchDecks();
        
        const rawData = data as RawSavedDeck;
        return {
          ...rawData,
          main_deck: (rawData.main_deck || []) as DeckCard[],
          extra_deck: (rawData.extra_deck || []) as DeckCard[],
          side_deck: (rawData.side_deck || []) as DeckCard[],
        };
      } else {
        // Create new deck
        const { data, error } = await supabase
          .from('saved_decks')
          .insert(deckData)
          .select()
          .single();

        if (error) throw error;
        
        toast.success('Deck salvo com sucesso!');
        await fetchDecks();
        
        const rawData = data as RawSavedDeck;
        return {
          ...rawData,
          main_deck: (rawData.main_deck || []) as DeckCard[],
          extra_deck: (rawData.extra_deck || []) as DeckCard[],
          side_deck: (rawData.side_deck || []) as DeckCard[],
        };
      }
    } catch (error: any) {
      console.error('Error saving deck:', error);
      toast.error('Erro ao salvar deck');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, fetchDecks]);

  const deleteDeck = useCallback(async (deckId: string) => {
    if (!currentUser) return false;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('saved_decks')
        .delete()
        .eq('id', deckId)
        .eq('user_id', currentUser);

      if (error) throw error;
      
      toast.success('Deck excluído com sucesso!');
      await fetchDecks();
      return true;
    } catch (error: any) {
      console.error('Error deleting deck:', error);
      toast.error('Erro ao excluir deck');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, fetchDecks]);

  const loadDeck = useCallback((deck: SavedDeck) => {
    return {
      mainDeck: deck.main_deck,
      extraDeck: deck.extra_deck,
      sideDeck: deck.side_deck,
    };
  }, []);

  return {
    savedDecks,
    isLoading,
    isLoggedIn: !!currentUser,
    saveDeck,
    deleteDeck,
    loadDeck,
    fetchDecks,
  };
};