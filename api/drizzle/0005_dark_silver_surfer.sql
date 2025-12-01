CREATE TYPE "public"."gender" AS ENUM('Male', 'Female', 'Prefer not to say');--> statement-breakpoint
CREATE TYPE "public"."height_unit" AS ENUM('cm', 'ft_in');--> statement-breakpoint
CREATE TYPE "public"."weight_unit" AS ENUM('kg', 'lbs');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "weight" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "height" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "gender" "gender";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "weight_unit" "weight_unit";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "height_unit" "height_unit";--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "chk_weight_range" CHECK ("profiles"."weight" IS NULL OR ("profiles"."weight" >= 30 AND "profiles"."weight" <= 300));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "chk_height_range" CHECK ("profiles"."height" IS NULL OR ("profiles"."height" >= 120 AND "profiles"."height" <= 250));