CREATE OR REPLACE FUNCTION matchmake(
    p_match_type TEXT,
    p_user_id UUID
)
RETURNS TABLE (
    duel_id UUID,
    player1_id UUID,
    player2_id UUID
) AS $$
DECLARE
    v_opponent record;
    v_duel_id UUID;
BEGIN
    -- Use a transaction with a lock to prevent race conditions
    LOCK TABLE matchmaking_queue IN EXCLUSIVE MODE;

    -- Find a waiting opponent
    SELECT *
    INTO v_opponent
    FROM matchmaking_queue
    WHERE match_type = p_match_type
      AND user_id != p_user_id
      AND status = 'waiting'
      AND expires_at > NOW()
    ORDER BY created_at
    LIMIT 1;

    IF v_opponent IS NOT NULL THEN
        -- Opponent found, create a match

        -- Create the duel
        INSERT INTO live_duels (creator_id, opponent_id, is_ranked, status, duration_minutes, started_at)
        VALUES (v_opponent.user_id, p_user_id, (p_match_type = 'ranked'), 'in_progress', 50, NOW())
        RETURNING id INTO v_duel_id;

        -- Create redirects for both players
        INSERT INTO redirects (user_id, duel_id)
        VALUES (p_user_id, v_duel_id), (v_opponent.user_id, v_duel_id);

        -- Delete from queue
        DELETE FROM matchmaking_queue WHERE id = v_opponent.id;

        -- Return the match details
        RETURN QUERY SELECT v_duel_id, v_opponent.user_id, p_user_id;

    ELSE
        -- No opponent found, enter the queue

        -- Delete any previous entry for this user
        DELETE FROM matchmaking_queue WHERE user_id = p_user_id;

        -- Insert new entry
        INSERT INTO matchmaking_queue (user_id, match_type, expires_at)
        VALUES (p_user_id, p_match_type, NOW() + interval '60 seconds');

        -- Return nothing, client will wait
        RETURN;
    END IF;
END;
$$ LANGUAGE plpgsql;
