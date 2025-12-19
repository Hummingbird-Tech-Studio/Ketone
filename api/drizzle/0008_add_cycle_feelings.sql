-- Create fasting_feeling enum
CREATE TYPE "public"."fasting_feeling" AS ENUM (
  'energetic',
  'motivated',
  'calm',
  'normal',
  'hungry',
  'tired',
  'swollen',
  'anxious',
  'dizzy',
  'weak',
  'suffering',
  'irritable'
);
--> statement-breakpoint

-- Create cycle_feelings table
CREATE TABLE "public"."cycle_feelings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL,
  "feeling" "public"."fasting_feeling" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign key constraint with cascade delete
ALTER TABLE "public"."cycle_feelings"
  ADD CONSTRAINT "cycle_feelings_cycle_id_cycles_id_fk"
  FOREIGN KEY ("cycle_id")
  REFERENCES "public"."cycles"("id")
  ON DELETE cascade
  ON UPDATE no action;
--> statement-breakpoint

-- Create unique constraint to prevent duplicate feelings per cycle
CREATE UNIQUE INDEX "uq_cycle_feelings_unique" ON "public"."cycle_feelings" USING btree ("cycle_id", "feeling");
--> statement-breakpoint

-- Create index for faster lookups by cycle_id
CREATE INDEX "idx_cycle_feelings_cycle_id" ON "public"."cycle_feelings" USING btree ("cycle_id");
--> statement-breakpoint

-- Create trigger function to enforce max 3 feelings per cycle
CREATE OR REPLACE FUNCTION check_feelings_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM cycle_feelings
    WHERE cycle_id = NEW.cycle_id
  ) >= 3 THEN
    RAISE EXCEPTION 'A cycle cannot have more than 3 feelings'
      USING ERRCODE = '23514',
            HINT = 'Remove an existing feeling before adding a new one.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Create trigger for INSERT operations
CREATE TRIGGER check_feelings_limit_insert
BEFORE INSERT ON cycle_feelings
FOR EACH ROW
EXECUTE FUNCTION check_feelings_limit();
