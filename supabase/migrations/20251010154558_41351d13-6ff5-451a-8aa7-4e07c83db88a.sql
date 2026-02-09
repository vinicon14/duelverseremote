-- Adicionar coluna 'content' na tabela advertisements
ALTER TABLE public.advertisements 
ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '';