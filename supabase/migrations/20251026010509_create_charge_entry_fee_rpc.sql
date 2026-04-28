CREATE OR REPLACE FUNCTION charge_entry_fee(
    p_amount INT,
    p_sender_id UUID,
    p_receiver_id UUID,
    p_tournament_id UUID
)
RETURNS void AS $$
BEGIN
    -- Subtract from sender
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance - p_amount
    WHERE user_id = p_sender_id;

    -- Add to receiver
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance + p_amount
    WHERE user_id = p_receiver_id;

    -- Record the transaction
    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id)
    VALUES (p_sender_id, p_receiver_id, p_amount, 'tournament_entry_fee', p_tournament_id);

    -- Insert participant
    INSERT INTO public.tournament_participants (tournament_id, user_id, status)
    VALUES (p_tournament_id, p_sender_id, 'registered');

    -- Update prize pool
    UPDATE public.tournaments
    SET prize_pool = prize_pool + p_amount
    WHERE id = p_tournament_id;
END;
$$ LANGUAGE plpgsql;
