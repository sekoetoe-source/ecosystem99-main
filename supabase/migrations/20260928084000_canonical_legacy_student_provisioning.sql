-- ====================================================================
-- MIGRATION: 20260928084000_canonical_legacy_student_provisioning.sql
-- Description: Canonical provisioning for legacy students in public.students.
-- Provisions Supabase Auth identity, profile, student role, and links
-- students.profile_id canonically without altering existing student records.
-- ====================================================================

-- 0. CLEANUP TEMPORARY HELPER
DROP FUNCTION IF EXISTS public.get_auth_identities_columns();

-- 1. DROP OBSOLETE OVERLOADS OF admin_create_user TO PREVENT PGRST203 AMBIGUITY
DROP FUNCTION IF EXISTS public.admin_create_user(
  text,
  text,
  text,
  public.app_role,
  uuid,
  text
);

DROP FUNCTION IF EXISTS public.admin_create_user(
  text,
  text,
  text,
  text,
  uuid,
  text
);

-- 2. EXTEND admin_create_user TO SUPPORT _nis AND LINK EXISTING STUDENTS
CREATE OR REPLACE FUNCTION public.admin_create_user(
  _email text,
  _password text,
  _full_name text,
  _role text,
  _class_id uuid DEFAULT NULL,
  _station text DEFAULT NULL,
  _nis text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_password text;
  v_target_nis text;
BEGIN
  -- Verify admin status of executor
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan membuat akun baru';
  END IF;

  -- Validate role input
  IF _role NOT IN ('student', 'teacher', 'officer', 'admin') THEN
    RAISE EXCEPTION 'Role tidak valid: %', _role;
  END IF;

  -- Teacher role validation: class_id is required
  IF _role = 'teacher' THEN
    IF _class_id IS NULL THEN
      RAISE EXCEPTION 'Wali Kelas wajib memilih kelas yang diampu';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id) THEN
      RAISE EXCEPTION 'Kelas dengan ID % tidak ditemukan', _class_id;
    END IF;
  END IF;

  -- Encrypt password with pgcrypto
  v_encrypted_password := extensions.crypt(_password, extensions.gen_salt('bf'));

  -- Insert directly into auth.users
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

  -- Insert auth identity with correct uuid id and provider_id
  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', _email),
    'email',
    NULL,
    now(),
    now()
  );

  -- Set profile immediately to approved with clean request state
  INSERT INTO public.profiles (id, full_name, is_approved, requested_role, requested_class_id, requested_nis)
  VALUES (v_user_id, _full_name, true, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE
  SET full_name = _full_name,
      is_approved = true,
      requested_role = NULL,
      requested_class_id = NULL,
      requested_nis = NULL;

  -- Set role in user_roles
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, _role::public.app_role);

  -- Role-specific entity linking
  IF _role = 'student' THEN
    v_target_nis := NULLIF(TRIM(_nis), '');
    IF v_target_nis IS NULL AND _email LIKE '%@smpn99.sch.id' THEN
      v_target_nis := split_part(_email, '@', 1);
    END IF;

    IF v_target_nis IS NOT NULL AND EXISTS (SELECT 1 FROM public.students WHERE nis = v_target_nis) THEN
      UPDATE public.students
      SET profile_id = v_user_id,
          full_name = COALESCE(NULLIF(TRIM(_full_name), ''), full_name),
          class_id = COALESCE(_class_id, class_id)
      WHERE nis = v_target_nis;
    ELSE
      INSERT INTO public.students (profile_id, nis, full_name, class_id)
      VALUES (
        v_user_id,
        COALESCE(v_target_nis, 'S' || to_char(now(), 'YYMMDD') || substr(replace(v_user_id::text, '-', ''), 1, 6)),
        _full_name,
        _class_id
      )
      ON CONFLICT (nis) DO UPDATE
      SET profile_id = v_user_id,
          full_name = EXCLUDED.full_name,
          class_id = COALESCE(EXCLUDED.class_id, students.class_id);
    END IF;

  ELSIF _role = 'teacher' THEN
    UPDATE public.classes SET homeroom_teacher_id = NULL WHERE homeroom_teacher_id = v_user_id;
    UPDATE public.classes SET homeroom_teacher_id = NULL WHERE id = _class_id;
    UPDATE public.classes SET homeroom_teacher_id = v_user_id WHERE id = _class_id;
  ELSIF _role = 'officer' THEN
    INSERT INTO public.officers (profile_id, full_name, station)
    VALUES (v_user_id, _full_name, COALESCE(_station, 'Gerbang Utama'));
  END IF;

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, uuid, text, text) TO authenticated;


