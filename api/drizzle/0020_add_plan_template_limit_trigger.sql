-- Enforce max 20 plan templates per user at the database level.
-- This prevents race conditions where concurrent requests bypass the
-- application-level count check and exceed the limit.
-- Uses advisory lock (same pattern as plan-cycle mutual exclusion trigger).

CREATE OR REPLACE FUNCTION check_plan_template_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Acquire advisory lock to serialize concurrent template creation for the same user
  PERFORM pg_advisory_xact_lock(hashtext('plan_template_limit_' || NEW.user_id::text));

  IF (
    SELECT COUNT(*)
    FROM plan_templates
    WHERE user_id = NEW.user_id
  ) >= 20 THEN
    RAISE EXCEPTION 'User has reached the maximum of 20 plan templates'
      USING ERRCODE = '23514',
            CONSTRAINT = 'plan_template_user_limit',
            HINT = 'A user cannot have more than 20 plan templates. Delete an existing template before creating a new one.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plan_template_limit
  BEFORE INSERT ON plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION check_plan_template_limit();
