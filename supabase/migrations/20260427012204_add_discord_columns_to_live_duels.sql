-- Add Discord-related columns to live_duels table for voice channel integration

ALTER TABLE public.live_duels
ADD COLUMN IF NOT EXISTS discord_channel_id TEXT,
ADD COLUMN IF NOT EXISTS discord_guild_id TEXT;

-- Add index for faster lookups by Discord channel
CREATE INDEX IF NOT EXISTS idx_live_duels_discord_channel_id ON public.live_duels(discord_channel_id);
CREATE INDEX IF NOT EXISTS idx_live_duels_discord_guild_id ON public.live_duels(discord_guild_id);

-- Add comment to explain the purpose
COMMENT ON COLUMN public.live_duels.discord_channel_id IS 'Discord channel ID associated with this duel (for voice channel integration)';
COMMENT ON COLUMN public.live_duels.discord_guild_id IS 'Discord guild (server) ID associated with this duel';