ALTER TABLE public.point_reset_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS point_reset_audit_select_admin ON public.point_reset_audit_events;
CREATE POLICY point_reset_audit_select_admin
  ON public.point_reset_audit_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.point_reset_audit_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_active_period_points_only() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_point() TO authenticated;
