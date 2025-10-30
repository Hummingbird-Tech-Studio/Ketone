CREATE TYPE "public"."cycle_status" AS ENUM('InProgress', 'Completed');--> statement-breakpoint
ALTER TABLE "cycles" RENAME COLUMN "actor_id" TO "user_id";--> statement-breakpoint
DROP INDEX "idx_cycles_actor_id";--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "status" "cycle_status" NOT NULL DEFAULT 'InProgress';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cycles_user_id" ON "cycles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cycles_status" ON "cycles" USING btree ("status");