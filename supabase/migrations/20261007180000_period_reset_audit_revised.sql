-- Phase 1 Period System: Reset Point & Audit Trail
-- 
-- MIGRATION SEMANTICS:
-- This migration represents the system state AFTER reset_point() was performed on 7 October 2026.
-- Initial state: Oktober 2026 — Testing (CLOSED, 1–7), Oktober 2026 — Operasional (ACTIVE, 8–31)
-- First reset_point() usage: closes Operasional, creates November 2026.
-- 
-- CONSTRAINTS:
-- - Unique period names (prevent duplicates)
-- - Non-overlapping date ranges (btree_gist exclusion)
-- - Maximum 1 ACTIVE period globally (unique partial index)
-- - Immutable audit events (trigger prevents update/delete)
-- - Atomic reset transaction (all or nothing)

CREATE TYPE public.period_status AS ENUM ('DRAFT','ACTIVE','CLOSED');
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- PERIODS TABLE
-- ============================================================================
CREATE TABLE public.periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.period_status NOT NULL DEFAULT 'DRAFT',
  academic_year text,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT periods_valid_dates CHECK (start_date <= end_date)
);

-- Ensure only one ACTIVE period globally
CREATE UNIQUE INDEX periods_one_active_global_idx 
  ON public.periods ((status)) 
  WHERE status = 'ACTIVE';

-- Prevent overlapping date ranges across all periods
ALTER TABLE public.periods 
ADD CONSTRAINT periods_no_overlap 
EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&);

CREATE INDEX periods_dates_idx ON public.periods (start_date, end_date);

-- ============================================================================
-- PERIOD RESET AUDIT EVENTS TABLE
-- ============================================================================
CREATE TABLE public.period_reset_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL CHECK (event = 'PERIOD_RESET'),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_period_id uuid NOT NULL REFERENCES public.periods(id),
  source_period_name text NOT NULL,
  source_start_date date NOT NULL,
  source_end_date date NOT NULL,
  target_period_id uuid NOT NULL REFERENCES public.periods(id),
  target_period_name text NOT NULL,
  target_start_date date NOT NULL,
  target_end_date date NOT NULL,
  before_total_validations integer NOT NULL,
  before_approved_validations integer NOT NULL,
  before_rejected_validations integer NOT NULL,
  before_pending_validations integer NOT NULL,
  before_total_earned_points integer NOT NULL,
  before_students_with_points integer NOT NULL,
  after_total_earned_points integer NOT NULL,
  reason text NOT NULL
);

-- ============================================================================
-- EXTEND VALIDATIONS TABLE WITH PERIOD REFERENCE
-- ============================================================================
ALTER TABLE public.validations 
ADD COLUMN period_id uuid REFERENCES public.periods(id);
CREATE INDEX validations_period_idx ON public.validations(period_id);

-- ============================================================================
-- INITIAL PERIODS (Post-Reset State)
-- ============================================================================
INSERT INTO public.periods (name, start_date, end_date, status, academic_year, activated_at, closed_at) VALUES
 ('Agustus 2026', '2026-08-01', '2026-08-31', 'CLOSED', '2026/2027', now(), now()),
 ('September 2026', '2026-09-01', '2026-09-30', 'CLOSED', '2026/2027', now(), now()),
 ('Oktober 2026 — Testing', '2026-10-01', '2026-10-07', 'CLOSED', '2026/2027', now(), now()),
 ('Oktober 2026 — Operasional', '2026-10-08', '2026-10-31', 'ACTIVE', '2026/2027', now(), NULL);

-- ============================================================================
-- BACKFILL EXISTING VALIDATIONS WITH PERIOD ASSIGNMENT
-- ============================================================================
UPDATE public.validations v 
SET period_id = p.id 
FROM public.periods p 
WHERE v.period_id IS NULL 
AND v.day BETWEEN p.start_date AND p.end_date;

-- Validate no orphan validations
DO $$ BEGIN 
  IF EXISTS(SELECT 1 FROM public.validations WHERE period_id IS NULL) THEN 
    RAISE EXCEPTION 'Orphan validation period assignment'; 
  END IF; 
END $$;

-- Make period_id mandatory
ALTER TABLE public.validations 
ALTER COLUMN period_id SET NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY: AUDIT EVENTS (Admin-only read)
-- ============================================================================
ALTER TABLE public.period_reset_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY period_reset_audit_select_admin 
  ON public.period_reset_audit_events 
  FOR SELECT TO authenticated 
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE INSERT, UPDATE, DELETE ON public.period_reset_audit_events 
FROM anon, authenticated;
GRANT SELECT ON public.period_reset_audit_events TO authenticated;
GRANT ALL ON public.period_reset_audit_events TO service_role;

-- ============================================================================
-- IMMUTABILITY TRIGGER: AUDIT EVENTS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_period_reset_audit_mutation() 
RETURNS trigger LANGUAGE plpgsql AS $$ 
BEGIN 
  RAISE EXCEPTION 'Period reset audit events are immutable'; 
END; 
$$;
CREATE TRIGGER period_reset_audit_immutable 
  BEFORE UPDATE OR DELETE ON public.period_reset_audit_events 
  FOR EACH ROW 
  EXECUTE FUNCTION public.prevent_period_reset_audit_mutation();

-- ============================================================================
-- ROW LEVEL SECURITY: PERIODS (Authenticated-only read)
-- ============================================================================
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY periods_select_authenticated 
  ON public.periods 
  FOR SELECT TO authenticated 
  USING (true);
