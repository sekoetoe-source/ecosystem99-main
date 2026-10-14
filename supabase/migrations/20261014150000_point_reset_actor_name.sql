ALTER TABLE public.point_reset_audit_events
  ADD COLUMN IF NOT EXISTS actor_name text;

CREATE OR REPLACE FUNCTION public.reset_active_period_points_only()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  actor_label text;
  active public.periods%ROWTYPE;
  points_before integer;
  students_before integer;
  item_count integer;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Hanya administrator yang dapat mengatur ulang poin';
  END IF;

  SELECT p.full_name INTO actor_label FROM public.profiles p WHERE p.id = actor;
  actor_label := coalesce(nullif(trim(actor_label), ''), actor::text);

  SELECT * INTO active FROM public.periods WHERE status = 'ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tidak ada periode aktif'; END IF;

  SELECT coalesce(sum(vi.points), 0)::integer,
         count(DISTINCT vi.student_id)::integer,
         count(*) FILTER (WHERE vi.points <> 0)::integer
  INTO points_before, students_before, item_count
  FROM public.validation_items vi
  JOIN public.validations v ON v.id = vi.validation_id
  WHERE v.period_id = active.id;

  UPDATE public.validation_items vi SET points = 0
  FROM public.validations v
  WHERE v.id = vi.validation_id AND v.period_id = active.id AND vi.points <> 0;

  INSERT INTO public.point_reset_audit_events (
    actor_id, actor_name, period_id, period_name, before_total_points,
    before_students_with_points, reset_validation_items, reason
  ) VALUES (
    actor, actor_label, active.id, active.name, points_before, students_before, item_count,
    'Penghapusan poin hasil uji coba; catatan pemindaian dan periode tetap tersimpan'
  );

  RETURN jsonb_build_object('period_id', active.id, 'period_name', active.name,
    'before_total_points', points_before, 'before_students_with_points', students_before,
    'reset_validation_items', item_count, 'after_total_points', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_active_period_points_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_active_period_points_only() TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_point()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.reset_active_period_points_only();
$$;
REVOKE EXECUTE ON FUNCTION public.reset_point() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_point() TO authenticated;
