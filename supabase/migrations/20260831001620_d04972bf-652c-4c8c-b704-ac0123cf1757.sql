-- Substitui a política deny-list por uma allow-list de chaves realmente públicas
DROP POLICY IF EXISTS "Public settings viewable by all" ON public.system_settings;

-- Chaves públicas: necessárias para visitantes anônimos (ads, landing, downloads)
CREATE POLICY "Public settings allowlist"
ON public.system_settings
FOR SELECT
TO anon, authenticated
USING (
  key = ANY (ARRAY[
    'monetag_enabled',
    'monetag_zone_id',
    'monetag_sdk_domain',
    'monetag_custom_script',
    'monetag_push_enabled',
    'monetag_push_script',
    'landing_video_url',
    'bgm_video_url',
    'android_download_url',
    'windows_download_url',
    'discord_stats_cache',
    'store_url',
    'support_email',
    'ad_publisher_signup_url'
  ])
);

-- Chaves apenas para usuários autenticados (ringtones de chamada)
CREATE POLICY "Authenticated settings allowlist"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  key = ANY (ARRAY[
    'ringtone_ygo',
    'ringtone_mtg',
    'ringtone_pkm'
  ])
);
-- pix_key, support_whatsapp, ad_revenue_dashboard_url, discord_bot_status: somente admins (policy existente)