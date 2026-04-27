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
    userAgent.includes("discord")
  );
};

export const isRunningInsideDiscord = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("frame_id") || params.has("instance_id");
};