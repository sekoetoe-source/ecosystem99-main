-- Helper to inspect auth.identities columns
CREATE OR REPLACE FUNCTION public.get_auth_identities_columns()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cols jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type))
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'identities';
  RETURN v_cols;
END;
$$;
