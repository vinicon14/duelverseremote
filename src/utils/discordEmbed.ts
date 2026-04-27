/**
 * Detecta se a aplicação está sendo executada como Discord Activity / Embedded App
 * (dentro de um iframe do cliente Discord).
 */
export const isInsideDiscord = (): boolean => {
  if (typeof window === "undefined") return false;

  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    // Discord Embedded App SDK injeta esses query params
    if (
      params.has("frame_id") ||
      params.has("instance_id") ||
      params.has("platform") &&
        (params.get("platform") === "desktop" || params.get("platform") === "mobile")
    ) {
      // Confirmação adicional: estar em iframe
      if (window.self !== window.top) return true;
    }

    // Heurística: estar embutido em iframe do domínio discord.com
    if (window.self !== window.top) {
      const ancestors = (document as any).referrer || "";
      if (/discord(app)?\.com/i.test(ancestors)) return true;
    }

    // Flag manual via query (?discord=embed)
    if (params.get("embed") === "discord" || params.get("client") === "discord") {
      return true;
    }

    // User agent do cliente Discord desktop/mobile (Electron embute "Discord")
    if (/Discord\//i.test(navigator.userAgent)) return true;
  } catch {
    return false;
  }

  return false;
};
