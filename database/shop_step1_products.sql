-- Execute the shop system setup step by step
-- Run this in the Supabase SQL Editor

-- Step 1: Create shop_products table
CREATE TABLE IF NOT EXISTS public.shop_products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image_url text,
    category text NOT NULL DEFAULT 'normal',
    product_type text NOT NULL DEFAULT 'normal' CHECK (product_type IN ('normal', 'duelcoins', 'cashout')),
    duelcoins_amount integer,
    cashout_fee_percentage numeric(5,2) DEFAULT 0,
    stock_quantity integer DEFAULT 1,
    is_active boolean DEFAULT true,
    is_digital boolean DEFAULT false,
    delivery_info text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);