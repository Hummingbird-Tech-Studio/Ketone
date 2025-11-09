-- Enable btree_gist extension (for potential future use with GiST indexes)
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Create trigger function to prevent overlapping cycles for the same user
-- This function ensures that no two cycles for the same user can have overlapping date ranges
--
-- How it works:
-- - Checks if any existing cycle for the same user overlaps with the new/updated cycle
-- - Uses inclusive boundary logic: allows new_start >= existing_end (boundary touching is OK)
-- - Exclusion logic: (NEW.start_date < existing_end AND NEW.end_date > existing_start)
-- - This means cycles can touch at boundaries but cannot overlap
--
-- This applies to ALL cycles (both 'InProgress' and 'Completed' status)
-- allowing validation during active cycle editing AND when completing cycles
CREATE OR REPLACE FUNCTION check_cycle_overlap()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if there's any overlapping cycle for the same user
  -- Overlap definition: Two cycles overlap if one starts before the other ends
  -- AND the other starts before the first ends
  -- Boundary touching is ALLOWED: new_start_date = existing_end_date is OK
  IF EXISTS (
    SELECT 1
    FROM cycles
    WHERE user_id = NEW.user_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (
        -- Detect TRUE overlap (strict inequality to allow boundary touching)
        -- Cycles overlap if: new_start < existing_end AND new_end > existing_start
        (NEW.start_date < end_date AND NEW.end_date > start_date)
      )
  ) THEN
    RAISE EXCEPTION 'Cycle overlaps with another cycle for this user'
      USING ERRCODE = '23P01', -- exclusion_violation
            HINT = 'A cycle cannot overlap with another cycle for the same user. Boundary touching (new start = previous end) is allowed.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Create trigger for INSERT operations
DROP TRIGGER IF EXISTS check_cycle_overlap_insert ON cycles;
CREATE TRIGGER check_cycle_overlap_insert
BEFORE INSERT ON cycles
FOR EACH ROW
EXECUTE FUNCTION check_cycle_overlap();
--> statement-breakpoint

-- Create trigger for UPDATE operations (only when dates are changed)
DROP TRIGGER IF EXISTS check_cycle_overlap_update ON cycles;
CREATE TRIGGER check_cycle_overlap_update
BEFORE UPDATE OF start_date, end_date ON cycles
FOR EACH ROW
EXECUTE FUNCTION check_cycle_overlap();
