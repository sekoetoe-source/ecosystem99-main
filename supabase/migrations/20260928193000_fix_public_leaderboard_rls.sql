-- Migration: Fix Public Leaderboard and Aggregate Scores Visibility
-- Allows anon / public visitors to see real student scores and class scores on /peringkat and landing page

-- 1. Ensure RLS policies permit reading approved validations and validation_items for anon
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'validations' AND policyname = 'Public can view approved validations'
  ) THEN
    CREATE POLICY "Public can view approved validations"
    ON public.validations FOR SELECT
    TO anon
    USING (status = 'approved');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'validation_items' AND policyname = 'Public can view validation items'
  ) THEN
    CREATE POLICY "Public can view validation items"
    ON public.validation_items FOR SELECT
    TO anon
    USING (true);
  END IF;
END $$;

-- 2. Alter views so they run without security_invoker (runs as view owner with full read of points)
ALTER VIEW public.student_scores SET (security_invoker = false);
ALTER VIEW public.class_scores SET (security_invoker = false);

-- 3. Grants
GRANT SELECT ON public.student_scores TO anon, authenticated;
GRANT SELECT ON public.class_scores TO anon, authenticated;
GRANT SELECT ON public.validations TO anon, authenticated;
GRANT SELECT ON public.validation_items TO anon, authenticated;
