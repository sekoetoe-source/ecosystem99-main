-- ====================================================================
-- MIGRATION: 20260928171000_multi_session_and_rewards.sql
-- Description:
-- 1. Add session and day columns to public.validations
-- 2. Drop obsolete constraint on public.validation_items (student_id, item_code, day)
-- 3. Add partial unique index on public.validations for (student_id, session, day)
-- 4. Register break_combo in public.eco_items with 250 points
-- 5. Update canonical reward cost points to new requirements
-- ====================================================================

-- 1. ADD SESSION AND DAY TO VALIDATIONS
ALTER TABLE public.validations 
  ADD COLUMN IF NOT EXISTS session text NOT NULL DEFAULT 'entry',
  ADD COLUMN IF NOT EXISTS day date;

-- Populate day for existing validations based on their actual created_at in Asia/Jakarta
UPDATE public.validations 
SET day = (created_at AT TIME ZONE 'Asia/Jakarta')::date 
WHERE day IS NULL;

-- Now ensure day is NOT NULL and default to Jakarta today
ALTER TABLE public.validations 
  ALTER COLUMN day SET NOT NULL,
  ALTER COLUMN day SET DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date;

-- 2. DROP OBSOLETE CONSTRAINT ON VALIDATION_ITEMS THAT PREVENTED MULTI-SESSION
ALTER TABLE public.validation_items 
  DROP CONSTRAINT IF EXISTS validation_items_student_id_item_code_day_key;

-- 3. CREATE UNIQUE INDEX ON VALIDATIONS TO PREVENT SAME-SESSION DUPLICATES PER DAY
CREATE UNIQUE INDEX IF NOT EXISTS validations_student_session_day_idx 
  ON public.validations (student_id, session, day) 
  WHERE (status <> 'rejected');

-- 4. REGISTER BREAK_COMBO IN ECO_ITEMS
INSERT INTO public.eco_items (code, label, points, co2_grams, active)
VALUES ('break_combo', 'Combo Tumbler + Lunchbox', 250, 127, true)
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    points = EXCLUDED.points,
    co2_grams = EXCLUDED.co2_grams,
    active = EXCLUDED.active;

-- 5. UPDATE CANONICAL REWARDS DATA
UPDATE public.rewards
SET cost_points = 6000
WHERE name = 'Voucher Kantin Rp10.000';

UPDATE public.rewards
SET cost_points = 10000
WHERE name = 'Sertifikat Jawara Lingkungan';

UPDATE public.rewards
SET cost_points = 12000
WHERE name = 'Voucher Kantin Rp25.000';

UPDATE public.rewards
SET cost_points = 30000,
    name = 'Tumbler Eco'
WHERE name = 'Botol Tumbler Eco' OR name = 'Tumbler';
