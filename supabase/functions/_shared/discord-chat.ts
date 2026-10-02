/**
 * Shared Discord -> DuelVerse global chat logic.
 *
 * Used by:
 *   - discord-bridge (legacy "discord_to_chat" path, called by the Java bot)
 *   - discord-chat-sync (serverless poller triggered by pg_cron)
 *
 * Both paths MUST produce exactly the same row in public.global_chat_messages.
 */

// Minimal structural type so this module does not depend on a specific
// supabase-js version (and stays easy to fake in unit tests).
type DbError = { message: string } | null;
export interface ChatSupabaseClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: DbError }>;
  from(table: string): {
    insert(row: GlobalChatDiscordRow): PromiseLike<{ error: DbError }>;
    upsert(
      row: GlobalChatDiscordRow,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): { select(columns: string): PromiseLike<{ data: unknown; error: DbError }> };
  };
}

export interface DiscordChatInput {
  discordUserId: string;
  username: string;
  avatarUrl: string | null;
  content: string;
  tcgType?: string;
  languageCode?: string;
  /** Discord message snowflake. When present, inserts are idempotent (unique index). */
  discordMessageId?: string | null;
}

export interface GlobalChatDiscordRow {
  user_id: string | null;
  message: string;
  tcg_type: string;
  language_code: string;
  source_type: "discord";
  source_username: string;
  source_avatar_url: string | null;
  discord_user_id: string;
  discord_message_id?: string;
}

export type InsertDiscordChatResult =
  | {
    ok: true;
    inserted: boolean; // false => duplicate discord_message_id (already imported)
    linkedUsername: string | null;
  }
  | { ok: false; stage: "lookup" | "insert"; error: string };

export const DEFAULT_TCG_TYPE = "yugioh";
export const DEFAULT_LANGUAGE_CODE = "en";

/** Pure: builds the exact row the legacy discord_to_chat path inserts. */
export function buildGlobalChatDiscordRow(
  input: DiscordChatInput,
  linkedUserId: string | null,
): GlobalChatDiscordRow {
  const row: GlobalChatDiscordRow = {
    user_id: linkedUserId,
    message: input.content.trim(),
    tcg_type: input.tcgType ?? DEFAULT_TCG_TYPE,
    language_code: input.languageCode ?? DEFAULT_LANGUAGE_CODE,
    source_type: "discord",
    source_username: input.username,
    source_avatar_url: input.avatarUrl,
    discord_user_id: String(input.discordUserId),
  };
  if (input.discordMessageId) row.discord_message_id = String(input.discordMessageId);
  return row;
}

/**
 * Looks up the linked DuelVerse account (if any) and inserts the message.
 * With a discordMessageId the insert is `ON CONFLICT (discord_message_id) DO NOTHING`,
 * so concurrent writers (Java bot + cron sync, overlapping cron runs) never duplicate.
 */
export async function insertDiscordChatMessage(
  supabase: ChatSupabaseClient,
  input: DiscordChatInput,
): Promise<InsertDiscordChatResult> {
  const { data: linkedUser, error: linkedUserError } = await supabase.rpc(
    "get_user_by_discord_id",
    { p_discord_id: String(input.discordUserId) },
  );
  if (linkedUserError) {
    return { ok: false, stage: "lookup", error: linkedUserError.message };
  }

  const linkedRows = Array.isArray(linkedUser)
    ? (linkedUser as Array<{ user_id?: string | null; username?: string | null }>)
    : [];
  const hasLinkedUser = linkedRows.length > 0;
  const linkedUserId: string | null = hasLinkedUser ? linkedRows[0].user_id ?? null : null;
  const linkedUsername: string | null = hasLinkedUser ? linkedRows[0].username ?? null : null;

  const row = buildGlobalChatDiscordRow(input, linkedUserId);

  if (row.discord_message_id) {
    const { data, error } = await supabase
      .from("global_chat_messages")
      .upsert(row, { onConflict: "discord_message_id", ignoreDuplicates: true })
      .select("id");
    if (error) return { ok: false, stage: "insert", error: error.message };
    const inserted = Array.isArray(data) ? data.length > 0 : Boolean(data);
    return { ok: true, inserted, linkedUsername };
  }

  const { error } = await supabase.from("global_chat_messages").insert(row);
  if (error) return { ok: false, stage: "insert", error: error.message };
  return { ok: true, inserted: true, linkedUsername };
}

// ---------------------------------------------------------------------------
// Discord REST message helpers (used by the cron sync)
// ---------------------------------------------------------------------------

export interface DiscordApiUser {
  id: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  bot?: boolean;
  system?: boolean;
}

export interface DiscordApiMessage {
  id: string;
  type?: number;
  content?: string;
  author?: DiscordApiUser;
  webhook_id?: string;
  application_id?: string;
  interaction_metadata?: unknown;
  member?: { nick?: string | null };
}

// 0 = DEFAULT, 19 = REPLY. Everything else (joins, pins, slash-command
// responses, boosts, thread events...) is not user chat.
const USER_MESSAGE_TYPES = new Set([0, 19]);

export type SkipReason =
  | "no_author"
  | "webhook"
  | "bot"
  | "system"
  | "non_user_type"
  | "empty_content";

/** Pure: returns why a Discord message must NOT be mirrored, or null to import it. */
export function getDiscordMessageSkipReason(msg: DiscordApiMessage): SkipReason | null {
  if (!msg.author?.id) return "no_author";
  // Messages posted by the app itself (chat_to_discord, announcements) are webhook
  // messages: skipping every webhook message is what prevents an app->Discord->app loop.
  if (msg.webhook_id) return "webhook";
  if (msg.author.bot === true) return "bot";
  if (msg.author.system === true) return "system";
  if (msg.interaction_metadata || msg.application_id) return "bot";
  const type = typeof msg.type === "number" ? msg.type : 0;
  if (!USER_MESSAGE_TYPES.has(type)) return "non_user_type";
  if (typeof msg.content !== "string" || msg.content.trim() === "") return "empty_content";
  return null;
}

/** Same precedence as JDA Member#getEffectiveName (nick > global name > username). */
export function getDiscordDisplayName(msg: DiscordApiMessage): string {
  return (
    msg.member?.nick ||
    msg.author?.global_name ||
    msg.author?.username ||
    "Discord User"
  );
}

/** Same URL format as JDA User#getEffectiveAvatarUrl. */
export function getDiscordAvatarUrl(user: DiscordApiUser): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
  }
  let index: number;
  if (!user.discriminator || user.discriminator === "0" || user.discriminator === "0000") {
    try {
      index = Number((BigInt(user.id) >> 22n) % 6n);
    } catch {
      index = 0;
    }
  } else {
    index = Number(user.discriminator) % 5;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/** Pure: maps a Discord REST message to the shared insert input. */
export function discordMessageToChatInput(msg: DiscordApiMessage): DiscordChatInput {
  const author = msg.author!;
  return {
    discordUserId: String(author.id),
    username: getDiscordDisplayName(msg),
    avatarUrl: getDiscordAvatarUrl(author),
    content: String(msg.content ?? "").trim(),
    discordMessageId: String(msg.id),
  };
}

/** Compare Discord snowflakes (decimal strings) numerically. */
export function compareSnowflakes(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

const DISCORD_EPOCH_MS = 1420070400000n;

/** Snowflake that sorts right at the given timestamp (used as an initial cursor). */
export function snowflakeFromTimestamp(ms: number): string {
  return ((BigInt(Math.floor(ms)) - DISCORD_EPOCH_MS) << 22n).toString();
}
