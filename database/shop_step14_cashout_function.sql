-- Step 14: Function for automatic duelcoins deduction (cashout)
CREATE OR REPLACE FUNCTION process_duelcoins_cashout(
    p_user_id uuid,
    p_amount integer,
    p_fee_amount numeric(10,2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_balance integer;
    total_deduction integer;
BEGIN
    -- Get current balance
    SELECT COALESCE(balance, 0) INTO existing_balance
    FROM profiles
    WHERE user_id = p_user_id;
    
    -- Calculate total deduction (amount + fee converted to duelcoins)
    total_deduction := p_amount + CEIL(p_fee_amount); -- Convert fee to duelcoins
    
    -- Check if user has enough balance
    IF existing_balance < total_deduction THEN
        RAISE EXCEPTION 'Saldo insuficiente para resgate';
    END IF;
    
    -- Update balance (deduct duelcoins)
    UPDATE profiles
    SET 
        balance = existing_balance - total_deduction,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- Create transaction record
    INSERT INTO duelcoins_transactions (
        user_id,
        amount,
        transaction_type,
        description,
        created_at
    ) VALUES (
        p_user_id,
        total_deduction * -1, -- Negative for deduction
        'cashout',
        'Resgate de DuelCoins - Taxa: ' || p_fee_amount,
        now()
    );
END;
$$;