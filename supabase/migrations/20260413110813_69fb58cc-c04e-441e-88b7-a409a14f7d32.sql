
-- Allow players to update their own match results
CREATE POLICY "Players can update own match result"
ON public.tournament_matches
FOR UPDATE
TO public
USING (
  auth.uid() = player1_id OR auth.uid() = player2_id
)
WITH CHECK (
  auth.uid() = player1_id OR auth.uid() = player2_id
);
