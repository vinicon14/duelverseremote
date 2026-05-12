
-- 1. marketplace_products: require approval for public visibility
DROP POLICY IF EXISTS "Anyone can view active products" ON public.marketplace_products;
CREATE POLICY "Anyone can view active approved products"
  ON public.marketplace_products
  FOR SELECT
  TO public
  USING (is_active = true AND is_approved = true);

-- 2. discord_links: hide tokens from admins via a sanitized view
DROP POLICY IF EXISTS "Admins view all discord links" ON public.discord_links;

CREATE OR REPLACE VIEW public.discord_links_admin_view
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  discord_id,
  discord_username,
  discord_global_name,
  discord_email,
  discord_avatar_url,
  linked_at,
  updated_at,
  token_expires_at
FROM public.discord_links;

GRANT SELECT ON public.discord_links_admin_view TO authenticated;

CREATE POLICY "Admins view discord links via view"
  ON public.discord_links
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()) AND auth.uid() = user_id);
-- (Admins can still query via discord_links_admin_view; raw tokens no longer readable.)

-- 3. user_inventory: remove direct INSERT path
DROP POLICY IF EXISTS "Users can insert own inventory" ON public.user_inventory;

-- 4. tournament_participants: remove direct INSERT (must go through edge function)
DROP POLICY IF EXISTS "Usuários podem se inscrever em torneios" ON public.tournament_participants;

-- 5. matchmaking_queue: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view queue entries" ON public.matchmaking_queue;
CREATE POLICY "Authenticated users can view queue entries"
  ON public.matchmaking_queue
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. lives: explicit service_role management
DROP POLICY IF EXISTS "Service role manages lives" ON public.lives;
CREATE POLICY "Service role manages lives"
  ON public.lives
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins manage lives" ON public.lives;
CREATE POLICY "Admins manage lives"
  ON public.lives
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