GRANT SELECT ON public.periods TO authenticated;

-- ============================================================================
-- reset_point() RPC FUNCTION
-- ============================================================================
-- Concurrency safeguard: FOR UPDATE lock prevents concurrent execution
-- Atomic execution: all statements succeed or fail together
-- Audit trail: immutable record of reset event
CREATE OR REPLACE FUNCTION public.reset_point()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE 
  actor uuid := auth.uid();
  src periods%ROWTYPE;
  dst periods%ROWTYPE;
  tv int;
  av int;
  rv int;
  pv int;
  pts int;
  students int;
  next_month_date date;
  next_month_name text;
  next_month_year int;
BEGIN
  -- Authorization check
  IF actor IS NULL OR NOT has_role(actor, 'admin') THEN 
    RAISE EXCEPTION 'Only administrators can reset points'; 
  END IF;
  
  -- Lock active period to prevent concurrent resets
  SELECT * INTO src FROM periods WHERE status = 'ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION 'No active period exists'; 
  END IF;
  
  -- Capture snapshots before closing
  SELECT count(*)::int,
         count(*) FILTER(WHERE status='approved')::int,
         count(*) FILTER(WHERE status='rejected')::int,
         count(*) FILTER(WHERE status='pending')::int 
  INTO tv, av, rv, pv 
  FROM validations 
  WHERE period_id = src.id;
  
  SELECT coalesce(sum(vi.points) FILTER(WHERE v.status='approved'), 0)::int,
         count(DISTINCT vi.student_id) FILTER(WHERE v.status='approved')::int 
  INTO pts, students 
  FROM validation_items vi 
  JOIN validations v ON v.id = vi.validation_id 
  WHERE v.period_id = src.id;
  
  -- Close active period
  UPDATE periods SET status='CLOSED', closed_at=now() WHERE id=src.id;
  
  -- Calculate next period (always next calendar month after source end_date)
  next_month_date := (src.end_date + interval '1 day')::date;
  next_month_name := CASE EXTRACT(MONTH FROM next_month_date)::int
    WHEN 1 THEN 'Januari'
    WHEN 2 THEN 'Februari'
    WHEN 3 THEN 'Maret'
    WHEN 4 THEN 'April'
    WHEN 5 THEN 'Mei'
    WHEN 6 THEN 'Juni'
    WHEN 7 THEN 'Juli'
    WHEN 8 THEN 'Agustus'
    WHEN 9 THEN 'September'
    WHEN 10 THEN 'Oktober'
    WHEN 11 THEN 'November'
    WHEN 12 THEN 'Desember'
  END;
  next_month_year := EXTRACT(YEAR FROM next_month_date)::int;
  
  -- Create and activate next period
  INSERT INTO periods(name, start_date, end_date, status, academic_year, activated_at)
  VALUES(
    next_month_name || ' ' || next_month_year,
    next_month_date,
    (next_month_date + interval '1 month' - interval '1 day')::date,
    'ACTIVE',
    src.academic_year,
    now()
  )
  RETURNING * INTO dst;
  
  -- Log immutable audit event (final statement ensures atomicity)
  INSERT INTO period_reset_audit_events(
    event, actor_id,
    source_period_id, source_period_name, source_start_date, source_end_date,
    target_period_id, target_period_name, target_start_date, target_end_date,
    before_total_validations, before_approved_validations, 
    before_rejected_validations, before_pending_validations,
    before_total_earned_points, before_students_with_points,
    after_total_earned_points, reason
  ) VALUES(
    'PERIOD_RESET', actor,
    src.id, src.name, src.start_date, src.end_date,
    dst.id, dst.name, dst.start_date, dst.end_date,
    tv, av, rv, pv,
    pts, students,
    0, 'Reset point setelah masa uji coba sistem'
  );
  
  RETURN jsonb_build_object(
    'source_period_name', src.name,
    'target_period_id', dst.id,
    'target_period_name', dst.name,
    'after_total_earned_points', 0
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.reset_point() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_point() TO authenticated;

-- ============================================================================
-- PERIOD-AWARE VIEWS (Uses security_invoker for RLS context)
-- ============================================================================
CREATE OR REPLACE VIEW public.period_student_scores WITH (security_invoker=on) AS
SELECT 
  p.id period_id,
  p.name period_name,
  s.id student_id,
  s.nis,
  s.full_name,
  s.class_id,
  c.name class_name,
  coalesce(sum(vi.points) FILTER(WHERE v.status='approved'), 0)::int earned_points,
  count(vi.id) FILTER(WHERE v.status='approved')::int total_items
FROM periods p
CROSS JOIN students s
LEFT JOIN classes c ON c.id = s.class_id
LEFT JOIN validations v ON v.period_id = p.id AND v.student_id = s.id
LEFT JOIN validation_items vi ON vi.validation_id = v.id
GROUP BY p.id, p.name, s.id, s.nis, s.full_name, s.class_id, c.name;

CREATE OR REPLACE VIEW public.period_class_scores WITH (security_invoker=on) AS
SELECT 
  period_id,
  period_name,
  class_id,
  class_name,
  count(student_id)::int student_count,
  coalesce(sum(earned_points), 0)::int total_points,
  CASE WHEN count(student_id)=0 THEN 0 
       ELSE round(sum(earned_points)::numeric/count(student_id), 0)::int 
  END avg_points
FROM period_student_scores
WHERE class_id IS NOT NULL
GROUP BY period_id, period_name, class_id, class_name;

GRANT SELECT ON public.period_student_scores, public.period_class_scores TO authenticated;
