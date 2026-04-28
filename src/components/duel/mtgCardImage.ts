import mtgCardBackImg from '@/assets/mtg-card-back.png';

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

export const MTG_CARD_BACK = mtgCardBackImg;

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
