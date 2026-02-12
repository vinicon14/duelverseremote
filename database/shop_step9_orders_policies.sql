-- Step 9: RLS policies for shop_orders
CREATE POLICY "Users can view own orders" ON public.shop_orders
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own orders" ON public.shop_orders
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all orders" ON public.shop_orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can update orders" ON public.shop_orders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );