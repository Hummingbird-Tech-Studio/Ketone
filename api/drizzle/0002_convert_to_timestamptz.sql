-- Migration: Convert all timestamp columns to timestamp with time zone (timestamptz)
-- This ensures consistent timezone handling across the application

-- Step 1: Drop triggers that depend on cycles date columns
DROP TRIGGER IF EXISTS check_cycle_overlap_insert ON cycles;
DROP TRIGGER IF EXISTS check_cycle_overlap_update ON cycles;

-- Step 2: Convert users table timestamp columns to timestamptz
ALTER TABLE users
  ALTER COLUMN password_changed_at TYPE timestamp with time zone USING password_changed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC';

-- Step 3: Convert cycles table timestamp columns to timestamptz
ALTER TABLE cycles
  ALTER COLUMN start_date TYPE timestamp with time zone USING start_date AT TIME ZONE 'UTC',
  ALTER COLUMN end_date TYPE timestamp with time zone USING end_date AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC';

-- Step 4: Recreate the overlap check triggers
CREATE TRIGGER check_cycle_overlap_insert
BEFORE INSERT ON cycles
FOR EACH ROW
EXECUTE FUNCTION check_cycle_overlap();

CREATE TRIGGER check_cycle_overlap_update
BEFORE UPDATE OF start_date, end_date ON cycles
FOR EACH ROW
EXECUTE FUNCTION check_cycle_overlap();
