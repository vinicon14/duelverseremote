-- add_foreign_keys_to_judge_logs.sql

-- Add foreign key constraint for player_id to profiles(user_id)
ALTER TABLE public.judge_logs
ADD CONSTRAINT judge_logs_player_id_fkey
FOREIGN KEY (player_id)
REFERENCES public.profiles (user_id)
ON DELETE CASCADE;

-- Add foreign key constraint for judge_id to profiles(user_id)
ALTER TABLE public.judge_logs
ADD CONSTRAINT judge_logs_judge_id_fkey
FOREIGN KEY (judge_id)
REFERENCES public.profiles (user_id)
ON DELETE SET NULL;
