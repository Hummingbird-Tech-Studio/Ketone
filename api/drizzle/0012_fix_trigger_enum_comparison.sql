-- Fix trigger enum comparison by casting status to text
-- This prevents PostgreSQL from validating enum values at parse time
CREATE OR REPLACE FUNCTION check_plan_cycle_mutual_exclusion()
RETURNS TRIGGER AS $$
BEGIN
  -- Acquire advisory lock to serialize concurrent plan/cycle creation for the same user
  -- This prevents write-skew where both transactions pass the EXISTS check before either commits
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));

  -- When inserting/updating a plan to 'active' status
  -- Cast status to text to avoid enum validation at parse time
  IF TG_TABLE_NAME = 'plans' AND NEW.status::text = 'active' THEN
    IF EXISTS (
      SELECT 1
      FROM cycles
      WHERE user_id = NEW.user_id
        AND status = 'InProgress'
    ) THEN
      RAISE EXCEPTION 'Cannot have both an active plan and an active cycle'
        USING ERRCODE = '23P01',
              HINT = 'A user cannot have both an active plan and an active cycle at the same time. Complete or cancel your current cycle before creating a plan.';
    END IF;
  END IF;

  -- When inserting/updating a cycle to 'InProgress' status
  -- Cast status to text to avoid enum validation at parse time
  IF TG_TABLE_NAME = 'cycles' AND NEW.status::text = 'InProgress' THEN
    IF EXISTS (
      SELECT 1
      FROM plans
      WHERE user_id = NEW.user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Cannot have both an active cycle and an active plan'
        USING ERRCODE = '23P01',
              HINT = 'A user cannot have both an active cycle and an active plan at the same time. Complete or cancel your current plan before creating a cycle.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
