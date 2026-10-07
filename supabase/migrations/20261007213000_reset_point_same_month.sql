-- Operational cycles may share calendar dates after an intra-month reset;
-- period_id remains the source of truth for validation and score attribution.
ALTER TABLE public.periods DROP CONSTRAINT IF EXISTS periods_no_overlap;

CREATE OR REPLACE FUNCTION public.reset_point()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  actor uuid := auth.uid(); src periods%ROWTYPE; dst periods%ROWTYPE;
  reset_date date := CURRENT_DATE;
  month_end date := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  period_name text; tv int; av int; rv int; pv int; pts int; students int;
BEGIN
  IF actor IS NULL OR NOT has_role(actor, 'admin') THEN RAISE EXCEPTION 'Only administrators can reset points'; END IF;
  SELECT * INTO src FROM periods WHERE status = 'ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active period exists'; END IF;
  SELECT count(*)::int, count(*) FILTER (WHERE status='approved')::int, count(*) FILTER (WHERE status='rejected')::int, count(*) FILTER (WHERE status='pending')::int INTO tv, av, rv, pv FROM validations WHERE period_id = src.id;
  SELECT coalesce(sum(vi.points) FILTER (WHERE v.status='approved'), 0)::int, count(DISTINCT vi.student_id) FILTER (WHERE v.status='approved')::int INTO pts, students FROM validation_items vi JOIN validations v ON v.id = vi.validation_id WHERE v.period_id = src.id;
  UPDATE periods SET status='CLOSED', closed_at=now() WHERE id=src.id;
  period_name := CASE EXTRACT(MONTH FROM reset_date)::int WHEN 1 THEN 'Januari' WHEN 2 THEN 'Februari' WHEN 3 THEN 'Maret' WHEN 4 THEN 'April' WHEN 5 THEN 'Mei' WHEN 6 THEN 'Juni' WHEN 7 THEN 'Juli' WHEN 8 THEN 'Agustus' WHEN 9 THEN 'September' WHEN 10 THEN 'Oktober' WHEN 11 THEN 'November' WHEN 12 THEN 'Desember' END || ' ' || EXTRACT(YEAR FROM reset_date)::int || ' · Reset ' || to_char(reset_date, 'DD');
  INSERT INTO periods(name, start_date, end_date, status, academic_year, activated_at) VALUES (period_name, reset_date, month_end, 'ACTIVE', src.academic_year, now()) RETURNING * INTO dst;
  INSERT INTO period_reset_audit_events(event, actor_id, source_period_id, source_period_name, source_start_date, source_end_date, target_period_id, target_period_name, target_start_date, target_end_date, before_total_validations, before_approved_validations, before_rejected_validations, before_pending_validations, before_total_earned_points, before_students_with_points, after_total_earned_points, reason) VALUES ('PERIOD_RESET', actor, src.id, src.name, src.start_date, src.end_date, dst.id, dst.name, dst.start_date, dst.end_date, tv, av, rv, pv, pts, students, 0, 'Reset point: siklus operasional baru dimulai pada tanggal reset');
  RETURN jsonb_build_object('source_period_name', src.name, 'target_period_id', dst.id, 'target_period_name', dst.name, 'target_start_date', dst.start_date, 'target_end_date', dst.end_date, 'after_total_earned_points', 0);
END; $$;
