-- Migração para arquivar torneios automaticamente após 3 dias do término
-- ============================================================================

-- 1. Adicionar campo archived_at na tabela tournaments
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- 2. Adicionar índice para busca eficiente de torneios não arquivados
CREATE INDEX IF NOT EXISTS idx_tournaments_archived_at 
ON public.tournaments(archived_at) 
WHERE archived_at IS NULL;

-- 3. Função para arquivar torneios completados automaticamente após 3 dias
CREATE OR REPLACE FUNCTION public.archive_completed_tournaments()
RETURNS INTEGER AS $$
DECLARE
    v_archived_count INTEGER := 0;
BEGIN
    -- Atualizar torneios completados que terminaram há mais de 3 dias
    UPDATE public.tournaments
    SET archived_at = NOW()
    WHERE status = 'completed'
    AND archived_at IS NULL
    AND (
        -- Se tiver end_date, usa ele. Senão, usa created_at + 7 dias como fallback
        (end_date IS NOT NULL AND end_date < NOW() - INTERVAL '3 days')
        OR 
        (end_date IS NULL AND created_at < NOW() - INTERVAL '10 days')
    );
    
    GET DIAGNOSTICS v_archived_count = ROW_COUNT;
    
    RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função para listar apenas torneios ativos (não arquivados)
CREATE OR REPLACE FUNCTION public.get_active_tournaments(
    p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    prize_pool INTEGER,
    max_participants INTEGER,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ,
    created_by UUID,
    entry_fee INTEGER,
    tournament_type TEXT,
    current_round INTEGER,
    total_rounds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.name,
        t.description,
        t.prize_pool,
        t.max_participants,
        t.start_date,
        t.end_date,
        t.status,
        t.created_at,
        t.created_by,
        t.entry_fee,
        t.tournament_type,
        t.current_round,
        t.total_rounds
    FROM public.tournaments t
    WHERE t.archived_at IS NULL
    AND (p_status IS NULL OR t.status = p_status)
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY STABLE;

-- 5. Função para listar torneios arquivados (histórico)
CREATE OR REPLACE FUNCTION public.get_archived_tournaments(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    prize_pool INTEGER,
    max_participants INTEGER,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_by UUID,
    entry_fee INTEGER,
    tournament_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.name,
        t.description,
        t.prize_pool,
        t.max_participants,
        t.start_date,
        t.end_date,
        t.status,
        t.created_at,
        t.archived_at,
        t.created_by,
        t.entry_fee,
        t.tournament_type
    FROM public.tournaments t
    WHERE t.archived_at IS NOT NULL
    ORDER BY t.archived_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY STABLE;

-- 6. Atualizar política RLS para esconder torneios arquivados da listagem padrão
-- Primeiro, remover políticas existentes de SELECT
DROP POLICY IF EXISTS "Tournaments are viewable by everyone" ON public.tournaments;
DROP POLICY IF EXISTS "Anyone can view tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Tournaments visible to everyone" ON public.tournaments;

-- Criar nova política que exclui torneios arquivados da listagem geral
CREATE POLICY "Tournaments visible to everyone"
ON public.tournaments FOR SELECT
USING (archived_at IS NULL);

-- 7. Política especial para admins verem todos os torneios (incluindo arquivados)
DROP POLICY IF EXISTS "Admins can view all tournaments" ON public.tournaments;

CREATE POLICY "Admins can view all tournaments"
ON public.tournaments FOR SELECT
USING (is_admin(auth.uid()));

-- 8. Trigger para atualizar archived_at quando o torneio é completado manualmente
CREATE OR REPLACE FUNCTION public.set_tournament_archive_date()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o status mudou para 'completed' e não tem data de término, define end_date
    IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.end_date IS NULL THEN
        NEW.end_date = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_set_tournament_completion ON public.tournaments;

-- Criar trigger
CREATE TRIGGER trigger_set_tournament_completion
    BEFORE UPDATE ON public.tournaments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_tournament_archive_date();

-- 9. Comentários para documentação
COMMENT ON COLUMN public.tournaments.archived_at IS 'Data em que o torneio foi arquivado (3 dias após término)';
COMMENT ON FUNCTION public.archive_completed_tournaments() IS 'Arquiva automaticamente torneios completados após 3 dias';
COMMENT ON FUNCTION public.get_active_tournaments(TEXT) IS 'Retorna apenas torneios não arquivados';
COMMENT ON FUNCTION public.get_archived_tournaments(INTEGER) IS 'Retorna histórico de torneios arquivados';
