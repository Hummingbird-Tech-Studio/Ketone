ALTER TABLE "periods" ADD COLUMN "fasting_start_date" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "periods" ADD COLUMN "fasting_end_date" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "periods" ADD COLUMN "eating_start_date" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "periods" ADD COLUMN "eating_end_date" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "chk_fasting_dates_valid" CHECK ("periods"."fasting_end_date" > "periods"."fasting_start_date");--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "chk_eating_dates_valid" CHECK ("periods"."eating_end_date" > "periods"."eating_start_date");--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "chk_fasting_before_eating" CHECK ("periods"."eating_start_date" >= "periods"."fasting_end_date");