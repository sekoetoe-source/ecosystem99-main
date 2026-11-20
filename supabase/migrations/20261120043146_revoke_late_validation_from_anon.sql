REVOKE EXECUTE ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_late_validation(uuid, text, text[], text, public.validation_source, text, date) TO authenticated;
