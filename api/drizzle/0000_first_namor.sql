CREATE TYPE "public"."cycle_status" AS ENUM('InProgress', 'Completed');--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "cycle_status" NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cycles_valid_date_range" CHECK ("cycles"."end_date" > "cycles"."start_date"),
	CONSTRAINT "chk_cycles_min_duration" CHECK ((EXTRACT(EPOCH FROM ("cycles"."end_date" - "cycles"."start_date")) * 1000) >= 3600000)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"password_changed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cycles_user_id" ON "cycles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cycles_dates" ON "cycles" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_cycles_status" ON "cycles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cycles_user_active" ON "cycles" USING btree ("user_id") WHERE "cycles"."status" = 'InProgress';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");