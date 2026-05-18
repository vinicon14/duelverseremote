/**
 * DuelVerse - Banlist Yu-Gi-Oh! Advanced
 * 
 * Determina o número máximo de cópias permitidas de uma carta
 * com base na banlist TCG Advanced (campo banlist_info.ban_tcg da API YGOPRODeck).
 *
 * - Banned        => 0
 * - Limited       => 1
 * - Semi-Limited  => 2
 * - Unlimited     => 3 (padrão)
 */
import type { YugiohCard } from '@/hooks/useYugiohCards';

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited' | 'Unlimited';

export interface BanlistInfo {
  ban_tcg?: string;
  ban_ocg?: string;
  ban_goat?: string;
}

export type CardWithBanlist = YugiohCard & { banlist_info?: BanlistInfo };

export const getAdvancedBanStatus = (card: CardWithBanlist | null | undefined): BanStatus => {
  const status = card?.banlist_info?.ban_tcg;
  if (status === 'Banned') return 'Banned';
  if (status === 'Limited') return 'Limited';
  if (status === 'Semi-Limited') return 'Semi-Limited';
  return 'Unlimited';
};

export const getMaxCopiesAdvanced = (card: CardWithBanlist | null | undefined): number => {
  switch (getAdvancedBanStatus(card)) {
    case 'Banned': return 0;
    case 'Limited': return 1;
    case 'Semi-Limited': return 2;
    default: return 3;
  }
};

export const getBanStatusLabel = (status: BanStatus, lang: 'pt' | 'en' = 'pt'): string => {
  const map = {
    pt: { Banned: 'Banida', Limited: 'Limitada', 'Semi-Limited': 'Semi-Limitada', Unlimited: 'Ilimitada' },
    en: { Banned: 'Banned', Limited: 'Limited', 'Semi-Limited': 'Semi-Limited', Unlimited: 'Unlimited' },
  } as const;
  return map[lang][status];
};
