-- Migration: Allow public/anon to view periods and provide get_landing_stats() RPC for landing page KPIs
-- Timestamp: 2026-11-03 15:00:00 WIB

-- 1. Grant public/anon read access to periods table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'periods' AND policyname = 'periods_select_anon'
  ) THEN
    CREATE POLICY "periods_select_anon" ON public.periods
    FOR SELECT TO anon
    USING (true);
  END IF;
END $$;

-- 2. Define get_landing_stats RPC for ultra-fast, accurate landing page metrics
CREATE OR REPLACE FUNCTION public.get_landing_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_period RECORD;
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
  v_total_points BIGINT := 0;
  v_total_items BIGINT := 0;
  v_student_count BIGINT := 0;
  v_distinct_activities BIGINT := 0;
  v_tumbler_uses BIGINT := 0;
  v_lunchbox_uses BIGINT := 0;
  v_top_classes JSON;
BEGIN
  -- 1. Find active operational period (respecting month transitions before admin closure)
  SELECT id, name, status, start_date, end_date
  INTO v_active_period
  FROM periods
  WHERE status = 'ACTIVE'
    AND name NOT ILIKE '%testing%'
    AND start_date <= v_today
  ORDER BY start_date DESC
  LIMIT 1;

  -- 2. Valid active students count
  SELECT COUNT(*)
  INTO v_student_count
  FROM students s
  JOIN classes c ON c.id = s.class_id
  WHERE s.active = true
    AND c.name IS NOT NULL
    AND TRIM(c.name) != ''
    AND TRIM(c.name) != '-'
    AND LOWER(TRIM(c.name)) != 'tanpa kelas';

  IF v_active_period.id IS NOT NULL THEN
    -- Total points & items for the active operational period
    SELECT 
      COALESCE(SUM(vi.points), 0),
      COUNT(*),
      COUNT(DISTINCT v.id),
      COUNT(*) FILTER (WHERE vi.item_code IN ('tumbler', 'combo', 'break_combo')),
      COUNT(*) FILTER (WHERE vi.item_code IN ('lunchbox', 'combo', 'break_combo'))
    INTO
      v_total_points,
      v_total_items,
      v_distinct_activities,
      v_tumbler_uses,
      v_lunchbox_uses
    FROM validation_items vi
    JOIN validations v ON v.id = vi.validation_id
    JOIN students s ON s.id = vi.student_id
    JOIN classes c ON c.id = s.class_id
    WHERE v.status = 'approved'
      AND v.period_id = v_active_period.id
      AND s.active = true
      AND c.name IS NOT NULL
      AND TRIM(c.name) != ''
      AND TRIM(c.name) != '-'
      AND LOWER(TRIM(c.name)) != 'tanpa kelas';

    -- Top 5 classes sorted by total points descending, then average points
    SELECT json_agg(t)
    INTO v_top_classes
    FROM (
      SELECT 
        c.name AS class_name,
        COUNT(DISTINCT s.id) AS student_count,
        COALESCE(SUM(vi.points), 0) AS total_points,
        CASE 
          WHEN COUNT(DISTINCT s.id) > 0 
          THEN ROUND(COALESCE(SUM(vi.points), 0)::NUMERIC / COUNT(DISTINCT s.id))
          ELSE 0 
        END AS avg_points
      FROM classes c
      JOIN students s ON s.class_id = c.id AND s.active = true
      LEFT JOIN (
        validation_items vi 
        JOIN validations v ON v.id = vi.validation_id AND v.status = 'approved' AND v.period_id = v_active_period.id
      ) ON vi.student_id = s.id
      WHERE c.name IS NOT NULL
        AND TRIM(c.name) != ''
        AND TRIM(c.name) != '-'
        AND LOWER(TRIM(c.name)) != 'tanpa kelas'
      GROUP BY c.id, c.name
      ORDER BY total_points DESC, avg_points DESC, c.name ASC
      LIMIT 5
    ) t;
  END IF;

  RETURN json_build_object(
    'period_id', v_active_period.id,
    'period_name', v_active_period.name,
    'total_points', v_total_points,
    'total_items', v_total_items,
    'student_count', v_student_count,
    'validated_activities', v_distinct_activities,
    'tumbler_uses', v_tumbler_uses,
    'lunchbox_uses', v_lunchbox_uses,
    'classes', COALESCE(v_top_classes, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_landing_stats() TO anon, authenticated;
