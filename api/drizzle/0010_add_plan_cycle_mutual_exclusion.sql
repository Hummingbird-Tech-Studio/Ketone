-- Create trigger function to enforce plan-cycle mutual exclusion
-- Ensures a user cannot have both an active plan AND an active cycle
CREATE OR REPLACE FUNCTION check_plan_cycle_mutual_exclusion()
RETURNS TRIGGER AS $$
BEGIN
  -- When inserting/updating a plan to 'active' status
  IF TG_TABLE_NAME = 'plans' AND NEW.status = 'active' THEN
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
  IF TG_TABLE_NAME = 'cycles' AND NEW.status = 'InProgress' THEN
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
--> statement-breakpoint

-- Attach triggers to plans table
DROP TRIGGER IF EXISTS check_plan_cycle_exclusion_insert ON plans;
CREATE TRIGGER check_plan_cycle_exclusion_insert
BEFORE INSERT ON plans
FOR EACH ROW
EXECUTE FUNCTION check_plan_cycle_mutual_exclusion();
--> statement-breakpoint

DROP TRIGGER IF EXISTS check_plan_cycle_exclusion_update ON plans;
CREATE TRIGGER check_plan_cycle_exclusion_update
BEFORE UPDATE OF status ON plans
FOR EACH ROW
EXECUTE FUNCTION check_plan_cycle_mutual_exclusion();
--> statement-breakpoint

-- Attach triggers to cycles table
DROP TRIGGER IF EXISTS check_cycle_plan_exclusion_insert ON cycles;
CREATE TRIGGER check_cycle_plan_exclusion_insert
BEFORE INSERT ON cycles
FOR EACH ROW
EXECUTE FUNCTION check_plan_cycle_mutual_exclusion();
--> statement-breakpoint

DROP TRIGGER IF EXISTS check_cycle_plan_exclusion_update ON cycles;
CREATE TRIGGER check_cycle_plan_exclusion_update
BEFORE UPDATE OF status ON cycles
FOR EACH ROW
EXECUTE FUNCTION check_plan_cycle_mutual_exclusion();
