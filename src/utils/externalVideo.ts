/**
 * DuelVerse - Vídeos externos na galeria
 * Reconhece links do YouTube, Twitch, Vimeo, TikTok e Kick.
 */
export type ExternalPlatform = "youtube" | "twitch" | "vimeo" | "tiktok" | "kick";

export interface ParsedExternalVideo {
  platform: ExternalPlatform;
  videoId: string;
  url: string;
  embedUrl: string;
  thumbnailUrl: string | null;
}

export const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  vimeo: "Vimeo",
  tiktok: "TikTok",
  kick: "Kick",
  internal: "DuelVerse",
};

export function parseExternalVideoUrl(raw: string): ParsedExternalVideo | null {
  const input = raw.trim();
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  // YouTube
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    const id =
      host === "youtu.be"
        ? parts[0]
        : url.searchParams.get("v") ||
          (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" ? parts[1] : null);
    if (!id) return null;
    return {
      platform: "youtube",
      videoId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Twitch (vídeo ou clipe)
  if (host.endsWith("twitch.tv")) {
    const parent = typeof window !== "undefined" ? window.location.hostname : "duelverse.site";
    if (parts[0] === "videos" && parts[1]) {
      return {
        platform: "twitch",
        videoId: parts[1],
        url: `https://www.twitch.tv/videos/${parts[1]}`,
        embedUrl: `https://player.twitch.tv/?video=${parts[1]}&parent=${parent}&autoplay=false`,
        thumbnailUrl: null,
      };
    }
    const clipId = parts[0] === "clip" ? parts[1] : parts[1] === "clip" ? parts[2] : null;
    if (clipId) {
      return {
        platform: "twitch",
        videoId: clipId,
        url: input,
        embedUrl: `https://clips.twitch.tv/embed?clip=${clipId}&parent=${parent}&autoplay=false`,
        thumbnailUrl: null,
      };
    }
    return null;
  }

  // Vimeo
  if (host.endsWith("vimeo.com")) {
    const id = parts.find((p) => /^\d+$/.test(p));
    if (!id) return null;
    return {
      platform: "vimeo",
      videoId: id,
      url: `https://vimeo.com/${id}`,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      thumbnailUrl: null,
    };
  }

  // TikTok
  if (host.endsWith("tiktok.com")) {
    const id = parts[parts.indexOf("video") + 1] || parts[parts.length - 1];
    if (!id || !/^\d+$/.test(id)) return null;
    return {
      platform: "tiktok",
      videoId: id,
      url: input,
      embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
      thumbnailUrl: null,
    };
  }

  // Kick
  if (host.endsWith("kick.com")) {
    const id = parts[parts.length - 1];
    if (!id) return null;
    return {
      platform: "kick",
      videoId: id,
      url: input,
      embedUrl: `https://player.kick.com/${parts[0]}`,
      thumbnailUrl: null,
    };
  }

  return null;
}

export function embedUrlFor(platform: string, videoId: string | null, url: string): string | null {
  if (!videoId) return null;
  const parsed = parseExternalVideoUrl(url);
  if (parsed) return parsed.embedUrl;
  return null;
}
