-- Step 10: RLS policies for duelcoins_purchases
CREATE POLICY "Users can view own purchases" ON public.duelcoins_purchases
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own purchases" ON public.duelcoins_purchases
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all purchases" ON public.duelcoins_purchases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );