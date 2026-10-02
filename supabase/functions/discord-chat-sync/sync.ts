/**
 * Core of discord-chat-sync, written with injected dependencies so it can be
 * unit-tested without network or database.
 */
import {
  compareSnowflakes,
  type DiscordApiMessage,
  discordMessageToChatInput,
  type DiscordChatInput,
  getDiscordMessageSkipReason,
  type InsertDiscordChatResult,
  snowflakeFromTimestamp,
} from "../_shared/discord-chat.ts";

export const DISCORD_API = "https://discord.com/api/v10";
export const PAGE_LIMIT = 100;
export const MAX_PAGES_PER_CHANNEL = 5;
export const MAX_RATE_LIMIT_RETRIES = 3;
export const MAX_RETRY_AFTER_MS = 15_000;

export interface CursorStore {
  get(channelId: string): Promise<string | null>;
  set(channelId: string, lastMessageId: string): Promise<void>;
}

export interface SyncDeps {
  botToken: string;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  cursors: CursorStore;
  insert: (input: DiscordChatInput) => Promise<InsertDiscordChatResult>;
  log?: (msg: string) => void;
}

export interface ChannelSyncResult {
  channelId: string;
  status: "initialized" | "synced" | "error";
  fetched: number;
  inserted: number;
  duplicates: number;
  skipped: Record<string, number>;
  cursor: string | null;
  error?: string;
}

export class DiscordHttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`Discord API ${status}: ${body.slice(0, 200)}`);
  }
}

/** Pure: extracts every channel the app bridges to (same source chat_to_discord uses). */
interface BridgeServerConfig {
  enabled?: unknown;
  webhookUrl?: unknown;
  channelId?: unknown;
}

export function resolveBridgeChannelIds(settingsValue: unknown): string[] {
  let status: unknown = settingsValue;
  if (typeof status === "string") {
    try {
      status = JSON.parse(status);
    } catch {
      return [];
    }
  }
  const rawServers = (status as { servers?: unknown } | null)?.servers;
  const servers: BridgeServerConfig[] = Array.isArray(rawServers) ? rawServers : [];
  const ids = servers
    .filter((s) => s?.enabled && s?.webhookUrl && typeof s?.channelId === "string" && /^\d{5,25}$/.test(s.channelId))
    .map((s) => s.channelId as string);
  return [...new Set(ids)];
}

function retryAfterMs(res: Response, body: unknown): number {
  const ra = (body as { retry_after?: unknown } | null)?.retry_after;
  const fromBody = typeof ra === "number" ? ra : NaN;
  const fromHeader = Number(res.headers.get("retry-after"));
  const seconds = Number.isFinite(fromBody) ? fromBody : Number.isFinite(fromHeader) ? fromHeader : 1;
  return Math.max(0, Math.ceil(seconds * 1000));
}

/** GET a channel's messages, retrying on 429 using retry_after. */
export async function fetchChannelMessages(
  deps: SyncDeps,
  channelId: string,
  params: Record<string, string>,
): Promise<DiscordApiMessage[]> {
  const qs = new URLSearchParams(params).toString();
  const url = `${DISCORD_API}/channels/${channelId}/messages?${qs}`;
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetchImpl(url, {
      headers: { Authorization: `Bot ${deps.botToken}`, "User-Agent": "DuelVerseChatSync (https://duelverse.site, 1.0)" },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (res.status === 429) {
      const wait = retryAfterMs(res, body);
      if (attempt >= MAX_RATE_LIMIT_RETRIES || wait > MAX_RETRY_AFTER_MS) {
        throw new DiscordHttpError(429, `rate limited (retry_after=${wait}ms)`);
      }
      deps.log?.(`[discord-chat-sync] 429 on ${channelId}, retrying in ${wait}ms`);
      await deps.sleep(wait);
      continue;
    }
    if (!res.ok) throw new DiscordHttpError(res.status, text);
    return Array.isArray(body) ? (body as DiscordApiMessage[]) : [];
  }
}

export async function syncChannel(deps: SyncDeps, channelId: string): Promise<ChannelSyncResult> {
  const result: ChannelSyncResult = {
    channelId,
    status: "synced",
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    skipped: {},
    cursor: null,
  };

  try {
    let cursor = await deps.cursors.get(channelId);

    // First run: never import history. Start from the newest message (or "now").
    if (!cursor) {
      const latest = await fetchChannelMessages(deps, channelId, { limit: "1" });
      const initial = latest[0]?.id ?? snowflakeFromTimestamp(deps.now());
      await deps.cursors.set(channelId, initial);
      result.status = "initialized";
      result.cursor = initial;
      return result;
    }

    for (let page = 0; page < MAX_PAGES_PER_CHANNEL; page++) {
      const batch = await fetchChannelMessages(deps, channelId, {
        after: cursor,
        limit: String(PAGE_LIMIT),
      });
      if (batch.length === 0) break;
      result.fetched += batch.length;

      // Discord returns newest-first; process oldest-first so the cursor only moves forward.
      const ordered = batch
        .filter((m) => typeof m?.id === "string" && compareSnowflakes(m.id, cursor!) > 0)
        .sort((a, b) => compareSnowflakes(a.id, b.id));

      let advanced: string = cursor;
      let failed: string | null = null;
      for (const msg of ordered) {
        const reason = getDiscordMessageSkipReason(msg);
        if (reason) {
          result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
          advanced = msg.id;
          continue;
        }
        const res = await deps.insert(discordMessageToChatInput(msg));
        if (!res.ok) {
          failed = `${res.stage}: ${res.error}`;
          break;
        }
        if (res.inserted) result.inserted++;
        else result.duplicates++;
        advanced = msg.id;
      }

      if (advanced !== cursor) {
        await deps.cursors.set(channelId, advanced);
        cursor = advanced;
      }
      if (failed) {
        // Cursor stays at the last good message; next run retries (dedupe keeps it safe).
        result.status = "error";
        result.error = failed;
        break;
      }
      if (batch.length < PAGE_LIMIT) break;
    }
    result.cursor = cursor;
  } catch (err) {
    result.status = "error";
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

export async function syncAllChannels(deps: SyncDeps, channelIds: string[]): Promise<ChannelSyncResult[]> {
  const results: ChannelSyncResult[] = [];
  for (const id of channelIds) results.push(await syncChannel(deps, id));
  return results;
}

/** Constant-time string comparison (same approach as discord-bridge). */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export type AuthDecision = "ok" | "not_configured" | "unauthorized";

/** Pure: decides whether the cron call is authorized. Missing secret => fail closed. */
export function checkCronAuth(expected: string | null | undefined, provided: string | null): AuthDecision {
  if (!expected || expected.length < 16) return "not_configured";
  if (!provided) return "unauthorized";
  return timingSafeEqual(expected, provided) ? "ok" : "unauthorized";
}
