## Summary

- Add Discord Rich Presence integration using discord-rpc package
- Integrate Rich Presence hook into DuelRoom for real-time game status
- Fix build error caused by missing lucide-react Discord icon (replaced with emoji fallback)
- Reinstate partner server visuals with cover images in AdminDiscord panel
- Add cover image display with fallback to placeholder when unavailable
- Scaffold Discord voice handler edge function for automatic duelroom creation from Discord voice channels

## Changes

### Frontend
- `src/hooks/useDiscordRichPresence.ts` (new): Hook for Discord Rich Presence management
- `src/pages/DuelRoom.tsx`: Integrated Rich Presence hook, fixed icon imports, fixed template literal syntax
- `src/components/admin/AdminDiscord.tsx`: Added coverImageUrl support with fallback rendering

### Backend/Supabase
- `supabase/functions/discord-voice-handler/index.ts`: Edge function for Discord voice channel → duelroom creation
- `supabase/migrations/20260427012204_add_discord_columns_to_live_duels.sql`: Database columns for Discord integration

## Testing Plan

### Build & Run
1. Run `npm ci` to install dependencies
2. Run `npm run build` to verify build passes without errors

### AdminDiscord Panel
1. Navigate to Admin → Discord tab
2. Verify connected servers display:
   - Server cover image (if coverImageUrl is set)
   - Fallback placeholder image when no cover is available

### DuelRoom & Discord Integration
1. Log in with a Discord-linked account
2. Verify Discord connection badge shows correct status
3. Test voice channel button flow (ensure Mic/MicOff icons render properly)
4. Verify Rich Presence hook initializes when Discord is connected

### Discord Voice Integration (requires bot setup)
1. Configure a Discord server with the Duelverse bot
2. Join a configured voice channel
3. Verify automatic duelroom creation via edge function
4. Confirm duelroom appears in Duelverse with Discord channel linkage

### Ranking & Discord Gating
- Ranked matches require Discord connection (existing logic preserved)
- Users without linked Discord accounts cannot play ranked matches
