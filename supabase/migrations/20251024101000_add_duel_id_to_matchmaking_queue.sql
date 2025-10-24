ALTER TABLE "public"."matchmaking_queue"
ADD COLUMN "duel_id" "uuid",
ADD CONSTRAINT "matchmaking_queue_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "public"."live_duels"("id") ON DELETE SET NULL;
