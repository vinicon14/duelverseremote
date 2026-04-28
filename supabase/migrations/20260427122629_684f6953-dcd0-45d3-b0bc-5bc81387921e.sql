CREATE POLICY "Authors can delete own global chat messages"
ON public.global_chat_messages
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);