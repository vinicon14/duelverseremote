-- Verificar e atualizar o trigger handle_new_user se necessário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    user_id, 
    username, 
    display_name, 
    avatar_url, 
    elo_rating,
    level,
    coins,
    experience_points,
    wins,
    losses,
    draws,
    total_games,
    win_streak,
    best_win_streak
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || substring(NEW.id::text from 1 for 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'New Player'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    1500,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  );
  RETURN NEW;
END;
$function$;

-- Criar políticas RLS para profiles (visualização pública, edição própria)
DROP POLICY IF EXISTS "Profiles são visíveis para todos" ON profiles;
CREATE POLICY "Profiles são visíveis para todos"
ON profiles FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Usuários podem atualizar próprio perfil" ON profiles;
CREATE POLICY "Usuários podem atualizar próprio perfil"
ON profiles FOR UPDATE
USING (auth.uid() = user_id);

-- Políticas para live_duels
DROP POLICY IF EXISTS "Live duels são visíveis para todos" ON live_duels;
CREATE POLICY "Live duels são visíveis para todos"
ON live_duels FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Jogadores podem criar duelos" ON live_duels;
CREATE POLICY "Jogadores podem criar duelos"
ON live_duels FOR INSERT
WITH CHECK (auth.uid() = player1_id);

DROP POLICY IF EXISTS "Jogadores podem atualizar seus duelos" ON live_duels;
CREATE POLICY "Jogadores podem atualizar seus duelos"
ON live_duels FOR UPDATE
USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Políticas para match_history
DROP POLICY IF EXISTS "Match history é visível para todos" ON match_history;
CREATE POLICY "Match history é visível para todos"
ON match_history FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Sistema pode inserir histórico" ON match_history;
CREATE POLICY "Sistema pode inserir histórico"
ON match_history FOR INSERT
WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Políticas para friend_requests
DROP POLICY IF EXISTS "Usuários podem ver seus pedidos" ON friend_requests;
CREATE POLICY "Usuários podem ver seus pedidos"
ON friend_requests FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "Usuários podem criar pedidos" ON friend_requests;
CREATE POLICY "Usuários podem criar pedidos"
ON friend_requests FOR INSERT
WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Usuários podem atualizar pedidos recebidos" ON friend_requests;
CREATE POLICY "Usuários podem atualizar pedidos recebidos"
ON friend_requests FOR UPDATE
USING (auth.uid() = addressee_id);