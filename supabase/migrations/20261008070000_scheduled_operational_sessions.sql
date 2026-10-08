CREATE TABLE IF NOT EXISTS public.operational_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  session_number integer NOT NULL CHECK (session_number BETWEEN 1 AND 2),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_sessions_valid_time CHECK (start_time < end_time),
  CONSTRAINT operational_sessions_unique_number UNIQUE (period_id, session_number)
);
ALTER TABLE public.validations ADD COLUMN IF NOT EXISTS operational_session_id uuid REFERENCES public.operational_sessions(id);
CREATE INDEX IF NOT EXISTS operational_sessions_period_idx ON public.operational_sessions(period_id, enabled, start_time);
CREATE OR REPLACE FUNCTION public.prevent_operational_session_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operational_sessions s WHERE s.period_id = NEW.period_id AND s.id <> NEW.id AND s.enabled AND NEW.enabled AND NOT (NEW.end_time <= s.start_time OR NEW.start_time >= s.end_time)) THEN
    RAISE EXCEPTION 'Operational session overlaps an enabled session for this period';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS operational_sessions_no_overlap ON public.operational_sessions;
CREATE TRIGGER operational_sessions_no_overlap BEFORE INSERT OR UPDATE ON public.operational_sessions FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_session_overlap();
INSERT INTO public.operational_sessions (period_id, session_number, name, start_time, end_time, enabled)
SELECT p.id, v.session_number, v.name, v.start_time::time, v.end_time::time, true FROM public.periods p CROSS JOIN (VALUES (1, 'Sesi 1', '06:30', '07:30'), (2, 'Sesi 2', '09:00', '10:00')) v(session_number, name, start_time, end_time)
WHERE NOT EXISTS (SELECT 1 FROM public.operational_sessions s WHERE s.period_id = p.id AND s.session_number = v.session_number);
ALTER TABLE public.operational_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users read operational sessions" ON public.operational_sessions;
CREATE POLICY "Authenticated users read operational sessions" ON public.operational_sessions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage operational sessions" ON public.operational_sessions;
CREATE POLICY "Admins manage operational sessions" ON public.operational_sessions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.get_active_operational_session(p_at timestamptz DEFAULT now()) RETURNS TABLE (id uuid, period_id uuid, session_number integer, name text, start_time time, end_time time) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.period_id, s.session_number, s.name, s.start_time, s.end_time FROM public.operational_sessions s JOIN public.periods p ON p.id = s.period_id WHERE s.enabled AND p.start_date <= (p_at AT TIME ZONE 'Asia/Jakarta')::date AND p.end_date >= (p_at AT TIME ZONE 'Asia/Jakarta')::date AND s.start_time <= (p_at AT TIME ZONE 'Asia/Jakarta')::time AND (p_at AT TIME ZONE 'Asia/Jakarta')::time < s.end_time ORDER BY s.session_number LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_operational_session(timestamptz) TO authenticated;
