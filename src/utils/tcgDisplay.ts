/**
 * DuelVerse - Display de TCGs (rebranding)
 *
 * As chaves internas continuam as mesmas no banco e no código:
 *   - 'yugioh'  → exibido como "YGO Advanced" (TCG principal)
 *   - 'magic'   → exibido como "Genesis"
 *   - 'pokemon' → exibido como "Rush Duel"
 *
 * Sempre que precisar mostrar o nome de um TCG na UI, use estes helpers.
 * Não use literais "Yu-Gi-Oh", "Magic" ou "Pokémon" em componentes — isso
 * mantém a renomeação centralizada e fácil de reverter ou ajustar.
 */
import type { TcgType } from "@/contexts/TcgContext";

/** Nome amigável longo (ex.: "YGO Advanced"). */
export function getTcgDisplayName(tcg: string | null | undefined): string {
  switch (tcg) {
    case "yugioh":
      return "YGO Advanced";
    case "magic":
      return "Genesis";
    case "pokemon":
      return "Rush Duel";
    default:
      return "TCG";
  }
}

/** Nome curto/abreviado (ex.: "Advanced"). */
export function getTcgShortName(tcg: string | null | undefined): string {
  switch (tcg) {
    case "yugioh":
      return "Advanced";
    case "magic":
      return "Genesis";
    case "pokemon":
      return "Rush";
    default:
      return "TCG";
  }
}

/** Emoji/símbolo associado a cada TCG. */
export function getTcgEmoji(tcg: string | null | undefined): string {
  switch (tcg) {
    case "yugioh":
      return "🃏";
    case "magic":
      return "⚛️";
    case "pokemon":
      return "⚡";
    default:
      return "🎴";
  }
}

/** Lista pública dos TCGs disponíveis (com YGO Advanced em destaque). */
export const TCG_LIST: { key: TcgType; name: string; short: string; emoji: string; featured: boolean }[] = [
  { key: "yugioh", name: "YGO Advanced", short: "Advanced", emoji: "🃏", featured: true },
  { key: "magic", name: "Genesis", short: "Genesis", emoji: "⚛️", featured: false },
  { key: "pokemon", name: "Rush Duel", short: "Rush", emoji: "⚡", featured: false },
];
