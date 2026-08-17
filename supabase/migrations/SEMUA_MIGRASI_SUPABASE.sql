-- ====================================================================
-- MASTER MIGRATION SCRIPT FOR ECOSYSTEM99
-- Copy and run ALL of this in Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. ADD APPROVAL CONTROL COLUMNS TO PROFILES TABLE
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_nis text;

-- Approve existing profiles / admin users
UPDATE public.profiles SET is_approved = true WHERE is_approved IS NOT TRUE;

-- 2. CREATE RPC TO DELETE USERS (ADMIN ONLY)
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan menghapus akun';
  END IF;

  -- Hapus/lepaskan relasi data tabel public terlebih dahulu agar tidak terkendala foreign key
  UPDATE public.students SET profile_id = NULL WHERE profile_id = _user_id;
  DELETE FROM public.officers WHERE profile_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;

  -- Baru hapus akun utama dari auth.users
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- 3. CREATE RPC TO APPROVE USERS (ADMIN ONLY)
CREATE OR REPLACE FUNCTION public.admin_approve_user(
  _user_id uuid,
  _role text,
  _class_id uuid,
  _nis text,
  _station text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan menyetujui akun';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = _user_id;

  UPDATE public.profiles 
  SET is_approved = true,
      requested_role = NULL,
      requested_class_id = NULL,
      requested_nis = NULL
  WHERE id = _user_id;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role::public.app_role);

  IF _role = 'student' THEN
    IF _nis IS NOT NULL AND EXISTS (SELECT 1 FROM public.students WHERE nis = _nis AND profile_id IS NULL) THEN
      UPDATE public.students 
      SET profile_id = _user_id, 
          full_name = v_name, 
          class_id = _class_id 
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
          class_id = _class_id;
    END IF;
  ELSIF _role = 'officer' THEN
    INSERT INTO public.officers (profile_id, full_name, station)
    VALUES (_user_id, v_name, COALESCE(_station, 'Gerbang Utama'))
    ON CONFLICT (profile_id) DO UPDATE 
    SET full_name = v_name, 
        station = COALESCE(_station, 'Gerbang Utama');
  END IF;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_user(uuid, text, uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, text, uuid, text, text) TO authenticated;

-- 4. CREATE RPC TO CREATE USERS DIRECTLY (ADMIN ONLY)
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
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan membuat akun baru';
  END IF;

  v_encrypted_password := extensions.crypt(_password, extensions.gen_salt('bf'));

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

  UPDATE public.profiles
  SET is_approved = true,
      full_name = _full_name
  WHERE id = v_user_id;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) 
  VALUES (v_user_id, _role::public.app_role);

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

-- 5. UPDATE SIGNUP TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_name text;
  v_nis text;
  v_is_approved boolean := false;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  v_nis := NULLIF(NEW.raw_user_meta_data->>'nis','');

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    v_role := 'admin';
    v_is_approved := true;
  ELSE
    v_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, full_name, is_approved) 
  VALUES (NEW.id, v_name, v_is_approved)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role) 
  VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  IF v_is_approved AND v_role = 'student' THEN
    IF v_nis IS NOT NULL AND EXISTS (SELECT 1 FROM public.students WHERE nis = v_nis AND profile_id IS NULL) THEN
      UPDATE public.students SET profile_id = NEW.id, full_name = v_name WHERE nis = v_nis;
    ELSE
      INSERT INTO public.students (profile_id, nis, full_name)
      VALUES (NEW.id, COALESCE(v_nis, 'S' || to_char(now(),'YYMMDD') || substr(replace(NEW.id::text,'-',''),1,6)), v_name)
      ON CONFLICT (nis) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. TRAKTIR KOPI TRANSACTIONS TABLE AND STATS RPC
CREATE TABLE IF NOT EXISTS public.traktir_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mayar_invoice_id TEXT UNIQUE,
    donor_name TEXT NOT NULL DEFAULT 'Donatur Kopi',
    donor_email TEXT,
    donor_mobile TEXT,
    amount NUMERIC NOT NULL CHECK (amount >= 1000),
    payment_method TEXT DEFAULT 'Mayar PG',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    pay_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes')
);

CREATE OR REPLACE FUNCTION public.cancel_expired_traktir_transactions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_count INT := 0;
BEGIN
    UPDATE public.traktir_transactions
    SET status = 'cancelled', updated_at = now()
    WHERE status = 'pending' AND expired_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_expired_traktir_transactions() TO anon, authenticated;

ALTER TABLE public.traktir_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read success traktir_transactions" ON public.traktir_transactions;
CREATE POLICY "Public read success traktir_transactions"
    ON public.traktir_transactions FOR SELECT
    USING (status = 'success');

DROP POLICY IF EXISTS "Admin full access traktir_transactions" ON public.traktir_transactions;
CREATE POLICY "Admin full access traktir_transactions"
    ON public.traktir_transactions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_traktir_updated_at ON public.traktir_transactions;
CREATE TRIGGER set_traktir_updated_at
    BEFORE UPDATE ON public.traktir_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.get_traktir_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_total_amount NUMERIC := 0;
    v_total_count INT := 0;
    v_hosting_amount NUMERIC := 0;
    v_reward_amount NUMERIC := 0;
    v_maintenance_amount NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_total_amount, v_total_count
    FROM public.traktir_transactions
    WHERE status = 'success';

    v_hosting_amount := ROUND(v_total_amount * 0.50, 0);
    v_reward_amount := ROUND(v_total_amount * 0.40, 0);
    v_maintenance_amount := ROUND(v_total_amount * 0.10, 0);

    RETURN jsonb_build_object(
        'total_amount', v_total_amount,
        'total_count', v_total_count,
        'hosting_amount', v_hosting_amount,
        'reward_amount', v_reward_amount,
        'maintenance_amount', v_maintenance_amount,
        'hosting_pct', 50,
        'reward_pct', 40,
        'maintenance_pct', 10
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_traktir_stats() TO anon, authenticated;

