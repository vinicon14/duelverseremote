export const isDiscordEmbedded = () => {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const hasDiscordActivityParams = ["frame_id", "instance_id", "channel_id", "guild_id"].some((key) =>
    params.has(key),
  );
  const platform = params.get("platform")?.toLowerCase() || "";
  const userAgent = navigator.userAgent.toLowerCase();

  return (
    hasDiscordActivityParams ||
    platform.includes("discord") ||
    userAgent.includes("discord") ||
    window.self !== window.top
  );
};