CREATE POLICY "Usuarios podem se inscrever" ON public.tournament_participants
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios podem cancelar sua inscricao" ON public.tournament_participants
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Criador pode remover participantes" ON public.tournament_participants
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.created_by = auth.uid()));

CREATE POLICY "Usuarios podem atualizar sua inscricao" ON public.tournament_participants
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);