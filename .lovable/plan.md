

## Plan: Fix Matchmaking, Discord → DuelVerse Bridge, and Auto Server Setup

### 1. Matchmaking — Resolve function ambiguity

**Problem**: There are two `public.matchmake` overloads (4-arg and 5-arg). PostgreSQL throws "function is not unique" when called.

**Fix** (migration):
- DROP the old 4-argument `matchmake(p_match_type, p_user_id, p_tcg_type, p_max_players)`.
- Keep only the 5-arg version with `p_language_code` (already correct, ambiguity-free).
- Verify queue insert respects `language_code` filter properly.

### 2. Discord → DuelVerse — Make incoming messages actually arrive

**Root causes**:
- The Java bot's `DiscordServerManager` keeps the enabled-servers list **in memory only** — every restart wipes it, so `isServerEnabled()` returns false and `onMessageReceived` exits early before even POSTing to the bridge.
- The Java bot doesn't read from `system_settings.discord_bot_status` (the same source the admin panel writes to).

**Fix**:
- **Java bot (`DiscordServerManager.java` + `DiscordBot.java`)**: On startup and every 60s, fetch `system_settings` row `discord_bot_status` from Supabase (REST + service-role key) and rebuild the enabled-servers / channels map. Drop the in-memory-only design.
- **Java bot (`DiscordMessageHandler.java`)**: Confirm POST URL is `https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-bridge/webhook` and payload includes `{ author: { id, username, avatar_url, bot:false }, content }`. Add a `Bridge POST [status]` log line so we can see it in logs.
- **Edge function (`discord-bridge`)**: Tighten loop protection — only skip when `body.author.bot === true` (not username matching), so users with "DuelVerse" in their name aren't wrongly filtered. Also accept `discord_user_id` at top-level as an alias.
- **Fallback for unlinked Discord users**: instead of inserting with a random profile (which is incorrect and confusing), require the sender to be linked via OAuth. If unlinked, skip silently and log it. This matches the "OAuth + linked profiles" decision approved earlier.

### 3. Admin Discord — One-click "Add server" automation

**Problem**: Admin must manually paste serverId, channelId, inviteLink, and webhookUrl.

**Fix**:
- Add new edge function action `type: "list_guilds"` in `discord-bridge`: using the bot token (stored as Supabase secret `DISCORD_BOT_TOKEN`), call `GET https://discord.com/api/v10/users/@me/guilds` then for each guild `GET /guilds/:id/channels` (text channels only). Return list of `{ guildId, guildName, channels:[{id,name}] }`.
- Add `type: "auto_setup_server"`: takes `{ guildId, channelId }`, automatically:
  - Creates a webhook in that channel (`POST /channels/:id/webhooks`)
  - Generates an invite link (`POST /channels/:id/invites`)
  - Fetches guild name
  - Upserts the server entry into `system_settings.discord_bot_status`
  - Returns the saved server config
- Move `DISCORD_BOT_TOKEN` from a UI input to a Supabase secret (request via `add_secret` if not present). Remove the bot-token input field from the admin UI.
- Rewrite `AdminDiscord.tsx`:
  - "Refresh servers" button → calls `list_guilds`, shows a dropdown of guilds the bot is in.
  - When admin picks a guild, second dropdown shows that guild's text channels.
  - Single "Add" button → calls `auto_setup_server` (no manual IDs, invite, or webhook URL needed).
  - Keep the manual-add fallback collapsed under an "Advanced" expander for edge cases.

### Files affected

```text
supabase/migrations/<new>.sql               # drop old matchmake overload
supabase/functions/discord-bridge/index.ts  # new actions + tighter loop guard
src/components/admin/AdminDiscord.tsx       # auto-setup UI
src/main/java/com/duelverse/admin/DiscordServerManager.java
src/main/java/com/duelverse/bot/DiscordBot.java
src/main/java/com/duelverse/discord/DiscordMessageHandler.java
```

### Required user action after deploy

- Add `DISCORD_BOT_TOKEN` as a Supabase secret if not already set (will request via secret prompt).
- Recompile and restart the Java bot (`./gradlew build` + run the new `.jar`) so it picks up the DB-synced server config.
- Ensure **Message Content Intent** is enabled in the Discord Developer Portal for the bot.

