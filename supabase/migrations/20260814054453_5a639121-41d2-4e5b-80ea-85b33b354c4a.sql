-- ENUMS
CREATE TYPE public.app_role AS ENUM ('student','officer','admin');
CREATE TYPE public.validation_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.validation_source AS ENUM ('scan','manual');
CREATE TYPE public.redemption_status AS ENUM ('pending','fulfilled','cancelled');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT 'Pengguna',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- CLASSES
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  homeroom_teacher text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.classes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- STUDENTS
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  nis text NOT NULL UNIQUE,
  full_name text NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.students TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- OFFICERS
CREATE TABLE public.officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  station text NOT NULL DEFAULT 'Gerbang Utama',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.officers TO authenticated;
GRANT ALL ON public.officers TO service_role;
ALTER TABLE public.officers ENABLE ROW LEVEL SECURITY;

-- ECO ITEMS
CREATE TABLE public.eco_items (
  code text PRIMARY KEY,
  label text NOT NULL,
  points integer NOT NULL DEFAULT 50,
  co2_grams integer NOT NULL DEFAULT 80,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.eco_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.eco_items TO authenticated;
GRANT ALL ON public.eco_items TO service_role;
ALTER TABLE public.eco_items ENABLE ROW LEVEL SECURITY;

-- VALIDATIONS
CREATE TABLE public.validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  officer_id uuid REFERENCES public.officers(id) ON DELETE SET NULL,
  status public.validation_status NOT NULL DEFAULT 'pending',
  source public.validation_source NOT NULL DEFAULT 'scan',
  station text,
  note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX validations_student_idx ON public.validations(student_id, created_at DESC);
CREATE INDEX validations_status_idx ON public.validations(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validations TO authenticated;
GRANT ALL ON public.validations TO service_role;
ALTER TABLE public.validations ENABLE ROW LEVEL SECURITY;

-- VALIDATION ITEMS
CREATE TABLE public.validation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id uuid NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  item_code text NOT NULL REFERENCES public.eco_items(code),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date,
  UNIQUE (validation_id, item_code),
  UNIQUE (student_id, item_code, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_items TO authenticated;
GRANT ALL ON public.validation_items TO service_role;
ALTER TABLE public.validation_items ENABLE ROW LEVEL SECURITY;

-- REWARDS
CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cost_points integer NOT NULL DEFAULT 500,
  stock integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rewards TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

-- REDEMPTIONS
CREATE TABLE public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE RESTRICT,
  points_spent integer NOT NULL,
  status public.redemption_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.redemptions TO authenticated;
GRANT ALL ON public.redemptions TO service_role;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.students WHERE profile_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_officer_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.officers WHERE profile_id = auth.uid() LIMIT 1;
$$;

-- POLICIES
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "classes_read" ON public.classes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "classes_admin" ON public.classes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "students_read" ON public.students FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "students_admin" ON public.students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "students_claim_own" ON public.students FOR UPDATE TO authenticated
  USING (profile_id IS NULL OR profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "officers_read" ON public.officers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR profile_id = auth.uid());
CREATE POLICY "officers_admin" ON public.officers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "eco_items_read" ON public.eco_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "eco_items_admin" ON public.eco_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "validations_select" ON public.validations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR student_id = public.current_student_id()
    OR officer_id = public.current_officer_id()
  );
CREATE POLICY "validations_insert_officer" ON public.validations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'officer') AND officer_id = public.current_officer_id())
  );
CREATE POLICY "validations_admin_update" ON public.validations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "validations_admin_delete" ON public.validations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "validation_items_select" ON public.validation_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR student_id = public.current_student_id()
    OR EXISTS (SELECT 1 FROM public.validations v WHERE v.id = validation_id AND v.officer_id = public.current_officer_id())
  );
CREATE POLICY "validation_items_insert" ON public.validation_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.validations v WHERE v.id = validation_id AND v.officer_id = public.current_officer_id())
  );
CREATE POLICY "validation_items_admin" ON public.validation_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "rewards_read" ON public.rewards FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "rewards_admin" ON public.rewards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "redemptions_select" ON public.redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR student_id = public.current_student_id());
CREATE POLICY "redemptions_insert_own" ON public.redemptions FOR INSERT TO authenticated
  WITH CHECK (student_id = public.current_student_id());
CREATE POLICY "redemptions_admin" ON public.redemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- SIGNUP TRIGGER: profile + role (first user becomes admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_name text;
  v_nis text;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1));
  v_nis := NULLIF(NEW.raw_user_meta_data->>'nis','');

  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, v_name)
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    v_role := 'admin';
  ELSE
    v_role := 'student';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  IF v_role = 'student' THEN
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

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- VIEWS
CREATE VIEW public.student_scores WITH (security_invoker = on) AS
SELECT
  s.id AS student_id,
  s.nis,
  s.full_name,
  s.avatar_url,
  s.class_id,
  c.name AS class_name,
  COALESCE(earned.points, 0) AS earned_points,
  COALESCE(spent.points, 0) AS spent_points,
  COALESCE(earned.points, 0) - COALESCE(spent.points, 0) AS balance_points,
  COALESCE(earned.scans, 0) AS total_items
