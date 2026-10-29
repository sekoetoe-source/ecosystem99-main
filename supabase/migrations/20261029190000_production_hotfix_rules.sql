-- ============================================================================
-- PRODUCTION HOTFIX: OPERATIONAL SESSIONS, SCAN VALIDATIONS, LATE SCAN & STREAK
-- ============================================================================

-- 1. SINKRONISASI JADWAL OPERASIONAL SESI (Asia/Jakarta)
-- Sesi 1: 06.30 - 12.59 WIB
-- Sesi 2: 13.00 - 14.59 WIB
ALTER TABLE public.operational_sessions DISABLE TRIGGER operational_sessions_no_overlap;

UPDATE public.operational_sessions
SET start_time = time '13:00:00', end_time = time '14:59:00', enabled = true
WHERE session_number = 2;

UPDATE public.operational_sessions
SET start_time = time '06:30:00', end_time = time '12:59:00', enabled = true
WHERE session_number = 1;

ALTER TABLE public.operational_sessions ENABLE TRIGGER operational_sessions_no_overlap;

-- 2. IZINKAN ADMIN MENGELOLA RENTANG TANGGAL SUSULAN PADA PERIODS
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS periods_update_admin ON public.periods;
CREATE POLICY periods_update_admin
  ON public.periods
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT UPDATE ON public.periods TO authenticated;

