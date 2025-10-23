CREATE TYPE live_status AS ENUM ('active', 'inactive', 'finished');

CREATE TABLE "public"."lives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duel_id" "uuid" NOT NULL,
    "daily_room_url" "text" NOT NULL,
    "status" live_status DEFAULT 'active'::live_status NOT NULL,
    "viewers_count" integer DEFAULT 0 NOT NULL,
    "commentator_id" "uuid",
    "is_featured" boolean DEFAULT false NOT NULL,
    "ended_at" timestamp with time zone,

    CONSTRAINT "lives_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lives_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "public"."live_duels"("id") ON DELETE CASCADE,
    CONSTRAINT "lives_commentator_id_fkey" FOREIGN KEY ("commentator_id") REFERENCES "public"."profiles"("user_id") ON DELETE SET NULL
);

ALTER TABLE "public"."lives" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON "public"."lives"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for authenticated users" ON "public"."lives"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for admins or creators" ON "public"."lives"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (
  (SELECT check_user_role(auth.uid()) = 'admin') OR
  (EXISTS (SELECT 1 FROM live_duels WHERE live_duels.id = lives.duel_id AND live_duels.creator_id = auth.uid()))
)
WITH CHECK (
  (SELECT check_user_role(auth.uid()) = 'admin') OR
  (EXISTS (SELECT 1 FROM live_duels WHERE live_duels.id = lives.duel_id AND live_duels.creator_id = auth.uid()))
);

CREATE POLICY "Enable delete for admins" ON "public"."lives"
AS PERMISSIVE FOR DELETE
TO authenticated
USING ((SELECT check_user_role(auth.uid()) = 'admin'));
