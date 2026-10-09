CREATE TABLE public.point_reset_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  period_id uuid NOT NULL REFERENCES public.periods(id),
  period_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  before_total_points integer NOT NULL,
  before_students_with_points integer NOT NULL,
  reset_validation_items integer NOT NULL,
  reason text NOT NULL
);

ALTER TABLE public.point_reset_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY point_reset_audit_select_admin
  ON public.point_reset_audit_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.point_reset_audit_events FROM anon, authenticated;
GRANT SELECT ON public.point_reset_audit_events TO authenticated;
GRANT ALL ON public.point_reset_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_point_reset_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Point reset audit events are immutable';
END;
$$;
CREATE TRIGGER point_reset_audit_immutable
  BEFORE UPDATE OR DELETE ON public.point_reset_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_point_reset_audit_mutation();

CREATE OR REPLACE FUNCTION public.reset_active_period_points_only()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  active periods%ROWTYPE;
  points_before integer;
  students_before integer;
  item_count integer;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Hanya administrator yang dapat mengatur ulang poin';
  END IF;

  SELECT * INTO active
  FROM public.periods
  WHERE status = 'ACTIVE'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tidak ada periode aktif';
  END IF;

  SELECT coalesce(sum(vi.points), 0)::integer,
         count(DISTINCT vi.student_id)::integer,
         count(*)::integer
  INTO points_before, students_before, item_count
  FROM public.validation_items vi
  JOIN public.validations v ON v.id = vi.validation_id
  WHERE v.period_id = active.id AND vi.points > 0;

  UPDATE public.validation_items vi
  SET points = 0
  FROM public.validations v
  WHERE v.id = vi.validation_id
    AND v.period_id = active.id
    AND vi.points <> 0;

  INSERT INTO public.point_reset_audit_events (
    actor_id, period_id, period_name, before_total_points,
    before_students_with_points, reset_validation_items, reason
  ) VALUES (
    actor, active.id, active.name, points_before, students_before, item_count,
    'Penghapusan poin hasil uji coba; catatan pemindaian dan periode tetap tersimpan'
  );

  RETURN jsonb_build_object(
    'period_id', active.id,
    'period_name', active.name,
    'before_total_points', points_before,
    'before_students_with_points', students_before,
    'reset_validation_items', item_count,
    'after_total_points', 0
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_active_period_points_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_active_period_points_only() TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_point()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.reset_active_period_points_only();
$$;
REVOKE EXECUTE ON FUNCTION public.reset_point() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_point() TO authenticated;
