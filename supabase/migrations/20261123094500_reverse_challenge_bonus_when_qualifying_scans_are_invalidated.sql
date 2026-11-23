-- Keep automatic EcoChallenge points consistent if an administrator later
-- rejects/deletes/changes one of the validations that qualified the award.
-- Awards remain in the ledger; reversal is an append-like, one-way metadata update.
-- If the same week qualifies again, a new active award row may be created.

ALTER TABLE public.challenge_point_awards
  ADD COLUMN IF NOT EXISTS target_item_code text,
  ADD COLUMN IF NOT EXISTS target_session text,
  ADD COLUMN IF NOT EXISTS target_count integer,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.challenge_point_awards'::regclass
      AND conname='challenge_point_awards_target_item_fkey'
  ) THEN
    ALTER TABLE public.challenge_point_awards
      ADD CONSTRAINT challenge_point_awards_target_item_fkey
      FOREIGN KEY (target_item_code) REFERENCES public.eco_items(code)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.challenge_point_awards'::regclass
      AND conname='challenge_point_awards_target_session_check'
  ) THEN
    ALTER TABLE public.challenge_point_awards
      ADD CONSTRAINT challenge_point_awards_target_session_check
      CHECK (target_session IS NULL OR target_session IN ('entry','break'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.challenge_point_awards'::regclass
      AND conname='challenge_point_awards_target_count_check'
  ) THEN
    ALTER TABLE public.challenge_point_awards
      ADD CONSTRAINT challenge_point_awards_target_count_check
      CHECK (target_count IS NULL OR target_count BETWEEN 1 AND 5);
  END IF;
END
$$;

ALTER TABLE public.challenge_point_awards
  DROP CONSTRAINT IF EXISTS challenge_point_awards_one_per_week;

CREATE UNIQUE INDEX IF NOT EXISTS challenge_point_awards_one_active_per_week
  ON public.challenge_point_awards(challenge_id, student_id, week_start)
  WHERE reversed_at IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_challenge_point_award_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND ROW(
       NEW.id, NEW.challenge_id, NEW.student_id, NEW.period_id, NEW.week_start,
       NEW.earned_day, NEW.qualifying_days, NEW.bonus_points,
       NEW.trigger_validation_id, NEW.awarded_at,
       NEW.target_item_code, NEW.target_session, NEW.target_count
     ) IS NOT DISTINCT FROM ROW(
       OLD.id, OLD.challenge_id, OLD.student_id, OLD.period_id, OLD.week_start,
       OLD.earned_day, OLD.qualifying_days, OLD.bonus_points,
       OLD.trigger_validation_id, OLD.awarded_at,
       OLD.target_item_code, OLD.target_session, OLD.target_count
     )
     AND OLD.reversed_at IS NULL
     AND NEW.reversed_at IS NOT NULL
     AND NULLIF(trim(NEW.reversal_reason), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Riwayat bonus EcoChallenge tidak dapat diubah atau dihapus; hanya pembatalan otomatis yang diizinkan.';
END;
$$;

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
  SELECT v.student_id, v.session, v.day, v.status
  INTO v_student_id, v_session, v_day, v_status
  FROM public.validations v
  WHERE v.id = p_validation_id;

  IF NOT FOUND OR v_status <> 'approved' THEN
    RETURN;
  END IF;

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
         SELECT 1 FROM public.validation_items vi
         WHERE vi.validation_id = p_validation_id
           AND vi.item_code = v_challenge.target_item_code
       ) THEN
      CONTINUE;
    END IF;

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
      RETURN;
    END IF;

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
      challenge_id, student_id, period_id, week_start, earned_day,
      qualifying_days, bonus_points, trigger_validation_id,
      target_item_code, target_session, target_count
    )
    VALUES (
      v_challenge.id, v_student_id, v_award_period_id, v_week_start,
      v_earned_day, v_qualifying_days[1:v_challenge.target_count],
      v_challenge.bonus_points, v_award_validation_id,
      v_challenge.target_item_code, v_challenge.target_session,
      v_challenge.target_count
    )
    ON CONFLICT (challenge_id, student_id, week_start)
      WHERE reversed_at IS NULL
    DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_automatic_challenge_awards(
  p_student_id uuid,
  p_day date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_student_id IS NULL OR p_day IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.challenge_point_awards a
  SET
    reversed_at = clock_timestamp(),
    reversal_reason = 'Syarat scan approved tidak lagi terpenuhi setelah koreksi validasi.'
  WHERE a.student_id = p_student_id
    AND a.week_start = date_trunc('week', p_day)::date
    AND a.reversed_at IS NULL
    AND (
      SELECT count(DISTINCT vi.day)
      FROM public.validation_items vi
      JOIN public.validations vv ON vv.id = vi.validation_id
      WHERE vv.student_id = a.student_id
        AND vv.status = 'approved'
        AND vv.session = a.target_session
        AND vi.item_code = a.target_item_code
        AND vi.day = ANY(a.qualifying_days)
        AND EXTRACT(ISODOW FROM vi.day) BETWEEN 1 AND 5
    ) < a.target_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_evaluate_challenge_from_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_day date;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT student_id, day INTO v_student_id, v_day
    FROM public.validations
    WHERE id = OLD.validation_id;
    IF FOUND THEN
      PERFORM public.reconcile_automatic_challenge_awards(v_student_id, v_day);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.evaluate_automatic_challenge_awards(NEW.validation_id);
    SELECT student_id, day INTO v_student_id, v_day
    FROM public.validations
    WHERE id = NEW.validation_id;
    IF FOUND THEN
      PERFORM public.reconcile_automatic_challenge_awards(v_student_id, v_day);
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_evaluate_challenge_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reconcile_automatic_challenge_awards(OLD.student_id, OLD.day);

  IF NEW.status = 'approved' THEN
    PERFORM public.evaluate_automatic_challenge_awards(NEW.id);
  END IF;

  PERFORM public.reconcile_automatic_challenge_awards(NEW.student_id, NEW.day);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_reconcile_challenge_on_validation_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reconcile_automatic_challenge_awards(OLD.student_id, OLD.day);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS validation_items_auto_challenge_award
  ON public.validation_items;
CREATE TRIGGER validation_items_auto_challenge_award
  AFTER INSERT OR UPDATE OF item_code, validation_id, student_id, day OR DELETE
  ON public.validation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_evaluate_challenge_from_item();

DROP TRIGGER IF EXISTS validations_auto_challenge_award
  ON public.validations;
CREATE TRIGGER validations_auto_challenge_award
  AFTER UPDATE OF status, session, day, student_id
  ON public.validations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_evaluate_challenge_on_approval();

DROP TRIGGER IF EXISTS validations_reconcile_challenge_award_on_delete
  ON public.validations;
CREATE TRIGGER validations_reconcile_challenge_award_on_delete
  AFTER DELETE ON public.validations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_reconcile_challenge_on_validation_delete();

REVOKE ALL ON FUNCTION public.evaluate_automatic_challenge_awards(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_automatic_challenge_awards(uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_evaluate_challenge_from_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_evaluate_challenge_on_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_reconcile_challenge_award_on_validation_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_challenge_point_award_mutation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.challenge_point_awards_public
WITH (security_invoker = false)
AS
SELECT student_id, period_id, earned_day, bonus_points
FROM public.challenge_point_awards
WHERE reversed_at IS NULL;

GRANT SELECT ON public.challenge_point_awards_public TO anon, authenticated;