FROM public.students s
LEFT JOIN public.classes c ON c.id = s.class_id
LEFT JOIN (
  SELECT vi.student_id, SUM(vi.points) AS points, COUNT(*) AS scans
  FROM public.validation_items vi
  JOIN public.validations v ON v.id = vi.validation_id
  WHERE v.status = 'approved'
  GROUP BY vi.student_id
) earned ON earned.student_id = s.id
LEFT JOIN (
  SELECT r.student_id, SUM(r.points_spent) AS points
  FROM public.redemptions r WHERE r.status <> 'cancelled'
  GROUP BY r.student_id
) spent ON spent.student_id = s.id;
GRANT SELECT ON public.student_scores TO anon, authenticated;

CREATE VIEW public.class_scores WITH (security_invoker = on) AS
SELECT c.id AS class_id, c.name AS class_name,
  COUNT(s.id) AS student_count,
  COALESCE(SUM(ss.earned_points),0) AS total_points,
  CASE WHEN COUNT(s.id) = 0 THEN 0
    ELSE ROUND(COALESCE(SUM(ss.earned_points),0)::numeric / COUNT(s.id), 0) END AS avg_points
FROM public.classes c
LEFT JOIN public.students s ON s.class_id = c.id
LEFT JOIN public.student_scores ss ON ss.student_id = s.id
GROUP BY c.id, c.name;
GRANT SELECT ON public.class_scores TO anon, authenticated;

-- STREAK
CREATE OR REPLACE FUNCTION public.student_streak(_student_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date;
  v_cursor date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_count integer := 0;
BEGIN
  FOR v_day IN
    SELECT DISTINCT vi.day FROM public.validation_items vi
    JOIN public.validations v ON v.id = vi.validation_id
    WHERE vi.student_id = _student_id AND v.status = 'approved'
    ORDER BY vi.day DESC
  LOOP
    IF v_day = v_cursor THEN
      v_count := v_count + 1;
      v_cursor := v_cursor - 1;
    ELSIF v_day = v_cursor - 1 AND v_count = 0 THEN
      v_count := 1;
      v_cursor := v_day - 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- SEED
INSERT INTO public.eco_items (code, label, points, co2_grams) VALUES
  ('tumbler','Tumbler', 100, 82),
  ('lunchbox','Kotak Makan', 50, 45);

INSERT INTO public.classes (name, homeroom_teacher) VALUES
  ('7A','Bu Ratna'), ('7B','Pak Dedi'), ('8A','Bu Sinta'), ('8B','Pak Anwar'), ('9A','Bu Lestari'), ('9B','Pak Gunawan');

INSERT INTO public.students (nis, full_name, class_id) VALUES
  ('2023058491','Alya Kusuma', (SELECT id FROM public.classes WHERE name='9A')),
  ('2023058492','Bagas Pratama', (SELECT id FROM public.classes WHERE name='9A')),
  ('2023058493','Citra Maharani', (SELECT id FROM public.classes WHERE name='9B')),
  ('2023058494','Dimas Saputra', (SELECT id FROM public.classes WHERE name='8A')),
  ('2023058495','Eka Ramadhani', (SELECT id FROM public.classes WHERE name='8A')),
  ('2023058496','Farhan Nugroho', (SELECT id FROM public.classes WHERE name='8B')),
  ('2023058497','Gita Anindya', (SELECT id FROM public.classes WHERE name='7A')),
  ('2023058498','Hafiz Alamsyah', (SELECT id FROM public.classes WHERE name='7A')),
  ('2023058499','Intan Permata', (SELECT id FROM public.classes WHERE name='7B')),
  ('2023058500','Joko Wibisono', (SELECT id FROM public.classes WHERE name='9B'));

INSERT INTO public.rewards (name, description, cost_points, stock) VALUES
  ('Voucher Kantin Rp10.000','Tukar jajan di kantin sekolah', 500, 25),
  ('Voucher Kantin Rp25.000','Voucher jajan spesial Jawara Lingkungan', 1200, 10),
  ('Botol Tumbler Eco','Tumbler resmi School Ecosystem', 2500, 5),
  ('Sertifikat Jawara Lingkungan','Sertifikat resmi dari sekolah', 800, 50);

-- Demo history (approved validations for the last days)
DO $$
DECLARE
  s record;
  d int;
  v_id uuid;
  idx int := 0;
BEGIN
  FOR s IN SELECT id FROM public.students ORDER BY nis LOOP
    idx := idx + 1;
    FOR d IN 1..(3 + (idx % 6)) LOOP
      INSERT INTO public.validations (student_id, status, source, station, created_at, reviewed_at)
      VALUES (s.id, 'approved', 'scan', 'Gerbang Utama',
              now() - (d || ' days')::interval, now() - (d || ' days')::interval)
      RETURNING id INTO v_id;
      INSERT INTO public.validation_items (validation_id, item_code, student_id, points, day)
      VALUES (v_id, 'tumbler', s.id, 100, ((now() AT TIME ZONE 'Asia/Jakarta')::date - d));
      IF (d + idx) % 2 = 0 THEN
        INSERT INTO public.validation_items (validation_id, item_code, student_id, points, day)
        VALUES (v_id, 'lunchbox', s.id, 50, ((now() AT TIME ZONE 'Asia/Jakarta')::date - d));
      END IF;
    END LOOP;
  END LOOP;
END $$;