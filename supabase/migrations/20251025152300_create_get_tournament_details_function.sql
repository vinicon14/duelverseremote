CREATE OR REPLACE FUNCTION get_tournament_details(tournament_id_param UUID)
RETURNS json
LANGUAGE sql
AS $$
  SELECT
    json_build_object(
      'id', t.id,
      'name', t.name,
      'description', t.description,
      'status', t.status,
      'prize_pool', t.prize_pool,
      'max_participants', t.max_participants,
      'start_date', t.start_date,
      'created_by', t.created_by,
      'participants', (
        SELECT json_agg(
          json_build_object(
            'user_id', p.user_id,
            'status', tp.status,
            'score', tp.score,
            'wins', tp.wins,
            'losses', tp.losses,
            'username', p.username,
            'points', p.points
          )
        )
        FROM tournament_participants tp
        JOIN profiles p ON tp.user_id = p.user_id
        WHERE tp.tournament_id = t.id
      ),
      'matches', (
        SELECT json_agg(
          json_build_object(
            'id', tm.id,
            'round', tm.round_number,
            'status', tm.status,
            'player1', (SELECT json_build_object('username', p1.username, 'points', p1.points) FROM profiles p1 WHERE p1.user_id = tm.player1_id),
            'player2', (SELECT json_build_object('username', p2.username, 'points', p2.points) FROM profiles p2 WHERE p2.user_id = tm.player2_id),
            'winner_id', tm.winner_id
          )
        )
        FROM tournament_matches tm
        WHERE tm.tournament_id = t.id
      )
    )
  FROM
    tournaments t
  WHERE
    t.id = tournament_id_param
  GROUP BY
    t.id;
$$;
