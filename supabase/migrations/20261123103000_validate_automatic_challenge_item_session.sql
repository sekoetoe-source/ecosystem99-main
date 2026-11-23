-- Validate that an automatic challenge's item is supported by the chosen scan session.
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_auto_award_item_session_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_auto_award_item_session_check
  CHECK (
    NOT auto_award
    OR (
      (target_session = 'entry' AND target_item_code IN ('tumbler', 'lunchbox'))
      OR
      (target_session = 'break' AND target_item_code IN ('tumbler', 'lunchbox', 'break_combo'))
    )
  );
