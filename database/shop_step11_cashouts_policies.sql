-- Step 11: RLS policies for duelcoins_cashouts
CREATE POLICY "Users can view own cashouts" ON public.duelcoins_cashouts
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own cashouts" ON public.duelcoins_cashouts
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all cashouts" ON public.duelcoins_cashouts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can update cashouts" ON public.duelcoins_cashouts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );