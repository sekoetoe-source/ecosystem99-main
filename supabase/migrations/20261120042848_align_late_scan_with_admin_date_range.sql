CREATE OR REPLACE FUNCTION public.record_late_validation(
  p_student_id uuid,
  p_session text,
  p_item_codes text[],
  p_reason text DEFAULT NULL,
  p_source public.validation_source DEFAULT 'manual',
  p_station text DEFAULT NULL,
  p_scan_day date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  actor uuid := auth.uid();
  actor_officer uuid := public.current_officer_id();
  today_wib date := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  requested_day date := coalesce(p_scan_day, today_wib);
  target_number integer;
  target_period public.periods%ROWTYPE;
  target_session public.operational_sessions%ROWTYPE;
  existing_validation public.validations%ROWTYPE;
  existing_codes text[] := '{}';
  requested_codes text[];
  missing_codes text[] := '{}';
  points_added integer := 0;
  validation_id uuid;
  action_name text;
  note_text text;
  audit_reason text := nullif(trim(coalesce(p_reason, '')), '');
  session_label text;
BEGIN
  IF actor IS NULL OR NOT (public.has_role(actor, 'admin') OR public.has_role(actor, 'officer')) THEN
    RAISE EXCEPTION 'Hanya petugas atau administrator yang dapat mencatat pemindaian susulan.';
  END IF;

  IF public.has_role(actor, 'officer') AND actor_officer IS NULL THEN
    RAISE EXCEPTION 'Akun petugas tidak memiliki data pos yang aktif.';
  END IF;

  IF p_session NOT IN ('entry', 'break') THEN
    RAISE EXCEPTION 'Pilih Sesi 1 atau Sesi 2 untuk pemindaian susulan.';
  END IF;

  target_number := CASE p_session WHEN 'entry' THEN 1 ELSE 2 END;
  session_label := CASE p_session WHEN 'entry' THEN 'Sesi 1' ELSE 'Sesi 2' END;

  IF audit_reason IS NULL THEN
    RAISE EXCEPTION 'Alasan pemindaian susulan wajib diisi.';
  END IF;

  IF length(audit_reason) > 300 THEN
    RAISE EXCEPTION 'Alasan pemindaian susulan maksimal 300 karakter.';
  END IF;

  -- No fixed clock-time window: the admin-configured date range controls late scanning.
  IF requested_day > today_wib THEN
    RAISE EXCEPTION 'Tanggal pemindaian susulan tidak boleh di masa depan.';
  END IF;

  SELECT * INTO target_period
  FROM public.periods p
  WHERE p.status = 'ACTIVE'
    AND p.name NOT ILIKE '%testing%'
    AND p.name NOT ILIKE '%uji coba%'
    AND p.start_date <= requested_day
    AND p.end_date >= requested_day
  ORDER BY p.start_date DESC, p.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tidak ada periode operasional aktif yang menaungi tanggal %s.', requested_day;
  END IF;

  IF target_period.late_scan_start_date IS NULL
     OR target_period.late_scan_end_date IS NULL
     OR requested_day < target_period.late_scan_start_date
     OR requested_day > target_period.late_scan_end_date THEN
    RAISE EXCEPTION 'Tanggal yang dipilih tidak termasuk rentang pemindaian susulan admin.';
  END IF;

  SELECT * INTO target_session
  FROM public.operational_sessions s
  WHERE s.period_id = target_period.id
    AND s.session_number = target_number
    AND s.enabled
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi % tidak digunakan pada periode aktif.', session_label;
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
    RAISE EXCEPTION 'Sesi 1 hanya menerima Tumbler dan Kotak Makan; combo hanya berlaku pada Sesi 2.';
  END IF;

  IF p_session = 'break' AND EXISTS (
    SELECT 1 FROM unnest(requested_codes) AS codes(code)
    WHERE code NOT IN ('tumbler', 'lunchbox', 'break_combo')
  ) THEN
    RAISE EXCEPTION 'Barang yang dipilih tidak sesuai dengan Sesi 2.';
  END IF;

  IF p_session = 'break' AND (
    'break_combo' = ANY(requested_codes)
    OR ('tumbler' = ANY(requested_codes) AND 'lunchbox' = ANY(requested_codes))
  ) THEN
    requested_codes := ARRAY['break_combo'];
  END IF;

  SELECT v.* INTO existing_validation
  FROM public.validations v
  WHERE v.student_id = p_student_id
    AND v.period_id = target_period.id
    AND v.session = p_session
    AND v.day = requested_day
    AND v.status <> 'rejected'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    validation_id := existing_validation.id;

    SELECT coalesce(array_agg(vi.item_code), '{}')
    INTO existing_codes
    FROM public.validation_items vi
    WHERE vi.validation_id = validation_id;

    IF p_session = 'break' AND 'break_combo' = ANY(existing_codes) THEN
      missing_codes := '{}';
    ELSIF p_session = 'break' AND 'break_combo' = ANY(requested_codes) THEN
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
        SELECT code
        FROM unnest(requested_codes) AS codes(code)
        WHERE code <> ALL(existing_codes)
      );
    END IF;

    IF cardinality(missing_codes) = 0 THEN
      RETURN jsonb_build_object(
        'kind', 'duplicate',
        'message', format(
          'Catatan siswa untuk %s pada tanggal %s sudah lengkap; poin tidak ditambahkan lagi.',
          session_label,
          requested_day
        ),
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
      id, student_id, officer_id, status, source, station, note,
      reviewed_by, reviewed_at, period_id, operational_session_id, session, day
    ) VALUES (
      validation_id,
      p_student_id,
      actor_officer,
      'approved',
      p_source,
      coalesce(nullif(trim(p_station), ''), 'Pemindaian susulan'),
      'Pemindaian susulan: ' || audit_reason,
      actor,
      clock_timestamp(),
      target_period.id,
      target_session.id,
      p_session,
      requested_day
    );
  END IF;

  INSERT INTO public.validation_items (
    validation_id, item_code, student_id, points, day
  )
  SELECT validation_id, e.code, p_student_id, e.points, requested_day
  FROM public.eco_items e
  WHERE e.code = ANY(missing_codes)
    AND e.active;

  GET DIAGNOSTICS points_added = ROW_COUNT;
  IF points_added <> cardinality(missing_codes) THEN
    RAISE EXCEPTION 'Salah satu jenis barang tidak aktif atau tidak ditemukan.';
  END IF;

  SELECT coalesce(sum(e.points), 0)::integer
  INTO points_added
  FROM public.eco_items e
  WHERE e.code = ANY(missing_codes);

  note_text := coalesce(nullif(trim(existing_validation.note), ''), '');
  IF action_name = 'items_added' THEN
    UPDATE public.validations
    SET note = concat_ws(E'\n', nullif(note_text, ''), 'Koreksi susulan: ' || audit_reason)
    WHERE id = validation_id;
  END IF;

  INSERT INTO public.validation_late_entry_audit (
    validation_id, student_id, period_id, session, action, actor_id, reason, item_codes, points_added
  ) VALUES (
    validation_id, p_student_id, target_period.id, p_session, action_name, actor,
    audit_reason, missing_codes, points_added
  );

  RETURN jsonb_build_object(
    'kind', 'success',
    'action', action_name,
    'validation_id', validation_id,
    'session', p_session,
    'day', requested_day,
    'item_codes', missing_codes,
    'points_added', points_added,
    'message', CASE action_name
      WHEN 'late_entry' THEN 'Pemindaian susulan berhasil dicatat pada sesi yang dipilih.'
      ELSE 'Barang yang tertinggal berhasil ditambahkan ke catatan sesi yang dipilih.'
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) TO authenticated;
