-- Phase 1 Verification Queries

-- 1. Check periods created correctly
SELECT 'PERIODS' as check, COUNT(*) as count FROM public.periods;
SELECT name, status, start_date, end_date FROM public.periods ORDER BY start_date;

-- 2. Check ACTIVE count
SELECT 'ACTIVE PERIODS COUNT' as check, COUNT(*) as count FROM public.periods WHERE status='ACTIVE';

-- 3. Check validations backfilled with period_id
SELECT 'VALIDATIONS WITH PERIOD' as check, COUNT(*) as count FROM public.validations WHERE period_id IS NOT NULL;
SELECT 'VALIDATIONS WITHOUT PERIOD' as check, COUNT(*) as count FROM public.validations WHERE period_id IS NULL;

-- 4. Validate period assignment
SELECT p.name, p.start_date, COUNT(v.id) as validation_count 
FROM public.periods p 
LEFT JOIN public.validations v ON v.period_id = p.id 
GROUP BY p.id, p.name, p.start_date
ORDER BY p.start_date;

-- 5. Check if period_student_scores view exists and works
SELECT 'PERIOD_STUDENT_SCORES VIEW' as check, COUNT(*) as record_count FROM public.period_student_scores LIMIT 1;

-- 6. Check if period_class_scores view exists and works
SELECT 'PERIOD_CLASS_SCORES VIEW' as check, COUNT(*) as record_count FROM public.period_class_scores LIMIT 1;

-- 7. Check if student_scores (all-time) still exists and works
SELECT 'STUDENT_SCORES ALLTIME VIEW' as check, COUNT(*) as record_count FROM public.student_scores LIMIT 1;

-- 8. Check if class_scores (all-time) still exists and works
SELECT 'CLASS_SCORES ALLTIME VIEW' as check, COUNT(*) as record_count FROM public.class_scores LIMIT 1;

-- 9. Check reset_point function exists
SELECT 'RESET_POINT FUNCTION' as check, 'EXISTS' as status WHERE EXISTS(
  SELECT 1 FROM pg_proc 
  WHERE proname = 'reset_point' 
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
);

-- 10. Check audit table exists
SELECT 'AUDIT TABLE' as check, 'EXISTS' as status FROM public.period_reset_audit_events LIMIT 1;
