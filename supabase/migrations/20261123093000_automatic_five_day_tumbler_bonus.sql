-- Automatic EcoChallenge bonus: five distinct school-day tumbler scans.
-- Eligibility: approved Tumbler validations in Sesi 1 (entry), Monday-Friday,
-- five distinct dates within the same ISO week (Monday-Sunday).
-- Award: once per student/challenge/week, with an immutable point ledger.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS auto_award boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_item_code text,
  ADD COLUMN IF NOT EXISTS target_session text,
  ADD COLUMN IF NOT EXISTS target_count integer,
  ADD COLUMN IF NOT EXISTS bonus_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.challenges'::regclass
      AND conname = 'challenges_target_item_code_fkey'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_target_item_code_fkey
      FOREIGN KEY (target_item_code) REFERENCES public.eco_items(code)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.challenges'::regclass
      AND conname = 'challenges_target_session_check'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_target_session_check
      CHECK (target_session IS NULL OR target_session IN ('entry', 'break'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.challenges'::regclass
      AND conname = 'challenges_target_count_check'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_target_count_check
      CHECK (target_count IS NULL OR target_count BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.challenges'::regclass
      AND conname = 'challenges_bonus_points_check'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_bonus_points_check
      CHECK (bonus_points >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.challenges'::regclass
      AND conname = 'challenges_auto_award_config_check'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_auto_award_config_check
      CHECK (
        NOT auto_award
        OR (
          target_item_code IS NOT NULL
          AND target_session IS NOT NULL
          AND target_count BETWEEN 1 AND 5
          AND bonus_points > 0
          AND effective_from IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.challenge_point_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  week_start date NOT NULL,
  earned_day date NOT NULL,
  qualifying_days date[] NOT NULL,
  bonus_points integer NOT NULL CHECK (bonus_points > 0),
  trigger_validation_id uuid REFERENCES public.validations(id) ON DELETE SET NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_point_awards_one_per_week
    UNIQUE (challenge_id, student_id, week_start),
  CONSTRAINT challenge_point_awards_monday_week
    CHECK (week_start = date_trunc('week', week_start)::date),
  CONSTRAINT challenge_point_awards_earned_in_week
    CHECK (earned_day >= week_start AND earned_day < week_start + 7),
  CONSTRAINT challenge_point_awards_has_qualifying_days
    CHECK (cardinality(qualifying_days) >= 1)
);

CREATE INDEX IF NOT EXISTS challenge_point_awards_student_idx
  ON public.challenge_point_awards(student_id, earned_day DESC);
CREATE INDEX IF NOT EXISTS challenge_point_awards_period_idx
  ON public.challenge_point_awards(period_id, earned_day);

ALTER TABLE public.challenge_point_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenge_point_awards_select_own_or_admin
  ON public.challenge_point_awards;
CREATE POLICY challenge_point_awards_select_own_or_admin
  ON public.challenge_point_awards
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR student_id = public.current_student_id()
  );

REVOKE ALL ON public.challenge_point_awards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.challenge_point_awards TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_challenge_point_award_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Riwayat bonus EcoChallenge bersifat permanen dan tidak dapat diubah atau dihapus.';
END;
$$;

DROP TRIGGER IF EXISTS challenge_point_awards_immutable
  ON public.challenge_point_awards;
CREATE TRIGGER challenge_point_awards_immutable
  BEFORE UPDATE OR DELETE ON public.challenge_point_awards
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_challenge_point_award_mutation();

CREATE OR REPLACE FUNCTION public.evaluate_automatic_challenge_awards(
  p_validation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_period_id uuid;
  v_session text;
  v_day date;
  v_status public.validation_status;
  v_week_start date;
  v_qualifying_days date[];
  v_earned_day date;
  v_award_period_id uuid;
  v_award_validation_id uuid;
  v_challenge record;
BEGIN
  SELECT v.student_id, v.period_id, v.session, v.day, v.status
  INTO v_student_id, v_period_id, v_session, v_day, v_status
  FROM public.validations v
  WHERE v.id = p_validation_id;

  IF NOT FOUND OR v_status <> 'approved' THEN
    RETURN;
  END IF;

  -- Only evaluate challenges for which this validation contains the configured item.
  FOR v_challenge IN
    SELECT c.id, c.target_item_code, c.target_session, c.target_count,
           c.bonus_points, c.effective_from
    FROM public.challenges c
    WHERE c.pill = 'ACTIVE'
      AND c.auto_award = true
      AND c.target_item_code IS NOT NULL
      AND c.target_session IS NOT NULL
      AND c.target_count BETWEEN 1 AND 5
      AND c.bonus_points > 0
  LOOP
    IF v_session <> v_challenge.target_session
       OR v_day < v_challenge.effective_from
       OR EXTRACT(ISODOW FROM v_day) NOT BETWEEN 1 AND 5
       OR NOT EXISTS (
         SELECT 1
         FROM public.validation_items vi
         WHERE vi.validation_id = p_validation_id
           AND vi.item_code = v_challenge.target_item_code
       ) THEN
      CONTINUE;
    END IF;

    -- ISO week starts Monday; serialize evaluation for this student/challenge/week
    -- so concurrent scans cannot both miss the fifth qualifying day.
    v_week_start := date_trunc('week', v_day)::date;
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_challenge.id::text || ':' || v_student_id::text || ':' || v_week_start::text,
        0
      )
    );

    SELECT array_agg(q.day ORDER BY q.day)
    INTO v_qualifying_days
    FROM (
      SELECT DISTINCT vi.day
      FROM public.validation_items vi
      JOIN public.validations vv ON vv.id = vi.validation_id
      WHERE vv.student_id = v_student_id
        AND vv.status = 'approved'
        AND vv.session = v_challenge.target_session
        AND vi.item_code = v_challenge.target_item_code
        AND vi.day >= GREATEST(v_week_start, v_challenge.effective_from)
        AND vi.day < v_week_start + 7
        AND EXTRACT(ISODOW FROM vi.day) BETWEEN 1 AND 5
    ) q;

    IF COALESCE(cardinality(v_qualifying_days), 0) < v_challenge.target_count THEN
      CONTINUE;
    END IF;

    -- Use the date of the Nth qualifying school day, even if a late scan
    -- is entered after a later-dated scan.
    v_earned_day := v_qualifying_days[v_challenge.target_count];

    SELECT vv.period_id, vv.id
    INTO v_award_period_id, v_award_validation_id
    FROM public.validations vv
    JOIN public.validation_items vi ON vi.validation_id = vv.id
    WHERE vv.student_id = v_student_id
      AND vv.status = 'approved'
      AND vv.session = v_challenge.target_session
      AND vi.item_code = v_challenge.target_item_code
      AND vi.day = v_earned_day
    ORDER BY vv.created_at, vv.id
    LIMIT 1;

    IF v_award_period_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.challenge_point_awards (
      challenge_id,
      student_id,
      period_id,
      week_start,
      earned_day,
      qualifying_days,
      bonus_points,
      trigger_validation_id
    )
    VALUES (
      v_challenge.id,
      v_student_id,
      v_award_period_id,
      v_week_start,
      v_earned_day,
      v_qualifying_days[1:v_challenge.target_count],
      v_challenge.bonus_points,
      v_award_validation_id
    )
    ON CONFLICT (challenge_id, student_id, week_start) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_evaluate_challenge_from_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.evaluate_automatic_challenge_awards(NEW.validation_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_evaluate_challenge_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM public.evaluate_automatic_challenge_awards(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validation_items_auto_challenge_award
  ON public.validation_items;
CREATE TRIGGER validation_items_auto_challenge_award
  AFTER INSERT OR UPDATE OF item_code, validation_id, student_id, day
  ON public.validation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_evaluate_challenge_from_item();

DROP TRIGGER IF EXISTS validations_auto_challenge_award
  ON public.validations;
CREATE TRIGGER validations_auto_challenge_award
  AFTER UPDATE OF status, session, day, student_id
  ON public.validations
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.trigger_evaluate_challenge_on_approval();

REVOKE ALL ON FUNCTION public.evaluate_automatic_challenge_awards(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_evaluate_challenge_from_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_evaluate_challenge_on_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_challenge_point_award_mutation() FROM PUBLIC, anon, authenticated;

-- A narrow, read-only public view supports public landing-page and leaderboard
-- totals without exposing the private award ledger, qualifying dates, or trigger IDs.
CREATE OR REPLACE VIEW public.challenge_point_awards_public
WITH (security_invoker = false)
AS
SELECT student_id, period_id, earned_day, bonus_points
FROM public.challenge_point_awards;

GRANT SELECT ON public.challenge_point_awards_public TO anon, authenticated;

-- All-time student scores include validated scan points plus immutable challenge bonuses.
CREATE OR REPLACE VIEW public.student_scores
WITH (security_invoker = true)
AS
SELECT
  s.id AS student_id,
  s.nis,
  s.full_name,
  s.avatar_url,
  s.class_id,
  c.name AS class_name,
  (COALESCE(earned.points, 0) + COALESCE(bonus.points, 0))::bigint AS earned_points,
  COALESCE(spent.points, 0)::bigint AS spent_points,
  (COALESCE(earned.points, 0) + COALESCE(bonus.points, 0) - COALESCE(spent.points, 0))::bigint AS balance_points,
  COALESCE(earned.scans, 0)::bigint AS total_items
FROM public.students s
LEFT JOIN public.classes c ON c.id = s.class_id
LEFT JOIN (
  SELECT vi.student_id, SUM(vi.points) AS points, COUNT(*) AS scans
  FROM public.validation_items vi
  JOIN public.validations v ON v.id = vi.validation_id
  WHERE v.status = 'approved'
  GROUP BY vi.student_id
) earned ON earned.student_id = s.id
LEFT JOIN (
  SELECT student_id, SUM(bonus_points) AS points
  FROM public.challenge_point_awards_public
  GROUP BY student_id
) bonus ON bonus.student_id = s.id
LEFT JOIN (
  SELECT r.student_id, SUM(r.points_spent) AS points
  FROM public.redemptions r
  WHERE r.status <> 'cancelled'
  GROUP BY r.student_id
) spent ON spent.student_id = s.id;

GRANT SELECT ON public.student_scores TO anon, authenticated;

-- Per-period scores include awards attributed to the period containing the
-- fifth qualifying school-day scan. Item counts remain scan counts (bonuses
-- are points, not physical items).
CREATE OR REPLACE VIEW public.period_student_scores
WITH (security_invoker = true)
AS
SELECT
  p.id AS period_id,
  p.name AS period_name,
  s.id AS student_id,
  s.nis,
  s.full_name,
  s.class_id,
  c.name AS class_name,
  (
    COALESCE(scan.points, 0) + COALESCE(bonus.points, 0)
  )::integer AS earned_points,
  COALESCE(scan.total_items, 0)::integer AS total_items
FROM public.periods p
CROSS JOIN public.students s
LEFT JOIN public.classes c ON c.id = s.class_id
LEFT JOIN (
  SELECT
    v.period_id,
    v.student_id,
    SUM(vi.points) FILTER (WHERE v.status = 'approved') AS points,
    COUNT(vi.id) FILTER (WHERE v.status = 'approved') AS total_items
  FROM public.validations v
  LEFT JOIN public.validation_items vi ON vi.validation_id = v.id
  GROUP BY v.period_id, v.student_id
) scan ON scan.period_id = p.id AND scan.student_id = s.id
LEFT JOIN (
  SELECT period_id, student_id, SUM(bonus_points) AS points
  FROM public.challenge_point_awards_public
  GROUP BY period_id, student_id
) bonus ON bonus.period_id = p.id AND bonus.student_id = s.id;

GRANT SELECT ON public.period_student_scores TO anon, authenticated;

-- Configure the existing five-day tumbler challenge. No historical week is
-- credited: eligibility begins on 23 Nov 2026, the activation date.
UPDATE public.challenges
SET
  pill = 'ACTIVE',
  auto_award = true,
  target_item_code = 'tumbler',
  target_session = 'entry',
  target_count = 5,
  bonus_points = 150,
  effective_from = date '2026-11-23',
  body = 'Bawa tumbler dan lakukan scan valid pada Sesi 1 selama 5 hari sekolah berbeda (Senin–Jumat) dalam satu minggu. Setelah hari kelima disetujui, sistem otomatis memberi bonus +150 Eco-Points satu kali per siswa per minggu.'
WHERE name = '5 Hari Tumbler';
