-- Create secure RPC to create users directly in auth.users by admin (requires security definer)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  _email text,
  _password text,
  _full_name text,
  _role text,
  _class_id uuid DEFAULT NULL,
  _station text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_password text;
BEGIN
  -- Verify admin status of executor
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan membuat akun baru';
  END IF;

  -- Hash password using bcrypt compatible with pgcrypto (prefixed with extensions schema)
  v_encrypted_password := extensions.crypt(_password, extensions.gen_salt('bf'));

  -- Insert directly into auth.users (Supabase Schema)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    last_sign_in_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    _email,
    v_encrypted_password,
    now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', _full_name),
    false,
    now(),
    now(),
    NULL,
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO v_user_id;

  -- Create identity for the user so it displays correctly in Auth console
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id, 'email', _email),
    'email',
    NULL,
    now(),
    now()
  );

  -- Set profiles to approved immediately (since created by admin)
  UPDATE public.profiles
  SET is_approved = true,
      full_name = _full_name
  WHERE id = v_user_id;

  -- Update role
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) 
  VALUES (v_user_id, _role::public.app_role);

  -- If student, setup student details
  IF _role = 'student' THEN
    INSERT INTO public.students (profile_id, nis, full_name, class_id)
    VALUES (
      v_user_id,
      'S' || to_char(now(), 'YYMMDD') || substr(replace(v_user_id::text, '-', ''), 1, 6),
      _full_name,
      _class_id
    );
  ELSIF _role = 'officer' THEN
    INSERT INTO public.officers (profile_id, full_name, station)
    VALUES (v_user_id, _full_name, COALESCE(_station, 'Gerbang Utama'));
  END IF;

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, uuid, text) TO authenticated;
