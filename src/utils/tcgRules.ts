import { normalizeTcgType } from "@/contexts/TcgContext";

export const isLegacyMagicTcg = (tcg: string | null | undefined) => tcg === "magic";
export const isLegacyPokemonTcg = (tcg: string | null | undefined) => tcg === "pokemon";

export const isYgoStyleTcg = (tcg: string | null | undefined) => {
  const normalized = normalizeTcgType(tcg);
  return normalized === "yugioh" || normalized === "genesis" || normalized === "rush_duel";
};

export const getDefaultLifePoints = (tcg: string | null | undefined) => {
  if (isLegacyMagicTcg(tcg)) return 40;
  if (isLegacyPokemonTcg(tcg)) return 6;
  return 8000;
};
