-- Remover política antiga de update
DROP POLICY IF EXISTS "Participants update duels" ON public.live_duels;

-- Criar nova política mais permissiva que permite:
-- 1. Creator sempre pode atualizar
-- 2. Opponent registrado pode atualizar
-- 3. Qualquer usuário pode atualizar se não houver opponent ainda (para permitir entrada do Player 2)
CREATE POLICY "Participants update duels v2"
ON public.live_duels
FOR UPDATE
TO authenticated
USING (
  auth.uid() = creator_id 
  OR auth.uid() = opponent_id
  OR (opponent_id IS NULL AND auth.uid() != creator_id)
)
WITH CHECK (
  auth.uid() = creator_id 
  OR auth.uid() = opponent_id
  OR (opponent_id IS NULL AND auth.uid() != creator_id)
);