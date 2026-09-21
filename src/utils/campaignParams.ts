const CAMPAIGN_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const MAX_VALUE_LENGTH = 100;
const SAFE_VALUE = /^[\p{L}\p{N} ._~+\-/]+$/u;

export const getCampaignParams = (search: string): URLSearchParams => {
  const source = new URLSearchParams(search);
  const safeParams = new URLSearchParams();

  CAMPAIGN_KEYS.forEach((key) => {
    const value = source.get(key)?.trim();
    if (!value || value.length > MAX_VALUE_LENGTH || !SAFE_VALUE.test(value)) return;
    safeParams.set(key, value);
  });

  return safeParams;
};

export const withCampaignParams = (path: string, search: string): string => {
  const params = getCampaignParams(search);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};