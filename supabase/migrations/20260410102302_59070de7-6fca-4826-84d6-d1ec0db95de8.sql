CREATE POLICY "Users can delete own tcg profiles"
ON public.tcg_profiles
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);