type MagicImageUris = Partial<{
  small: string;
  normal: string;
  large: string;
  png: string;
  art_crop: string;
}>;

type MagicCardFace = {
  image_uris?: MagicImageUris;
};

type MagicCardImageSource = {
  isFaceDown?: boolean;
  image_uris?: MagicImageUris;
  card_faces?: MagicCardFace[];
  image?: string;
  image_url?: string;
};

const MTG_CARD_BACK_SVG = encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d4a574" />
        <stop offset="100%" stop-color="#8b5e34" />
      </linearGradient>
    </defs>
    <rect width="488" height="680" rx="28" fill="url(#bg)" />
    <rect x="18" y="18" width="452" height="644" rx="22" fill="none" stroke="url(#frame)" stroke-width="14" />
    <circle cx="244" cy="210" r="92" fill="#111827" stroke="#d4a574" stroke-width="10" />
    <circle cx="244" cy="210" r="58" fill="#1d4ed8" opacity="0.9" />
    <rect x="84" y="362" width="320" height="84" rx="14" fill="#111827" stroke="#d4a574" stroke-width="8" />
    <text x="244" y="414" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#f8fafc" letter-spacing="10">MTG</text>
    <text x="244" y="500" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#cbd5e1" letter-spacing="4">DUELVERSE</text>
  </svg>
`);

export const MTG_CARD_BACK = `data:image/svg+xml;charset=utf-8,${MTG_CARD_BACK_SVG}`;

const pickFromImageUris = (imageUris?: MagicImageUris, preferredSize: 'small' | 'normal' = 'small') => {
  if (!imageUris) return undefined;

  const order = preferredSize === 'normal'
    ? [imageUris.normal, imageUris.large, imageUris.png, imageUris.small, imageUris.art_crop]
    : [imageUris.small, imageUris.normal, imageUris.large, imageUris.png, imageUris.art_crop];

  return order.find(Boolean);
};

export const getMagicCardImage = (
  card?: MagicCardImageSource | null,
  preferredSize: 'small' | 'normal' = 'small'
) => {
  if (!card) return MTG_CARD_BACK;
  if (card.isFaceDown) return MTG_CARD_BACK;

  return (
    pickFromImageUris(card.image_uris, preferredSize) ||
    pickFromImageUris(card.card_faces?.[0]?.image_uris, preferredSize) ||
    pickFromImageUris(card.card_faces?.[1]?.image_uris, preferredSize) ||
    card.image ||
    card.image_url ||
    MTG_CARD_BACK
  );
};
