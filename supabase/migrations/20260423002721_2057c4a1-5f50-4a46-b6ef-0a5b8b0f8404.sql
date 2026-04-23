-- Drop the old 4-argument matchmake overload to resolve function ambiguity.
-- Keep only the 5-arg version which includes p_language_code.
DROP FUNCTION IF EXISTS public.matchmake(text, uuid, text, integer);