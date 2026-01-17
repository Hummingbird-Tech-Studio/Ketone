CREATE TYPE "public"."period_status" AS ENUM('scheduled', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"status" "plan_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"fasting_duration" integer NOT NULL,
	"eating_window" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"status" "period_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_period_order_range" CHECK ("periods"."order" >= 1 AND "periods"."order" <= 31),
	CONSTRAINT "chk_fasting_duration_range" CHECK ("periods"."fasting_duration" >= 1 AND "periods"."fasting_duration" <= 168),
	CONSTRAINT "chk_eating_window_range" CHECK ("periods"."eating_window" >= 1 AND "periods"."eating_window" <= 24),
	CONSTRAINT "chk_periods_valid_date_range" CHECK ("periods"."end_date" > "periods"."start_date")
);
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plans_user_id" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_plans_status" ON "plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_plans_start_date" ON "plans" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plans_user_active" ON "plans" USING btree ("user_id") WHERE "plans"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_periods_plan_id" ON "periods" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_periods_status" ON "periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_periods_dates" ON "periods" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_periods_plan_order" ON "periods" USING btree ("plan_id","order");
