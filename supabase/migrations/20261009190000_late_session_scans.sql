CREATE OR REPLACE FUNCTION public.get_active_operational_session(p_at timestamptz DEFAULT now())
RETURNS TABLE (
  id uuid,
  period_id uuid,
  session_number integer,
  name text,
  start_time time,
  end_time time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_period AS (
    SELECT p.id
    FROM public.periods p
    WHERE p.status = 'ACTIVE'
      AND p.start_date <= (p_at AT TIME ZONE 'Asia/Jakarta')::date
      AND p.end_date >= (p_at AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY p.start_date DESC, p.id DESC
    LIMIT 1
  )
  SELECT s.id, s.period_id, s.session_number, s.name, s.start_time, s.end_time
  FROM public.operational_sessions s
  JOIN current_period cp ON cp.id = s.period_id
  WHERE s.enabled
    AND s.session_number IN (1, 2)
    AND s.start_time <= (p_at AT TIME ZONE 'Asia/Jakarta')::time
    AND (p_at AT TIME ZONE 'Asia/Jakarta')::time < s.end_time
  ORDER BY s.session_number
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_operational_session(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_operational_sessions(p_at timestamptz DEFAULT now())
RETURNS TABLE (
  id uuid,
  period_id uuid,
  session_number integer,
  name text,
  start_time time,
  end_time time,
  enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_period AS (
    SELECT p.id
    FROM public.periods p
    WHERE p.status = 'ACTIVE'
      AND p.start_date <= (p_at AT TIME ZONE 'Asia/Jakarta')::date
      AND p.end_date >= (p_at AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY p.start_date DESC, p.id DESC
    LIMIT 1
  ), ranked AS (
    SELECT s.*,
      row_number() OVER (
        PARTITION BY s.session_number
        ORDER BY s.enabled DESC, s.updated_at DESC, s.created_at DESC, s.id DESC
      ) AS row_number
    FROM public.operational_sessions s
    JOIN current_period cp ON cp.id = s.period_id
    WHERE s.session_number IN (1, 2)
  )
  SELECT r.id, r.period_id, r.session_number, r.name, r.start_time, r.end_time, r.enabled
  FROM ranked r
  WHERE r.row_number = 1
  ORDER BY r.session_number;
$$;
GRANT EXECUTE ON FUNCTION public.get_current_operational_sessions(timestamptz) TO authenticated;

CREATE TABLE IF NOT EXISTS public.validation_late_entry_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id uuid NOT NULL REFERENCES public.validations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session IN ('entry', 'break')),
  action text NOT NULL CHECK (action IN ('late_entry', 'items_added')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  item_codes text[] NOT NULL DEFAULT '{}',
  points_added integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.validation_late_entry_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.validation_late_entry_audit FROM anon, authenticated;
GRANT SELECT ON public.validation_late_entry_audit TO authenticated;
GRANT ALL ON public.validation_late_entry_audit TO service_role;
DROP POLICY IF EXISTS "Late entry audit read" ON public.validation_late_entry_audit;
CREATE POLICY "Late entry audit read" ON public.validation_late_entry_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_late_validation(
  p_student_id uuid,
  p_session text,
  p_item_codes text[],
  p_reason text,
  p_source public.validation_source DEFAULT 'manual',
  p_station text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_officer uuid := public.current_officer_id();
  current_day date := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  current_time_wib time := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::time;
  target_number integer;
  target_period public.periods%ROWTYPE;
  target_session public.operational_sessions%ROWTYPE;
  existing_validation public.validations%ROWTYPE;
  existing_codes text[] := '{}';
  requested_codes text[];
  missing_codes text[] := '{}';
  points_added integer := 0;
  points_before integer := 0;
  validation_id uuid;
  action_name text;
  note_text text;
BEGIN
  IF actor IS NULL OR NOT (
    public.has_role(actor, 'admin') OR public.has_role(actor, 'officer')
  ) THEN
    RAISE EXCEPTION 'Hanya petugas atau administrator yang dapat mencatat pemindaian susulan.';
  END IF;

  IF public.has_role(actor, 'officer') AND actor_officer IS NULL THEN
    RAISE EXCEPTION 'Akun petugas tidak memiliki data pos yang aktif.';
  END IF;

  IF p_session NOT IN ('entry', 'break') THEN
    RAISE EXCEPTION 'Sesi yang dipilih tidak valid.';
  END IF;
  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan pemindaian susulan wajib diisi.';
  END IF;
  IF length(trim(p_reason)) > 300 THEN
    RAISE EXCEPTION 'Alasan pemindaian susulan maksimal 300 karakter.';
  END IF;
  IF current_time_wib > time '17:00' THEN
    RAISE EXCEPTION 'Batas pemindaian susulan hari ini adalah pukul 17.00 WIB.';
  END IF;

  target_number := CASE p_session WHEN 'entry' THEN 1 ELSE 2 END;
  SELECT * INTO target_period
  FROM public.periods p
  WHERE p.status = 'ACTIVE'
    AND p.start_date <= current_day
    AND p.end_date >= current_day
  ORDER BY p.start_date DESC, p.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tidak ada periode aktif untuk hari ini. Periode yang ditutup tidak menerima pemindaian baru.';
  END IF;

  SELECT * INTO target_session
  FROM public.operational_sessions s
  WHERE s.period_id = target_period.id
    AND s.session_number = target_number
    AND s.enabled
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi yang dipilih tidak digunakan pada periode aktif.';
  END IF;
  IF current_time_wib <= target_session.end_time THEN
    RAISE EXCEPTION 'Sesi ini belum berakhir. Gunakan pemindaian biasa selama sesi berlangsung.';
  END IF;

  requested_codes := ARRAY(
    SELECT DISTINCT code
    FROM unnest(coalesce(p_item_codes, '{}')) AS codes(code)
    WHERE code <> ''
  );
  IF cardinality(requested_codes) = 0 THEN
    RAISE EXCEPTION 'Pilih sedikitnya satu barang yang dibawa siswa.';
  END IF;
  IF p_session = 'entry' AND EXISTS (
    SELECT 1 FROM unnest(requested_codes) AS codes(code)
    WHERE code NOT IN ('tumbler', 'lunchbox')
  ) THEN
    RAISE EXCEPTION 'Barang yang dipilih tidak sesuai dengan Sesi 1.';
  END IF;
  IF p_session = 'break' AND EXISTS (
    SELECT 1 FROM unnest(requested_codes) AS codes(code)
    WHERE code NOT IN ('tumbler', 'lunchbox', 'break_combo')
  ) THEN
    RAISE EXCEPTION 'Barang yang dipilih tidak sesuai dengan Sesi 2.';
  END IF;
  IF p_session = 'break' AND 'break_combo' = ANY(requested_codes) THEN
    requested_codes := ARRAY['break_combo'];
  ELSIF p_session = 'break' AND 'tumbler' = ANY(requested_codes) AND 'lunchbox' = ANY(requested_codes) THEN
    requested_codes := ARRAY['break_combo'];
  END IF;

  SELECT v.* INTO existing_validation
  FROM public.validations v
  WHERE v.student_id = p_student_id
    AND v.period_id = target_period.id
    AND v.session = p_session
    AND v.day = current_day
    AND v.status <> 'rejected'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    validation_id := existing_validation.id;
    SELECT coalesce(array_agg(vi.item_code), '{}'), coalesce(sum(vi.points), 0)::integer
    INTO existing_codes, points_before
    FROM public.validation_items vi
    WHERE vi.validation_id = validation_id;

    IF 'break_combo' = ANY(existing_codes) THEN
      missing_codes := '{}';
    ELSIF 'break_combo' = ANY(requested_codes) THEN
      IF 'tumbler' = ANY(existing_codes) AND 'lunchbox' = ANY(existing_codes) THEN
        missing_codes := '{}';
      ELSIF 'tumbler' = ANY(existing_codes) THEN
        missing_codes := ARRAY['lunchbox'];
      ELSIF 'lunchbox' = ANY(existing_codes) THEN
        missing_codes := ARRAY['tumbler'];
      ELSE
        missing_codes := ARRAY['break_combo'];
      END IF;
    ELSE
      missing_codes := ARRAY(
        SELECT code FROM unnest(requested_codes) AS codes(code)
        WHERE code <> ALL(existing_codes)
      );
    END IF;

    IF cardinality(missing_codes) = 0 THEN
      RETURN jsonb_build_object(
        'kind', 'duplicate',
        'message', 'Catatan untuk sesi ini sudah lengkap; poin tidak ditambahkan lagi.',
        'validation_id', validation_id,
        'session', p_session
      );
    END IF;
    action_name := 'items_added';
  ELSE
    validation_id := gen_random_uuid();
    action_name := 'late_entry';
    missing_codes := requested_codes;
    INSERT INTO public.validations (
      id, student_id, officer_id, status, source, station, note, reviewed_by,
      reviewed_at, period_id, operational_session_id, session, day
    ) VALUES (
      validation_id,
      p_student_id,
      actor_officer,
      'approved',
      p_source,
      coalesce(nullif(trim(p_station), ''), 'Pemindaian susulan'),
      'Pemindaian susulan: ' || trim(p_reason),
      actor,
      clock_timestamp(),
      target_period.id,
      target_session.id,
      p_session,
      current_day
    );
  END IF;

  INSERT INTO public.validation_items (validation_id, item_code, student_id, points, day)
  SELECT validation_id, e.code, p_student_id, e.points, current_day
  FROM public.eco_items e
  WHERE e.code = ANY(missing_codes)
    AND e.active;
  GET DIAGNOSTICS points_added = ROW_COUNT;
  IF points_added <> cardinality(missing_codes) THEN
    RAISE EXCEPTION 'Salah satu jenis barang tidak aktif atau tidak ditemukan.';
  END IF;
  SELECT coalesce(sum(e.points), 0)::integer INTO points_added
  FROM public.eco_items e WHERE e.code = ANY(missing_codes);

  note_text := coalesce(nullif(trim(existing_validation.note), ''), '');
  IF action_name = 'items_added' THEN
    UPDATE public.validations
    SET note = concat_ws(E'\n', nullif(note_text, ''), 'Koreksi susulan: ' || trim(p_reason))
    WHERE id = validation_id;
  END IF;

  INSERT INTO public.validation_late_entry_audit (
    validation_id, student_id, period_id, session, action, actor_id,
    reason, item_codes, points_added
  ) VALUES (
    validation_id, p_student_id, target_period.id, p_session, action_name,
    actor, trim(p_reason), missing_codes, points_added
  );

  RETURN jsonb_build_object(
    'kind', 'success',
    'action', action_name,
    'validation_id', validation_id,
    'session', p_session,
    'item_codes', missing_codes,
    'points_added', points_added,
    'message', CASE action_name
      WHEN 'late_entry' THEN 'Pemindaian susulan berhasil dicatat.'
      ELSE 'Barang yang tertinggal berhasil ditambahkan ke catatan sesi.'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text) TO authenticated;
