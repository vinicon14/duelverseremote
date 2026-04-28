-- Excluir todos os duelos ativos
DELETE FROM public.live_duels 
WHERE status IN ('waiting', 'in_progress');

-- Adicionar constraint para impedir que creator e opponent sejam o mesmo usuário
ALTER TABLE public.live_duels
ADD CONSTRAINT different_players_check 
CHECK (creator_id != opponent_id);