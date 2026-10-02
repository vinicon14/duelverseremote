// Run: deno test supabase/functions/_shared/discord-chat.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildGlobalChatDiscordRow,
  type ChatSupabaseClient,
  compareSnowflakes,
  type DiscordApiMessage,
  discordMessageToChatInput,
  getDiscordAvatarUrl,
  getDiscordDisplayName,
  getDiscordMessageSkipReason,
  type GlobalChatDiscordRow,
  insertDiscordChatMessage,
  snowflakeFromTimestamp,
} from "./discord-chat.ts";

const userMsg = (over: Partial<DiscordApiMessage> = {}): DiscordApiMessage => ({
  id: "1290000000000000001",
  type: 0,
  content: "  olá duelistas  ",
  author: { id: "80351110224678912", username: "nelly", global_name: "Nelly", avatar: "abc123", discriminator: "0" },
  ...over,
});

Deno.test("skip: webhook messages (app's own chat_to_discord posts) are never imported", () => {
  assertEquals(
    getDiscordMessageSkipReason(userMsg({ webhook_id: "1", content: "/dv oi", author: { id: "1", username: "Player" } })),
    "webhook",
  );
});

Deno.test("skip: bots, system, interactions, non-user types, empty content", () => {
  assertEquals(getDiscordMessageSkipReason(userMsg({ author: { id: "1", bot: true } })), "bot");
  assertEquals(getDiscordMessageSkipReason(userMsg({ author: { id: "1", system: true } })), "system");
  assertEquals(getDiscordMessageSkipReason(userMsg({ application_id: "99" })), "bot");
  assertEquals(getDiscordMessageSkipReason(userMsg({ interaction_metadata: { id: "1" } })), "bot");
  assertEquals(getDiscordMessageSkipReason(userMsg({ type: 7 })), "non_user_type"); // member join
  assertEquals(getDiscordMessageSkipReason(userMsg({ type: 20 })), "non_user_type"); // slash command
  assertEquals(getDiscordMessageSkipReason(userMsg({ content: "   " })), "empty_content");
  assertEquals(getDiscordMessageSkipReason(userMsg({ content: "" })), "empty_content"); // e.g. no MESSAGE_CONTENT intent
  assertEquals(getDiscordMessageSkipReason(userMsg({ author: undefined })), "no_author");
});

Deno.test("accept: normal messages and replies", () => {
  assertEquals(getDiscordMessageSkipReason(userMsg()), null);
  assertEquals(getDiscordMessageSkipReason(userMsg({ type: 19 })), null);
  assertEquals(getDiscordMessageSkipReason(userMsg({ type: undefined })), null);
});

Deno.test("display name follows JDA getEffectiveName precedence", () => {
  assertEquals(getDiscordDisplayName(userMsg({ member: { nick: "Apelido" } })), "Apelido");
  assertEquals(getDiscordDisplayName(userMsg()), "Nelly");
  assertEquals(getDiscordDisplayName(userMsg({ author: { id: "1", username: "nelly", global_name: null } })), "nelly");
  assertEquals(getDiscordDisplayName(userMsg({ author: { id: "1" } })), "Discord User");
});

Deno.test("avatar url follows JDA getEffectiveAvatarUrl format", () => {
  assertEquals(
    getDiscordAvatarUrl({ id: "80351110224678912", avatar: "abc123" }),
    "https://cdn.discordapp.com/avatars/80351110224678912/abc123.png",
  );
  assertEquals(
    getDiscordAvatarUrl({ id: "80351110224678912", avatar: "a_anim" }),
    "https://cdn.discordapp.com/avatars/80351110224678912/a_anim.gif",
  );
  // new username system: (id >> 22) % 6
  const idx = Number((BigInt("80351110224678912") >> 22n) % 6n);
  assertEquals(
    getDiscordAvatarUrl({ id: "80351110224678912", avatar: null, discriminator: "0" }),
    `https://cdn.discordapp.com/embed/avatars/${idx}.png`,
  );
  assertEquals(
    getDiscordAvatarUrl({ id: "1", avatar: null, discriminator: "1337" }),
    "https://cdn.discordapp.com/embed/avatars/2.png",
  );
});

Deno.test("row format is identical to legacy discord_to_chat insert", () => {
  const row = buildGlobalChatDiscordRow(
    { discordUserId: "42", username: "Nelly", avatarUrl: "https://x/a.png", content: "  hi  " },
    null,
  );
  assertEquals(row, {
    user_id: null,
    message: "hi",
    tcg_type: "yugioh",
    language_code: "en",
    source_type: "discord",
    source_username: "Nelly",
    source_avatar_url: "https://x/a.png",
    discord_user_id: "42",
  });
  const withId = buildGlobalChatDiscordRow(
    { discordUserId: "42", username: "N", avatarUrl: null, content: "x", discordMessageId: "123456", tcgType: "magic", languageCode: "pt" },
    "uuid-1",
  );
  assertEquals(withId.user_id, "uuid-1");
  assertEquals(withId.discord_message_id, "123456");
  assertEquals(withId.tcg_type, "magic");
  assertEquals(withId.language_code, "pt");
});

