

## Plan: One TCG Per Account System

### What changes

The system will enforce **one TCG profile per account**. Users who want to play multiple TCGs need separate accounts. The profile switcher will be removed.

### Steps

1. **Modify login flow (`src/pages/Auth.tsx`)**
   - After login, if user has multiple TCG profiles, redirect to `/profile-select` where they pick ONE profile (the others get deleted)
   - If user has exactly one profile, go straight to `/duels`
   - On signup, create a single profile for the selected TCG as it already does

2. **Update ProfileSelect page (`src/pages/ProfileSelect.tsx`)**
   - Remove "create new profile" buttons
   - Change to a one-time selection screen: "Choose your TCG" — selecting one deletes the others permanently
   - Show a warning that unchosen profiles will be removed
   - After selection, redirect to `/duels`

3. **Remove TcgSwitcher from Navbar (`src/components/Navbar.tsx`)**
   - Remove `<TcgSwitcher />` from both desktop and mobile nav
   - Keep showing the active TCG icon as a static badge (no dropdown)

4. **Simplify TcgSwitcher (`src/components/TcgSwitcher.tsx`)**
   - Convert to a static display showing current TCG (no switching functionality)

5. **Update TcgContext (`src/contexts/TcgContext.tsx`)**
   - Remove `switchProfile` and `createProfile` from context
   - Keep `activeTcg` and `activeProfile` as read-only state

6. **Clean up profile-select route**
   - Only accessible when user has multiple profiles (legacy cleanup scenario)
   - After choosing, delete non-selected profiles from `tcg_profiles` table

### Technical details

- Deletion of extra profiles uses `supabase.from('tcg_profiles').delete().eq('user_id', userId).neq('tcg_type', selectedTcg)`
- No database migration needed — existing RLS allows users to delete own profiles (need to verify; may need to add DELETE policy)
- The `tcg_profiles` table already has user update/insert policies; need to check if DELETE policy exists

