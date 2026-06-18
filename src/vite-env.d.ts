/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_DISCORD_SUPABASE_MAPPING_PREFIX?: string
  readonly VITE_GAM_REWARDED_AD_UNIT_PATH?: string
  readonly VITE_GOOGLE_AD_MANAGER_REWARDED_AD_UNIT?: string
}
