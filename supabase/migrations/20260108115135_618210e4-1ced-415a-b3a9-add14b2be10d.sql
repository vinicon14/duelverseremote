-- Add level column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

-- Create function to calculate level from points
CREATE OR REPLACE FUNCTION public.calculate_level_from_points(p_points INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Level formula: cada 100 pontos = 1 nível
  -- Nível 1: 0-99 pontos
  -- Nível 2: 100-199 pontos
  -- etc.
  RETURN GREATEST(1, (p_points / 100) + 1);
END;
$$;

-- Create function to update level and notify on level up
CREATE OR REPLACE FUNCTION public.update_level_on_points_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_level INTEGER;
  v_new_level INTEGER;
BEGIN
  -- Calcular níveis
  v_old_level := COALESCE(OLD.level, 1);
  v_new_level := calculate_level_from_points(NEW.points);
  
  -- Atualizar nível
  NEW.level := v_new_level;
  
  -- Se subiu de nível, criar notificação
  IF v_new_level > v_old_level THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      NEW.user_id,
      'level_up',
      'Subiu de Nível!',
      format('Parabéns! Você alcançou o Nível %s!', v_new_level),
      jsonb_build_object(
        'old_level', v_old_level,
        'new_level', v_new_level,
        'points', NEW.points
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update level on points change
DROP TRIGGER IF EXISTS trigger_update_level ON public.profiles;
CREATE TRIGGER trigger_update_level
BEFORE UPDATE OF points ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_level_on_points_change();

-- Update all existing profiles with calculated levels
UPDATE public.profiles 
SET level = calculate_level_from_points(points)
WHERE level != calculate_level_from_points(points) OR level IS NULL;