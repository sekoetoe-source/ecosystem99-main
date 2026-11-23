-- Final safeguards for automatic challenge evaluation:
-- 1) Future-dated validation rows can never count as completed school days.
-- 2) A challenge that has not reached its threshold must not stop evaluation
--    of other automatic challenges for the same student/week.

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
  v_today_wib date := (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;
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
       OR v_day > v_today_wib
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
        AND vi.day <= v_today_wib
        AND EXTRACT(ISODOW FROM vi.day) BETWEEN 1 AND 5
    ) q;

    IF COALESCE(cardinality(v_qualifying_days), 0) < v_challenge.target_count THEN
      CONTINUE;
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
