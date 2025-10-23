-- Adicionar 'judge' ao enum app_role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'judge' 
    AND enumtypid = 'app_role'::regtype
  ) THEN
    ALTER TYPE app_role ADD VALUE 'judge';
  END IF;
END
$$;