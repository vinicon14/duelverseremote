/**
 * DuelVerse - Display de TCGs (rebranding)
 *
 * Chaves canonicas:
 *   - 'yugioh'    -> exibido como "YGO Advanced" (TCG principal)
 *   - 'genesis'   -> exibido como "Genesys"
 *   - 'rush_duel' -> exibido como "Rush Duel"
 *
 * Sempre que precisar mostrar o nome de um TCG na UI, use estes helpers.
 * Não use literais "Yu-Gi-Oh", "Magic" ou "Pokémon" em componentes — isso
 * mantém a renomeação centralizada e fácil de reverter ou ajustar.
 */
import type { TcgType } from "@/contexts/TcgContext";
import { normalizeTcgType } from "@/contexts/TcgContext";

/** Nome amigável longo (ex.: "YGO Advanced"). */
export function getTcgDisplayName(tcg: string | null | undefined): string {
  switch (normalizeTcgType(tcg)) {
    case "yugioh":
      return "YGO Advanced";
    case "genesis":
      return "Genesys";
    case "rush_duel":
      return "Rush Duel";
    default:
      return "TCG";
  }
}

/** Nome curto/abreviado (ex.: "Advanced"). */
export function getTcgShortName(tcg: string | null | undefined): string {
  switch (normalizeTcgType(tcg)) {
    case "yugioh":
      return "Advanced";
    case "genesis":
      return "Genesys";
    case "rush_duel":
      return "Rush";
    default:
      return "TCG";
  }
}

/** Emoji/símbolo associado a cada TCG. */
export function getTcgEmoji(tcg: string | null | undefined): string {
  switch (normalizeTcgType(tcg)) {
    case "yugioh":
      return "🃏";
    case "genesis":
      return "⚛️";
    case "rush_duel":
      return "⚡";
    default:
      return "🎴";
  }
}

/** Lista pública dos TCGs disponíveis (com YGO Advanced em destaque). */
export const TCG_LIST: { key: TcgType; name: string; short: string; emoji: string; featured: boolean }[] = [
  { key: "yugioh", name: "YGO Advanced", short: "Advanced", emoji: "🃏", featured: true },
  { key: "genesis", name: "Genesys", short: "Genesys", emoji: "⚛️", featured: false },
  { key: "rush_duel", name: "Rush Duel", short: "Rush", emoji: "⚡", featured: false },
];
