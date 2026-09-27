-- ====================================================================
-- MIGRATION: 20260927230000_canonical_user_approval_lifecycle.sql
-- Description: Root fix for user approval lifecycle & role consistency.
-- Single Source of Truth: public.profiles.is_approved = true.
-- Pending users have is_approved = false and NO row in user_roles.
-- Approved users have is_approved = true and exactly ONE active role.
-- Roles supported: student, teacher (Wali Kelas), officer, admin.
-- ====================================================================

-- 1. SCHEMA PREREQUISITES
-- Ensure 'teacher' value exists in app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher';

-- Ensure homeroom_teacher_id column exists on classes table
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS homeroom_teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure profiles approval columns exist with correct defaults
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_nis text;

-- 2. TRIGGER FUNCTION: handle_new_user()
-- Purpose: Create initial profile upon signup without premature active role assignment.
-- Non-admin users are strictly pending (is_approved = false, NO entry in user_roles).
-- Bootstrap admin users (if designated by email or first user) are auto-approved as admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_nis text;
  v_req_role text;
  v_is_admin boolean := false;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_nis := NULLIF(NEW.raw_user_meta_data->>'nis', '');
  v_req_role := NULLIF(NEW.raw_user_meta_data->>'requested_role', '');

  -- Bootstrap admin check: predetermined admin emails or first user when no admin exists
  IF LOWER(NEW.email) = 'admin.smpn99@gmail.com'
     OR LOWER(NEW.email) LIKE 'admin%@smpn99.%'
     OR LOWER(NEW.email) LIKE 'admin.%'
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    v_is_admin := true;
  END IF;

  IF v_is_admin THEN
    -- Admin bootstrap: immediately approved with admin role
    INSERT INTO public.profiles (id, full_name, is_approved, requested_role, requested_class_id, requested_nis)
    VALUES (NEW.id, v_name, true, NULL, NULL, NULL)
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        is_approved = true,
        requested_role = NULL,
        requested_class_id = NULL,
        requested_nis = NULL;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Regular users: created as pending with NO active user_roles
    INSERT INTO public.profiles (id, full_name, is_approved, requested_role, requested_class_id, requested_nis)
    VALUES (NEW.id, v_name, false, v_req_role, NULL, v_nis)
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        requested_nis = COALESCE(EXCLUDED.requested_nis, profiles.requested_nis);
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger is active on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- 3. RPC: admin_approve_user()
-- Canonical approval boundary for all roles (student, teacher, officer, admin).
-- Validates executor is admin, activates profile, assigns role, and links entity.
CREATE OR REPLACE FUNCTION public.admin_approve_user(
  _user_id uuid,
  _role text,
  _class_id uuid DEFAULT NULL,
  _nis text DEFAULT NULL,
  _station text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  -- Verify admin status of executor
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan menyetujui akun';
  END IF;

  -- Validate role input
  IF _role NOT IN ('student', 'teacher', 'officer', 'admin') THEN
    RAISE EXCEPTION 'Role tidak valid: %', _role;
  END IF;

  -- Verify target user/profile exists
  SELECT full_name INTO v_name FROM public.profiles WHERE id = _user_id;
  IF v_name IS NULL THEN
    SELECT COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) INTO v_name
    FROM auth.users
    WHERE id = _user_id;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Pengguna dengan ID % tidak ditemukan', _user_id;
    END IF;
  END IF;

  -- Teacher role validation: class_id is strictly required and must exist
  IF _role = 'teacher' THEN
    IF _class_id IS NULL THEN
      RAISE EXCEPTION 'Wali Kelas wajib memilih kelas yang diampu';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id) THEN
      RAISE EXCEPTION 'Kelas dengan ID % tidak ditemukan', _class_id;
    END IF;
  END IF;

  -- Atomic update of profile: mark approved and wipe pending requests
  UPDATE public.profiles
  SET is_approved = true,
      requested_role = NULL,
      requested_class_id = NULL,
      requested_nis = NULL
  WHERE id = _user_id;

  -- Replace any previous roles with the single approved role
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role::public.app_role);

  -- Role-specific entity linking
  IF _role = 'student' THEN
    IF EXISTS (SELECT 1 FROM public.students WHERE profile_id = _user_id) THEN
      UPDATE public.students
      SET full_name = COALESCE(v_name, full_name),
          nis = COALESCE(_nis, nis),
          class_id = COALESCE(_class_id, class_id)
      WHERE profile_id = _user_id;
    ELSIF _nis IS NOT NULL AND EXISTS (SELECT 1 FROM public.students WHERE nis = _nis AND profile_id IS NULL) THEN
      UPDATE public.students
      SET profile_id = _user_id,
          full_name = v_name,
          class_id = COALESCE(_class_id, class_id)
      WHERE nis = _nis;
    ELSE
      INSERT INTO public.students (profile_id, nis, full_name, class_id)
      VALUES (
        _user_id,
        COALESCE(_nis, 'S' || to_char(now(),'YYMMDD') || substr(replace(_user_id::text,'-',''),1,6)),
        v_name,
        _class_id
      )
      ON CONFLICT (nis) DO UPDATE
      SET profile_id = _user_id,
          full_name = v_name,
          class_id = COALESCE(_class_id, students.class_id);
    END IF;

  ELSIF _role = 'teacher' THEN
    -- Release previous homeroom assignment of this teacher if any
    UPDATE public.classes
    SET homeroom_teacher_id = NULL
    WHERE homeroom_teacher_id = _user_id;

    -- Release previous homeroom teacher of the target class if any
    UPDATE public.classes
    SET homeroom_teacher_id = NULL
    WHERE id = _class_id AND homeroom_teacher_id IS NOT NULL AND homeroom_teacher_id <> _user_id;

    -- Assign teacher to the class
    UPDATE public.classes
    SET homeroom_teacher_id = _user_id
    WHERE id = _class_id;

  ELSIF _role = 'officer' THEN
    INSERT INTO public.officers (profile_id, full_name, station)
    VALUES (_user_id, v_name, COALESCE(_station, 'Gerbang Utama'))
    ON CONFLICT (profile_id) DO UPDATE
    SET full_name = v_name,
        station = COALESCE(_station, officers.station);

  ELSIF _role = 'admin' THEN
    -- Admin has no additional entity linking
    NULL;
  END IF;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_user(uuid, text, uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, text, uuid, text, text) TO authenticated;

