DROP INDEX "idx_periods_status";--> statement-breakpoint
ALTER TABLE "periods" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."period_status";