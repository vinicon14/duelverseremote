/**
 * Helper to resolve the card-back image URL used to render private/face-down cards.
 * Priority:
 *   1. Player's equipped sleeve (localStorage `activeSleeveUrl`)
 *   2. Default Yu-Gi-Oh! card back
 */

export const DEFAULT_CARD_BACK_URL =
  "https://images.ygoprodeck.com/images/cards/back_high.jpg";

export const getEquippedSleeveUrl = (): string | null => {
  try {
    const v = localStorage.getItem("activeSleeveUrl");
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
};

/**
 * Returns the URL to use for the back of a card.
 * Prefer the equipped sleeve; fall back to the default YGO back.
 */
export const getCardBackUrl = (sleeveUrl?: string | null): string => {
  if (sleeveUrl && sleeveUrl.trim()) return sleeveUrl;
  return getEquippedSleeveUrl() ?? DEFAULT_CARD_BACK_URL;
};
