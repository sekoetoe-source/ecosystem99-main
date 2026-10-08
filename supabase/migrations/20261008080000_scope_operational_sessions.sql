-- Keep historical operational sessions referenced by validations intact.
-- Remove only unused session 3 configuration created by the original default seeding.
DELETE FROM public.operational_sessions s
WHERE s.session_number = 3
  AND NOT EXISTS (
    SELECT 1 FROM public.validations v WHERE v.operational_session_id = s.id
  );

CREATE OR REPLACE FUNCTION public.get_active_operational_session(p_at timestamptz DEFAULT now())
RETURNS TABLE (id uuid, period_id uuid, session_number integer, name text, start_time time, end_time time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_period AS (
    SELECT p.id FROM public.periods p
    WHERE p.start_date <= (p_at AT TIME ZONE 'Asia/Jakarta')::date
      AND p.end_date >= (p_at AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY p.start_date DESC, p.id DESC LIMIT 1
  )
  SELECT s.id, s.period_id, s.session_number, s.name, s.start_time, s.end_time
  FROM public.operational_sessions s
  JOIN current_period cp ON cp.id = s.period_id
  WHERE s.enabled AND s.session_number IN (1, 2)
    AND s.start_time <= (p_at AT TIME ZONE 'Asia/Jakarta')::time
    AND (p_at AT TIME ZONE 'Asia/Jakarta')::time < s.end_time
  ORDER BY s.session_number LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_operational_session(timestamptz) TO authenticated;