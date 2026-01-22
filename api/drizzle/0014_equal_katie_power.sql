ALTER TABLE "plans" ADD COLUMN "name" varchar(100);--> statement-breakpoint
UPDATE "plans" SET "name" = 'Unnamed Plan' WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "description" varchar(500);