-- 2. CANONICAL RPC FOR BATCH / SINGLE PROVISIONING OF LEGACY STUDENTS
CREATE OR REPLACE FUNCTION public.admin_provision_legacy_students(
  _default_password text DEFAULT 'S!swa@Smpn99jkt',
  _student_nis text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_encrypted_password text;
  v_new_provisioned_count integer := 0;
  v_linked_existing_count integer := 0;
  v_skipped_count integer := 0;
  v_clean_nis text;
  v_email text;
  v_existing_user_id uuid;
  v_user_id uuid;
  r RECORD;
BEGIN
  -- Verify admin status of executor
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan menjalankan provisioning siswa';
  END IF;

  -- Validate password
  IF _default_password IS NULL OR length(trim(_default_password)) < 6 THEN
    RAISE EXCEPTION 'Password default minimal 6 karakter';
  END IF;

  -- Pre-compute password encryption hash using pgcrypto blowfish
  v_encrypted_password := extensions.crypt(_default_password, extensions.gen_salt('bf'));

  -- Loop through target students
  FOR r IN
    SELECT id, nis, full_name, class_id, profile_id
    FROM public.students
    WHERE (_student_nis IS NULL OR nis = TRIM(_student_nis))
      AND active IS NOT FALSE
      AND nis IS NOT NULL
      AND TRIM(nis) <> ''
    ORDER BY full_name
  LOOP
    v_clean_nis := TRIM(r.nis);
    v_email := v_clean_nis || '@smpn99.sch.id';

    -- 1. Check if student already has a valid linked profile and auth user
    IF r.profile_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.profile_id) THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;
    END IF;

    -- 2. Check if an Auth user already exists with this deterministic email
    SELECT id INTO v_existing_user_id FROM auth.users WHERE LOWER(email) = LOWER(v_email);

    IF v_existing_user_id IS NOT NULL THEN
      -- Existing Auth user found: do NOT touch their password, just link profile and student record
      INSERT INTO public.profiles (id, full_name, is_approved, requested_role, requested_class_id, requested_nis)
      VALUES (v_existing_user_id, r.full_name, true, NULL, NULL, NULL)
      ON CONFLICT (id) DO UPDATE
      SET is_approved = true,
          requested_role = NULL,
          requested_class_id = NULL,
          requested_nis = NULL;

      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_existing_user_id, 'student'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;

      UPDATE public.students
      SET profile_id = v_existing_user_id
      WHERE id = r.id;

      v_linked_existing_count := v_linked_existing_count + 1;
      CONTINUE;
    END IF;

    -- 3. Create brand new Auth user with deterministic email & default password
    v_user_id := gen_random_uuid();

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
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      v_encrypted_password,
      now(),
      '{"provider": "email", "providers": ["email"]}',
      jsonb_build_object('full_name', r.full_name, 'nis', v_clean_nis),
      false,
      now(),
      now(),
      NULL,
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      NULL,
      now(),
      now()
    );

    INSERT INTO public.profiles (id, full_name, is_approved, requested_role, requested_class_id, requested_nis)
    VALUES (v_user_id, r.full_name, true, NULL, NULL, NULL)
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        is_approved = true,
        requested_role = NULL,
        requested_class_id = NULL,
        requested_nis = NULL;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'student'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.students
    SET profile_id = v_user_id
    WHERE id = r.id;

    v_new_provisioned_count := v_new_provisioned_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'new_provisioned', v_new_provisioned_count,
    'linked_existing', v_linked_existing_count,
    'skipped_already_linked', v_skipped_count,
    'total_processed', v_new_provisioned_count + v_linked_existing_count + v_skipped_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_provision_legacy_students(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_provision_legacy_students(text, text) TO authenticated;