Deno.test("discordMessageToChatInput maps REST message", () => {
  assertEquals(discordMessageToChatInput(userMsg()), {
    discordUserId: "80351110224678912",
    username: "Nelly",
    avatarUrl: "https://cdn.discordapp.com/avatars/80351110224678912/abc123.png",
    content: "olá duelistas",
    discordMessageId: "1290000000000000001",
  });
});

Deno.test("snowflake helpers", () => {
  assertEquals(compareSnowflakes("9", "10"), -1); // numeric, not lexicographic
  assertEquals(compareSnowflakes("1290000000000000002", "1290000000000000001"), 1);
  assertEquals(compareSnowflakes("5", "5"), 0);
  const sf = snowflakeFromTimestamp(1420070400000 + 1000);
  assertEquals(BigInt(sf) >> 22n, 1000n);
});

// ---- insertDiscordChatMessage with a fake client --------------------------
type Call =
  | { op: "rpc"; fn: string; args: Record<string, unknown> }
  | { op: "insert"; table: string; row: GlobalChatDiscordRow }
  | { op: "upsert"; table: string; row: GlobalChatDiscordRow; options: unknown };

function fakeClient(opts: {
  linked?: Array<{ user_id: string; username: string }>;
  lookupError?: string;
  existingIds?: Set<string>;
  insertError?: string;
}): ChatSupabaseClient & { calls: Call[] } {
  const calls: Call[] = [];
  const existing = opts.existingIds ?? new Set<string>();
  return {
    calls,
    rpc(fn, args) {
      calls.push({ op: "rpc", fn, args });
      return Promise.resolve(
        opts.lookupError ? { data: null, error: { message: opts.lookupError } } : { data: opts.linked ?? [], error: null },
      );
    },
    from(table) {
      return {
        insert(row) {
          calls.push({ op: "insert", table, row });
          return Promise.resolve({ error: opts.insertError ? { message: opts.insertError } : null });
        },
        upsert(row, options) {
          calls.push({ op: "upsert", table, row, options });
          return {
            select(_cols: string) {
              if (opts.insertError) return Promise.resolve({ data: null, error: { message: opts.insertError } });
              if (existing.has(row.discord_message_id!)) return Promise.resolve({ data: [], error: null });
              existing.add(row.discord_message_id!);
              return Promise.resolve({ data: [{ id: "new" }], error: null });
            },
          };
        },
      };
    },
  };
}

Deno.test("insert: linked user is mapped to user_id", async () => {
  const c = fakeClient({ linked: [{ user_id: "u-1", username: "dv_user" }] });
  const r = await insertDiscordChatMessage(c, { discordUserId: "42", username: "N", avatarUrl: null, content: "oi" });
  assertEquals(r, { ok: true, inserted: true, linkedUsername: "dv_user" });
  assertEquals(c.calls[0], { op: "rpc", fn: "get_user_by_discord_id", args: { p_discord_id: "42" } });
  const ins = c.calls[1];
  assert(ins.op === "insert"); // no message id => plain insert (legacy behaviour)
  assertEquals(ins.row.user_id, "u-1");
});

Deno.test("insert: with message id uses ON CONFLICT DO NOTHING and reports duplicates", async () => {
  const c = fakeClient({});
  const input = { discordUserId: "42", username: "N", avatarUrl: null, content: "oi", discordMessageId: "777777" };
  const first = await insertDiscordChatMessage(c, input);
  const second = await insertDiscordChatMessage(c, input);
  assertEquals(first, { ok: true, inserted: true, linkedUsername: null });
  assertEquals(second, { ok: true, inserted: false, linkedUsername: null });
  const upsert = c.calls.find((x) => x.op === "upsert");
  assert(upsert && upsert.op === "upsert");
  assertEquals(upsert.options, { onConflict: "discord_message_id", ignoreDuplicates: true });
  assertEquals(upsert.row.user_id, null);
});

Deno.test("insert: lookup and insert errors are surfaced", async () => {
  const a = await insertDiscordChatMessage(fakeClient({ lookupError: "boom" }), { discordUserId: "1", username: "N", avatarUrl: null, content: "x" });
  assertEquals(a, { ok: false, stage: "lookup", error: "boom" });
  const b = await insertDiscordChatMessage(fakeClient({ insertError: "nope" }), { discordUserId: "1", username: "N", avatarUrl: null, content: "x", discordMessageId: "123456" });
  assert(!b.ok && b.stage === "insert");
});
