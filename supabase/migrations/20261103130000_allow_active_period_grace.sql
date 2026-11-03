-- ============================================================================
-- PRODUCTION HOTFIX: ALLOW ACTIVE OPERATIONAL PERIOD TO SERVE TRANSITION
-- ============================================================================
-- Memastikan bahwa periode operasional yang berstatus ACTIVE dan belum ditutup (closed)
-- oleh admin tetap dapat memproses validasi biasa maupun susulan saat pergantian bulan,
-- tanpa terputus secara mendadak hanya karena tanggal kalender melewati end_date.

CREATE OR REPLACE FUNCTION public.record_operational_validation(
  p_student_id uuid,
  p_session text,
  p_item_codes text[],
  p_source public.validation_source DEFAULT 'scan',
  p_station text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  actor_officer uuid := public.current_officer_id();
  today_wib date := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  now_time_wib time := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::time;
  target_number integer;
  target_period public.periods%ROWTYPE;
  target_session public.operational_sessions%ROWTYPE;
  existing_validation public.validations%ROWTYPE;
  requested_codes text[];
  total_points integer := 0;
  validation_id uuid;
  session_label text;
BEGIN
  IF actor IS NULL OR NOT (public.has_role(actor, 'admin') OR public.has_role(actor, 'officer')) THEN
    RAISE EXCEPTION 'Hanya petugas atau administrator yang dapat mencatat pemindaian.';
  END IF;

  IF public.has_role(actor, 'officer') AND actor_officer IS NULL THEN
    RAISE EXCEPTION 'Akun petugas tidak memiliki data pos yang aktif.';
  END IF;

  IF p_session NOT IN ('entry', 'break') THEN
    RAISE EXCEPTION 'Sesi yang dipilih tidak valid.';
  END IF;

  target_number := CASE p_session WHEN 'entry' THEN 1 ELSE 2 END;
  session_label := CASE p_session WHEN 'entry' THEN 'Sesi 1' ELSE 'Sesi 2' END;

  -- Validasi Jadwal Sesi Server-side (Asia/Jakarta)
  IF p_session = 'entry' THEN
    IF now_time_wib < time '06:30:00' OR now_time_wib > time '12:59:59' THEN
      RAISE EXCEPTION 'Sesi 1 hanya dapat dipilih pada jadwal Sesi 1 (06.30–12.59 WIB).';
    END IF;
  ELSIF p_session = 'break' THEN
    IF now_time_wib < time '13:00:00' OR now_time_wib > time '14:59:59' THEN
      RAISE EXCEPTION 'Sesi 2 hanya dapat dipilih pada jadwal Sesi 2 (13.00–14.59 WIB).';
    END IF;
  END IF;

  -- Periode Aktif: prioritaskan periode yang mencakup hari ini, atau periode aktif terakhir yang belum ditutup
  SELECT * INTO target_period
  FROM public.periods p
  WHERE p.status = 'ACTIVE'
    AND p.name NOT ILIKE '%testing%'
    AND p.name NOT ILIKE '%uji coba%'
    AND p.start_date <= today_wib
  ORDER BY
    CASE WHEN p.end_date >= today_wib THEN 0 ELSE 1 END,
    p.start_date DESC,
    p.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tidak ada periode operasional aktif hari ini.';
  END IF;

  -- Operational Session
  SELECT * INTO target_session
  FROM public.operational_sessions s
  WHERE s.period_id = target_period.id
    AND s.session_number = target_number
    AND s.enabled
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi % tidak diaktifkan pada periode ini.', session_label;
  END IF;

  -- Deduplikasi
  SELECT v.* INTO existing_validation
  FROM public.validations v
  WHERE v.student_id = p_student_id
    AND v.session = p_session
    AND v.day = today_wib
    AND v.status <> 'rejected'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'kind', 'duplicate',
      'message', format('Siswa sudah tercatat pada %s hari ini.', session_label),
      'validation_id', existing_validation.id,
      'session', p_session,
      'created_at', existing_validation.created_at
    );
  END IF;

  -- Format requested codes
  requested_codes := ARRAY(
    SELECT DISTINCT code FROM unnest(coalesce(p_item_codes, '{}')) AS codes(code) WHERE code <> ''
  );

  IF cardinality(requested_codes) = 0 THEN
    RAISE EXCEPTION 'Pilih minimal satu item yang dibawa siswa.';
  END IF;

  IF p_session = 'entry' THEN
    IF EXISTS (SELECT 1 FROM unnest(requested_codes) AS codes(code) WHERE code NOT IN ('tumbler', 'lunchbox')) THEN
      RAISE EXCEPTION 'Sesi 1 hanya menerima Tumbler dan Kotak Makan.';
    END IF;
  ELSIF p_session = 'break' THEN
    IF EXISTS (SELECT 1 FROM unnest(requested_codes) AS codes(code) WHERE code NOT IN ('tumbler', 'lunchbox', 'break_combo')) THEN
      RAISE EXCEPTION 'Item yang dipilih tidak valid untuk Sesi 2.';
    END IF;
    IF 'break_combo' = ANY(requested_codes) OR ('tumbler' = ANY(requested_codes) AND 'lunchbox' = ANY(requested_codes)) THEN
      requested_codes := ARRAY['break_combo'];
    END IF;
  END IF;

  -- Insert validation
  validation_id := gen_random_uuid();
  INSERT INTO public.validations (
    id, student_id, officer_id, status, source, station,
    reviewed_by, reviewed_at, period_id, operational_session_id, session, day
  ) VALUES (
    validation_id, p_student_id, actor_officer, 'approved', p_source,
    coalesce(nullif(trim(p_station), ''), 'Pos Scanner'),
    actor, clock_timestamp(), target_period.id, target_session.id, p_session, today_wib
  );

  -- Insert validation items
  INSERT INTO public.validation_items (validation_id, item_code, student_id, points, day)
  SELECT validation_id, e.code, p_student_id, e.points, today_wib
  FROM public.eco_items e
  WHERE e.code = ANY(requested_codes) AND e.active;

  SELECT coalesce(sum(e.points), 0)::integer INTO total_points
  FROM public.eco_items e
  WHERE e.code = ANY(requested_codes);

  RETURN jsonb_build_object(
    'kind', 'success',
    'validation_id', validation_id,
    'session', p_session,
    'day', today_wib,
    'item_codes', requested_codes,
    'points_added', total_points,
    'message', 'Pemindaian berhasil dicatat.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_operational_validation(uuid, text, text[], public.validation_source, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_operational_validation(uuid, text, text[], public.validation_source, text) TO authenticated;
