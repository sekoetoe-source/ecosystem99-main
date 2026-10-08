-- Safe cleanup for duplicate configuration rows. Referenced rows are preserved.
DELETE FROM public.operational_sessions duplicate_session
WHERE duplicate_session.session_number IN (1, 2)
  AND NOT EXISTS (SELECT 1 FROM public.validations v WHERE v.operational_session_id = duplicate_session.id)
  AND EXISTS (
    SELECT 1 FROM public.operational_sessions keeper
    WHERE keeper.period_id = duplicate_session.period_id
      AND keeper.session_number = duplicate_session.session_number
      AND keeper.id <> duplicate_session.id
      AND keeper.created_at > duplicate_session.created_at
  );

CREATE OR REPLACE FUNCTION public.get_current_operational_sessions(p_at timestamptz DEFAULT now())
RETURNS TABLE (id uuid, period_id uuid, session_number integer, name text, start_time time, end_time time, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_period AS (
    SELECT p.id FROM public.periods p
    WHERE p.start_date <= (p_at AT TIME ZONE 'Asia/Jakarta')::date
      AND p.end_date >= (p_at AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY p.start_date DESC, p.id DESC LIMIT 1
  ), ranked AS (
    SELECT s.*, row_number() OVER (PARTITION BY s.session_number ORDER BY s.enabled DESC, s.updated_at DESC, s.created_at DESC, s.id DESC) AS row_number
    FROM public.operational_sessions s JOIN current_period cp ON cp.id = s.period_id
    WHERE s.session_number IN (1, 2)
  )
  SELECT r.id, r.period_id, r.session_number, r.name, r.start_time, r.end_time, r.enabled
  FROM ranked r WHERE r.row_number = 1 ORDER BY r.session_number;
$$;
GRANT EXECUTE ON FUNCTION public.get_current_operational_sessions(timestamptz) TO authenticated;