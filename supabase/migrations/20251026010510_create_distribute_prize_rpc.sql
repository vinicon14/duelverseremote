CREATE OR REPLACE FUNCTION distribute_prize(
    p_tournament_id UUID,
    p_winner_id UUID,
    p_creator_id UUID,
    p_prize_pool INT
)
RETURNS void AS $$
DECLARE
    total_entry_fees INT;
    creator_share INT;
BEGIN
    -- Calculate total entry fees for this tournament
    SELECT SUM(amount) INTO total_entry_fees
    FROM public.duelcoins_transactions
    WHERE tournament_id = p_tournament_id AND transaction_type = 'tournament_entry_fee';

    -- Transfer prize to the winner
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance + total_entry_fees
    WHERE user_id = p_winner_id;

    -- Record winner's transaction
    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id)
    VALUES (p_creator_id, p_winner_id, total_entry_fees, 'tournament_prize', p_tournament_id);

    -- Calculate creator's share (prize_pool - total_entry_fees)
    creator_share := p_prize_pool - total_entry_fees;

    -- Transfer surplus to the creator
    IF creator_share > 0 THEN
        UPDATE public.profiles
        SET duelcoins_balance = duelcoins_balance + creator_share
        WHERE user_id = p_creator_id;

        -- Record creator's transaction
        INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id)
        VALUES (NULL, p_creator_id, creator_share, 'tournament_surplus', p_tournament_id);
    END IF;

    -- Mark tournament as completed
    UPDATE public.tournaments
    SET status = 'completed'
    WHERE id = p_tournament_id;

    -- Mark the winner in tournament_participants
    UPDATE public.tournament_participants
    SET status = 'winner'
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;
END;
$$ LANGUAGE plpgsql;
