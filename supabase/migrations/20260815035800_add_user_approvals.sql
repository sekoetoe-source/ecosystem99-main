-- Add is_approved and registration pending states to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_nis text;

-- Update the first user / existing admin users to be automatically approved
UPDATE public.profiles p
SET is_approved = true
FROM public.user_roles ur
WHERE ur.user_id = p.id AND ur.role = 'admin';

-- If no admins exist, default first user to approved
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

  -- First user is approved as admin
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

  -- Only create student record automatically if approved immediately (like seed or admin first user)
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

-- Create RPC to approve a user and register role/details
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
  -- Verify admin status of executor
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan menyetujui akun';
  END IF;

  -- Fetch user full name
  SELECT full_name INTO v_name FROM public.profiles WHERE id = _user_id;

  -- Update profile status
  UPDATE public.profiles 
  SET is_approved = true,
      requested_role = NULL,
      requested_class_id = NULL,
      requested_nis = NULL
  WHERE id = _user_id;

  -- Clean old roles and add the approved role
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role::public.app_role);

  -- Perform role-specific insert/update linking
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
