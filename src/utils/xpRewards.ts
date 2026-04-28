export const DAILY_XP_REWARDS = {
  login: 5,
  casualDuel: 10,
  adsBundle: 100,
  forumInteraction: 10,
} as const;

export const WELCOME_XP_REWARDS = {
  initialAccount: 50,
} as const;

export const RANKED_XP_DIFFICULTIES = [
  { key: "easy", label: "Facil", xp: 5 },
  { key: "medium", label: "Medio", xp: 20 },
  { key: "hard", label: "Dificil", xp: 30 },
  { key: "extreme", label: "Extremo", xp: 50 },
  { key: "insane", label: "Insano", xp: 1000 },
] as const;

export type RankedXpDifficultyKey = (typeof RANKED_XP_DIFFICULTIES)[number]["key"];

const RANKED_DIFFICULTY_STORAGE_PREFIX = "duelverse_ranked_xp_difficulty";

export const getRankedDifficulty = (key?: string | null) =>
  RANKED_XP_DIFFICULTIES.find((difficulty) => difficulty.key === key) || RANKED_XP_DIFFICULTIES[0];

export const getRankedDifficultyStorageKey = (tcgType: string) =>
  `${RANKED_DIFFICULTY_STORAGE_PREFIX}:${tcgType}`;
