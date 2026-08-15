-- Create secure RPC to delete users from auth.users (requires security definer)
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Check if the executor has admin role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan menghapus akun';
  END IF;

  -- Delete from auth.users which cascades to profiles and other related rows
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
