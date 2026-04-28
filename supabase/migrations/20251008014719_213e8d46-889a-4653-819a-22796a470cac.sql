-- Adicionar colunas de life points à tabela live_duels
ALTER TABLE public.live_duels 
ADD COLUMN player1_lp integer NOT NULL DEFAULT 8000,
ADD COLUMN player2_lp integer NOT NULL DEFAULT 8000;