-- RPC Khusus Admin untuk Mengatur Rentang Tanggal Susulan
CREATE OR REPLACE FUNCTION public.admin_set_late_scan_dates(
  p_period_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  target_period public.periods%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Hanya admin yang diperbolehkan mengatur rentang tanggal susulan';
  END IF;

  SELECT * INTO target_period FROM public.periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Periode tidak ditemukan';
  END IF;

  IF (p_start_date IS NOT NULL AND p_end_date IS NULL) OR (p_start_date IS NULL AND p_end_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Tanggal mulai dan akhir harus diisi bersamaan atau dikosongkan keduanya';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    IF p_start_date > p_end_date THEN
      RAISE EXCEPTION 'Tanggal mulai susulan tidak boleh melebihi tanggal akhir';
    END IF;
    IF p_start_date < target_period.start_date OR p_end_date > target_period.end_date THEN
      RAISE EXCEPTION 'Rentang tanggal susulan harus berada dalam rentang tanggal periode (% s.d. %)', target_period.start_date, target_period.end_date;
    END IF;
  END IF;

  UPDATE public.periods
  SET late_scan_start_date = p_start_date,
      late_scan_end_date = p_end_date
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'late_scan_start_date', p_start_date,
    'late_scan_end_date', p_end_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_late_scan_dates(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_late_scan_dates(uuid, date, date) TO authenticated;

-- 3. RPC VALIDASI OPERASIONAL BIASA (MENGGANTIKAN INSERT LANGSUNG DARI BROWSER)
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

  -- Periode Aktif
  SELECT * INTO target_period
  FROM public.periods p
  WHERE p.status = 'ACTIVE'
    AND p.name NOT ILIKE '%testing%'
    AND p.name NOT ILIKE '%uji coba%'
    AND p.start_date <= today_wib
    AND p.end_date >= today_wib
  ORDER BY p.start_date DESC, p.id DESC
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

-- 4. RPC VALIDASI SUSULAN (DENGAN BATAS WAKTU 15.00-17.00 WIB & RENTANG TANGGAL ADMIN)
CREATE OR REPLACE FUNCTION public.record_late_validation(
  p_student_id uuid,
  p_session text,
  p_item_codes text[],
  p_reason text DEFAULT NULL,
  p_source public.validation_source DEFAULT 'manual',
  p_station text DEFAULT NULL,
  p_scan_day date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  actor_officer uuid := public.current_officer_id();
  today_wib date := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
  now_time_wib time := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::time;
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

  -- Validasi Jam Pelaksanaan Petugas (Wajib 15.00 - 17.00 WIB)
  IF now_time_wib < time '15:00:00' OR now_time_wib > time '17:00:00' THEN
    RAISE EXCEPTION 'Pemindaian susulan hanya dapat dilakukan pada jendela waktu 15.00–17.00 WIB.';
  END IF;

  -- Tanggal aktivitas tidak boleh di masa depan
  IF requested_day > today_wib THEN
    RAISE EXCEPTION 'Tanggal pemindaian susulan tidak boleh di masa depan.';
  END IF;

  -- Cari Periode Operasional Berjalan
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

  -- Validasi Rentang Tanggal Admin (Pesan Error Spesifik & Berbeda dari Jam)
  IF target_period.late_scan_start_date IS NULL 
     OR target_period.late_scan_end_date IS NULL 
     OR requested_day < target_period.late_scan_start_date 
     OR requested_day > target_period.late_scan_end_date THEN
    RAISE EXCEPTION 'Tanggal yang dipilih tidak termasuk rentang pemindaian susulan admin.';
  END IF;

  -- Operational session
  SELECT * INTO target_session
  FROM public.operational_sessions s
  WHERE s.period_id = target_period.id AND s.session_number = target_number AND s.enabled
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi % tidak digunakan pada periode aktif.', session_label;
  END IF;

  -- Sanitasi requested codes
  requested_codes := ARRAY(
    SELECT DISTINCT code FROM unnest(coalesce(p_item_codes, '{}')) AS codes(code) WHERE code <> ''
  );
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

  IF p_session = 'break' AND ('break_combo' = ANY(requested_codes) OR ('tumbler' = ANY(requested_codes) AND 'lunchbox' = ANY(requested_codes))) THEN
    requested_codes := ARRAY['break_combo'];
  END IF;

  -- Cek validasi yang sudah ada untuk hari dan sesi yang diminta
  SELECT v.* INTO existing_validation
  FROM public.validations v
  WHERE v.student_id = p_student_id
    AND v.period_id = target_period.id
    AND v.session = p_session
    AND v.day = requested_day
    AND v.status <> 'rejected'
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
      missing_codes := ARRAY(
        SELECT code FROM unnest(requested_codes) AS codes(code) WHERE code <> ALL(existing_codes)
      );
    END IF;

    IF cardinality(missing_codes) = 0 THEN
      RETURN jsonb_build_object(
        'kind', 'duplicate',
        'message', format('Catatan siswa untuk %s pada tanggal %s sudah lengkap; poin tidak ditambahkan lagi.', session_label, requested_day),
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
      validation_id, p_student_id, actor_officer, 'approved', p_source,
      coalesce(nullif(trim(p_station), ''), 'Pemindaian susulan'),
      CASE WHEN audit_reason IS NULL THEN 'Pemindaian susulan' ELSE 'Pemindaian susulan: ' || audit_reason END,
      actor, clock_timestamp(), target_period.id, target_session.id, p_session, requested_day
    );
  END IF;

  -- Insert item yang belum tercatat dengan poin resminya
  INSERT INTO public.validation_items (validation_id, item_code, student_id, points, day)
  SELECT validation_id, e.code, p_student_id, e.points, requested_day
  FROM public.eco_items e WHERE e.code = ANY(missing_codes) AND e.active;

  SELECT coalesce(sum(e.points), 0)::integer INTO points_added
  FROM public.eco_items e WHERE e.code = ANY(missing_codes);

  note_text := coalesce(nullif(trim(existing_validation.note), ''), '');
  IF action_name = 'items_added' THEN
    UPDATE public.validations
    SET note = concat_ws(E'\n', nullif(note_text, ''), 'Koreksi susulan: ' || audit_reason)
    WHERE id = validation_id;
  END IF;

  -- Catat audit susulan
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
$$;

REVOKE ALL ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) TO authenticated;

-- 5. PERHITUNGAN STREAK SISWA (AKHIR PEKAN SABTU & MINGGU BUKAN HARI GAGAL)
CREATE OR REPLACE FUNCTION public.student_streak(_student_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today_wib date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  cursor_day date;
  last_required_day date;
  dow integer;
  v_streak integer := 0;
  has_scan_today boolean := false;
  has_scan_cursor boolean := false;
BEGIN
  -- Cek apakah siswa sudah scan hari ini
  SELECT EXISTS (
    SELECT 1 FROM public.validations v
    WHERE v.student_id = _student_id
      AND v.status = 'approved'
      AND v.day = today_wib
  ) INTO has_scan_today;

  IF has_scan_today THEN
    cursor_day := today_wib;
  ELSE
    -- Hari ini belum scan. Tentukan hari sekolah wajib terakhir (Jumat jika hari ini Sen/Min/Sab).
    -- isodow: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
    dow := extract(isodow from today_wib);
    IF dow = 1 THEN
      last_required_day := today_wib - 3; -- Jumat pekan lalu
    ELSIF dow = 7 THEN
      last_required_day := today_wib - 2; -- Jumat pekan ini
    ELSIF dow = 6 THEN
      last_required_day := today_wib - 1; -- Jumat pekan ini
    ELSE
      last_required_day := today_wib - 1; -- Kemarin
    END IF;

    -- Jika hari ini akhir pekan dan ada scan hari ini, mulai dari hari ini
    IF (dow = 6 OR dow = 7) AND has_scan_today THEN
      cursor_day := today_wib;
    ELSE
      -- Periksa apakah siswa scan pada hari sekolah wajib terakhir
      SELECT EXISTS (
        SELECT 1 FROM public.validations v
        WHERE v.student_id = _student_id
          AND v.status = 'approved'
          AND v.day = last_required_day
      ) INTO has_scan_cursor;

      IF has_scan_cursor THEN
        cursor_day := last_required_day;
      ELSE
        -- Jika hari ini Minggu dan siswa scan hari Sabtu
        IF dow = 7 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.validations v
            WHERE v.student_id = _student_id
              AND v.status = 'approved'
              AND v.day = (today_wib - 1)
          ) INTO has_scan_cursor;
          IF has_scan_cursor THEN
            cursor_day := today_wib - 1;
          ELSE
            RETURN 0;
          END IF;
        ELSE
          RETURN 0;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Telusuri mundur hari per hari
  WHILE cursor_day IS NOT NULL LOOP
    dow := extract(isodow from cursor_day);

    SELECT EXISTS (
      SELECT 1 FROM public.validations v
      WHERE v.student_id = _student_id
        AND v.status = 'approved'
        AND v.day = cursor_day
    ) INTO has_scan_cursor;

    IF has_scan_cursor THEN
      v_streak := v_streak + 1;
      cursor_day := cursor_day - 1;
    ELSE
      -- Jika cursor jatuh pada Sabtu atau Minggu, lewati tanpa memutus streak
      IF dow = 6 OR dow = 7 THEN
        cursor_day := cursor_day - 1;
      ELSE
        -- Hari sekolah aktif yang terlewat: rangkaian streak terputus
        EXIT;
      END IF;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.student_streak(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_streak(uuid) TO authenticated;
