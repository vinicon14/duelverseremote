-- Inserir torneio de exemplo para teste
INSERT INTO tournaments (
  name,
  description,
  max_participants,
  entry_fee,
  prize_pool,
  status,
  start_time,
  created_by
) VALUES (
  'Torneio de Inauguração',
  'Primeiro torneio oficial da plataforma! Participe e ganhe prêmios incríveis.',
  16,
  100,
  1000,
  'upcoming',
  NOW() + INTERVAL '2 hours',
  (SELECT user_id FROM profiles LIMIT 1)
) ON CONFLICT DO NOTHING;