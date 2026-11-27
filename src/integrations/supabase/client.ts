/**
 * DuelVerse - Cliente Supabase
 * Desenvolvido por Vinícius
 * 
 * Configuração do cliente Supabase para autenticação,
 * banco de dados e tempo real.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const env = import.meta.env;
const SUPABASE_URL = env?.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = env?.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// O projeto Supabase vem só do ambiente (Vercel → Settings → Environment Variables
// ou .env.local). Sem fallback fixo, para nunca cair num projeto antigo por engano.
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    "[DuelVerse] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY não configuradas. Veja docs/MIGRACAO-VERCEL-SUPABASE.md",
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);