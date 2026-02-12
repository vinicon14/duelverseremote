-- Step 12: RLS policies for cashout_admin_codes
CREATE POLICY "Admins can view cashout codes" ON public.cashout_admin_codes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can insert cashout codes" ON public.cashout_admin_codes
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update cashout codes" ON public.cashout_admin_codes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );