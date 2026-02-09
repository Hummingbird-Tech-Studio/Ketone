CREATE TABLE "plan_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"period_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "chk_plan_template_period_count" CHECK ("plan_templates"."period_count" >= 1 AND "plan_templates"."period_count" <= 31)
);
--> statement-breakpoint
CREATE TABLE "template_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_template_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"fasting_duration" numeric(5, 2) NOT NULL,
	"eating_window" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_template_period_order_range" CHECK ("template_periods"."order" >= 1 AND "template_periods"."order" <= 31),
	CONSTRAINT "chk_template_fasting_duration_range" CHECK ("template_periods"."fasting_duration" >= 1 AND "template_periods"."fasting_duration" <= 168),
	CONSTRAINT "chk_template_eating_window_range" CHECK ("template_periods"."eating_window" >= 1 AND "template_periods"."eating_window" <= 24)
);
--> statement-breakpoint
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_periods" ADD CONSTRAINT "template_periods_plan_template_id_plan_templates_id_fk" FOREIGN KEY ("plan_template_id") REFERENCES "public"."plan_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_templates_user_id" ON "plan_templates" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_template_periods_plan_order" ON "template_periods" USING btree ("plan_template_id","order");