-- 4. RPC: admin_create_user()
-- Canonical direct creation by admin: creates auth.users, marks profile approved,
-- sets exact role in user_roles, and links entity appropriately.
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

  -- Insert auth identity
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
    INSERT INTO public.students (profile_id, nis, full_name, class_id)
    VALUES (
      v_user_id,
      'S' || to_char(now(), 'YYMMDD') || substr(replace(v_user_id::text, '-', ''), 1, 6),
      _full_name,
      _class_id
    );
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

REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, uuid, text) TO authenticated;

-- 5. RPC: admin_delete_user()
-- Cleans up all references before deleting auth.users to avoid foreign key errors.
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan menghapus akun';
  END IF;

  -- Release references across public tables
  UPDATE public.students SET profile_id = NULL WHERE profile_id = _user_id;
  UPDATE public.classes SET homeroom_teacher_id = NULL WHERE homeroom_teacher_id = _user_id;
  DELETE FROM public.officers WHERE profile_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;

  -- Delete from auth.users
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- 6. DATA REPAIR FOR EXISTING INCONSISTENT USERS
-- A. For pending users (is_approved IS NOT TRUE):
-- Remove premature active roles from user_roles so pending users have NO active role.
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE is_approved IS NOT TRUE
);

-- B. For approved users (is_approved = true):
-- Clear leftover requested_* values so they never appear as pending in dashboard.
UPDATE public.profiles
SET requested_role = NULL,
    requested_class_id = NULL,
    requested_nis = NULL
WHERE is_approved = true;

-- C. Normalize any profiles where is_approved IS NULL to false
UPDATE public.profiles
SET is_approved = false
WHERE is_approved IS NULL;
