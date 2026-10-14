-- Session-specific item values: the legacy 250-point combo remains exclusive to Sesi 2.
UPDATE public.eco_items SET points = 100 WHERE code = 'tumbler';
UPDATE public.eco_items SET points = 50 WHERE code = 'lunchbox';
UPDATE public.eco_items SET points = 250, label = 'Combo Tumbler + Lunchbox', active = true WHERE code = 'break_combo';

CREATE OR REPLACE FUNCTION public.record_late_validation(p_student_id uuid, p_session text, p_item_codes text[], p_reason text DEFAULT NULL, p_source public.validation_source DEFAULT 'manual', p_station text DEFAULT NULL, p_scan_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  actor_officer uuid := public.current_officer_id();
  requested_day date := coalesce(p_scan_day, (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date);
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
BEGIN
  IF actor IS NULL OR NOT (public.has_role(actor, 'admin') OR public.has_role(actor, 'officer')) THEN
    RAISE EXCEPTION 'Hanya petugas atau administrator yang dapat mencatat pemindaian susulan.';
  END IF;
  IF public.has_role(actor, 'officer') AND actor_officer IS NULL THEN
    RAISE EXCEPTION 'Akun petugas tidak memiliki data pos yang aktif.';
  END IF;
  IF requested_day > (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'Tanggal pemindaian susulan tidak boleh di masa depan.';
  END IF;
  IF p_session NOT IN ('entry', 'break') THEN
    RAISE EXCEPTION 'Pilih Sesi 1 atau Sesi 2 untuk pemindaian susulan.';
  END IF;
  IF length(coalesce(audit_reason, '')) > 300 THEN
    RAISE EXCEPTION 'Alasan pemindaian susulan maksimal 300 karakter.';
  END IF;

  target_number := CASE p_session WHEN 'entry' THEN 1 ELSE 2 END;
  SELECT * INTO target_period
  FROM public.periods p
  WHERE p.status = 'ACTIVE'
    AND requested_day BETWEEN p.start_date AND p.end_date
    AND p.late_scan_start_date IS NOT NULL
    AND requested_day BETWEEN p.late_scan_start_date AND p.late_scan_end_date
  ORDER BY p.start_date DESC, p.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tanggal yang dipilih tidak termasuk rentang pemindaian susulan periode aktif.';
  END IF;

  SELECT * INTO target_session
  FROM public.operational_sessions s
  WHERE s.period_id = target_period.id AND s.session_number = target_number AND s.enabled
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi yang dipilih tidak digunakan pada periode aktif.';
  END IF;

  requested_codes := ARRAY(SELECT DISTINCT code FROM unnest(coalesce(p_item_codes, '{}')) AS codes(code) WHERE code <> '');
  IF cardinality(requested_codes) = 0 THEN
    RAISE EXCEPTION 'Pilih sedikitnya satu barang yang dibawa siswa.';
  END IF;
  IF p_session = 'entry' AND EXISTS (
    SELECT 1 FROM unnest(requested_codes) AS codes(code) WHERE code NOT IN ('tumbler', 'lunchbox')
  ) THEN
    RAISE EXCEPTION 'Sesi 1 hanya menerima Tumbler dan Kotak Makan; combo hanya berlaku pada Sesi 2.';
  END IF;
  IF p_session = 'break' AND EXISTS (
    SELECT 1 FROM unnest(requested_codes) AS codes(code) WHERE code NOT IN ('tumbler', 'lunchbox', 'break_combo')
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
  WHERE v.student_id = p_student_id AND v.period_id = target_period.id
    AND v.session = p_session AND v.day = requested_day AND v.status <> 'rejected'
  LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    validation_id := existing_validation.id;
    SELECT coalesce(array_agg(vi.item_code), '{}') INTO existing_codes
    FROM public.validation_items vi WHERE vi.validation_id = validation_id;

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
      missing_codes := ARRAY(SELECT code FROM unnest(requested_codes) AS codes(code) WHERE code <> ALL(existing_codes));
    END IF;

    IF cardinality(missing_codes) = 0 THEN
      RETURN jsonb_build_object('kind', 'duplicate', 'message', 'Catatan untuk sesi ini sudah lengkap; poin tidak ditambahkan lagi.', 'validation_id', validation_id, 'session', p_session);
    END IF;
    action_name := 'items_added';
  ELSE
    validation_id := gen_random_uuid();
    action_name := 'late_entry';
    missing_codes := requested_codes;
    INSERT INTO public.validations(id, student_id, officer_id, status, source, station, note, reviewed_by, reviewed_at, period_id, operational_session_id, session, day)
    VALUES(validation_id, p_student_id, actor_officer, 'approved', p_source,
      coalesce(nullif(trim(p_station), ''), 'Pemindaian susulan'),
      CASE WHEN audit_reason IS NULL THEN 'Pemindaian susulan' ELSE 'Pemindaian susulan: ' || audit_reason END,
      actor, clock_timestamp(), target_period.id, target_session.id, p_session, requested_day);
  END IF;

  INSERT INTO public.validation_items(validation_id, item_code, student_id, points, day)
  SELECT validation_id, e.code, p_student_id, e.points, requested_day
  FROM public.eco_items e WHERE e.code = ANY(missing_codes) AND e.active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salah satu jenis barang tidak aktif atau tidak ditemukan.';
  END IF;
  SELECT coalesce(sum(e.points), 0)::integer INTO points_added
  FROM public.eco_items e WHERE e.code = ANY(missing_codes);

  note_text := coalesce(nullif(trim(existing_validation.note), ''), '');
  IF action_name = 'items_added' THEN
    UPDATE public.validations SET note = concat_ws(E'\n', nullif(note_text, ''), 'Koreksi susulan' || CASE WHEN audit_reason IS NULL THEN '' ELSE ': ' || audit_reason END)
    WHERE id = validation_id;
  END IF;

  INSERT INTO public.validation_late_entry_audit(validation_id, student_id, period_id, session, action, actor_id, reason, item_codes, points_added)
  VALUES(validation_id, p_student_id, target_period.id, p_session, action_name, actor,
    coalesce(audit_reason, 'Tanggal ' || requested_day::text), missing_codes, points_added);

  RETURN jsonb_build_object('kind', 'success', 'action', action_name, 'validation_id', validation_id,
    'session', p_session, 'day', requested_day, 'item_codes', missing_codes, 'points_added', points_added,
    'message', CASE action_name WHEN 'late_entry' THEN 'Pemindaian susulan berhasil dicatat pada sesi yang dipilih.' ELSE 'Barang yang tertinggal berhasil ditambahkan ke catatan sesi yang dipilih.' END);
END;
$$;
REVOKE ALL ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) TO authenticated;
