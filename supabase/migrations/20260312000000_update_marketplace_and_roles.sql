-- Update inventory usage logic and adjust admin role checks

-- 1. Upgrade use_inventory_item to return cosmetic descriptions when used
CREATE OR REPLACE FUNCTION public.use_inventory_item(p_inventory_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_item record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- fetch item along with product information
  SELECT i.*, p.name as product_name, p.description as product_description, p.category
  INTO v_item
  FROM user_inventory i
  JOIN marketplace_products p ON i.product_id = p.id
  WHERE i.id = p_inventory_id
    AND i.user_id = v_user_id
    AND i.is_used = false;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já usado');
  END IF;

  -- decrement quantity or mark as used
  IF v_item.quantity > 1 THEN
    UPDATE user_inventory
    SET quantity = quantity - 1
    WHERE id = p_inventory_id;

    RETURN json_build_object(
      'success', true,
      'message', 'Item usado: ' || v_item.product_name,
      'remaining', v_item.quantity - 1
    );
  ELSE
    -- last unit: mark used
    UPDATE user_inventory
    SET is_used = true, used_at = now()
    WHERE id = p_inventory_id;

    IF v_item.category = 'cosmetic' THEN
      -- reveal hidden description for cosmetics
      RETURN json_build_object(
        'success', true,
        'message', 'Item usado: ' || v_item.product_name,
        'description', v_item.product_description
      );
    ELSE
      RETURN json_build_object(
        'success', true,
        'message', 'Item usado: ' || v_item.product_name,
        'item_type', v_item.product_id
      );
    END IF;
  END IF;
END;
$$;

-- 2. Update is_admin helper to treat moderators as administrators as well
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'moderator')
  )
$$;

-- 3. Adjust RLS policy for global chat messages so moderators can delete
DROP POLICY IF EXISTS "Admins can delete global chat messages" ON public.global_chat_messages;
CREATE POLICY "Admins (and moderators) can delete global chat messages" ON public.global_chat_messages
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
