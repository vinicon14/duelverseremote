# Fix Plan: `get_my_tournaments` Function Error

## Problem Analysis

The error message:
```
Could not find the function public.get_my_tournaments without parameters in the schema cache
```

### Root Cause
- The function `get_my_tournaments()` exists in the SQL file [`database/tournament_system.sql`](database/tournament_system.sql:270)
- The frontend calls this function from [`src/pages/MyTournaments.tsx`](src/pages/MyTournaments.tsx:58) using `supabase.rpc('get_my_tournaments')`
- **The function has NOT been executed in the Supabase database**, so it doesn't exist in the schema cache

### Function Details
Located at [`database/tournament_system.sql:270-295`](database/tournament_system.sql:270), the function:
- Takes NO parameters
- Returns JSON containing tournaments where the current user is a participant
- Uses `auth.uid()` to get the current authenticated user's ID

## Required Functions (from SQL file)
The database should have these 8 functions:
1. `create_normal_tournament(p_name, p_description, p_start_date, p_end_date, p_prize_pool, p_entry_fee, p_max_participants)`
2. `join_normal_tournament(p_tournament_id)`
3. `distribute_normal_tournament_prize(p_tournament_id)`
4. `get_normal_tournaments()`
5. **`get_my_tournaments()` ← MISSING**
6. `get_my_created_tournaments()`
7. `get_tournament_participants(p_tournament_id)`
8. `get_tournament_opponents(p_tournament_id)`

## Solution Plan

### Step 1: Execute SQL in Supabase
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project → SQL Editor
3. Open [`database/tournament_system.sql`](database/tournament_system.sql)
4. Copy the entire content
5. Paste and execute in the Supabase SQL Editor
6. This will create all 8 functions including the missing `get_my_tournaments()`

### Step 2: Verify Functions Created
Run this verification query in Supabase SQL Editor:
```sql
SELECT 
  routine_name, 
  routine_type 
FROM information_schema.routines 
WHERE routine_name IN (
  'create_normal_tournament',
  'join_normal_tournament',
  'distribute_normal_tournament_prize',
  'get_normal_tournaments',
  'get_my_tournaments',
  'get_my_created_tournaments',
  'get_tournament_participants',
  'get_tournament_opponents'
)
ORDER BY routine_name;
```

### Step 3: Test Frontend
1. Navigate to My Tournaments page in the app
2. The error should no longer appear
3. The function should return tournament data for the logged-in user

## Alternative Solutions

### Option A: Reinstall Database Schema
If the database is out of sync:
1. Use [`database/complete_database_reset.sql`](database/complete_database_reset.sql) for a fresh start
2. Or use individual files:
   - [`database/tournament_system.sql`](database/tournament_system.sql) for tournament functions
   - [`database/weekly_tournament_system.sql`](database/weekly_tournament_system.sql) for weekly tournament functions

### Option B: Just Create the Missing Function
If you only want to create the missing function, execute this SQL directly in Supabase:
```sql
CREATE OR REPLACE FUNCTION get_my_tournaments()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', t.id,
        'name', t.name,
        'status', t.status,
        'is_weekly', t.is_weekly,
        'created_by', t.created_by,
        'current_round', t.current_round,
        'created_at', t.created_at
      )
    )
    FROM tournaments t
    INNER JOIN tournament_participants tp ON tp.tournament_id = t.id
    WHERE tp.user_id = v_user_id
    ORDER BY t.created_at DESC
  );
END;
$$ LANGUAGE plpgsql;
```

## Expected Outcome
After executing the SQL, the function will be available in Supabase's schema cache, and the frontend call to `supabase.rpc('get_my_tournaments')` will work correctly.
