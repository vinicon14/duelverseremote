-- Step 13: Functions for automatic duelcoins transfer
CREATE OR REPLACE FUNCTION process_duelcoins_purchase(
    p_user_id uuid,
    p_amount integer,
    p_payment_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_balance integer;
BEGIN
    -- Get current balance
    SELECT COALESCE(balance, 0) INTO existing_balance
    FROM profiles
    WHERE user_id = p_user_id;
    
    -- Update balance (add duelcoins)
    UPDATE profiles
    SET 
        balance = existing_balance + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- Create transaction record
    INSERT INTO duelcoins_transactions (
        user_id,
        amount,
        transaction_type,
        description,
        payment_id,
        created_at
    ) VALUES (
        p_user_id,
        p_amount,
        'purchase',
        'Compra de DuelCoins - ID: ' || p_payment_id,
        p_payment_id,
        now()
    );
END;
$$;