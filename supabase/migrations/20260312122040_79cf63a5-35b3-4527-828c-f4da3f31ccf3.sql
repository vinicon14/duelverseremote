
-- Allow admins to INSERT notifications
CREATE POLICY "Admins can insert notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Allow admins to DELETE notifications
CREATE POLICY "Admins can delete notifications" ON public.notifications
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));
