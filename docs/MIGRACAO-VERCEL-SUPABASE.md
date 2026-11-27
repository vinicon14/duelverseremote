# DuelVerse: sair da Lovable → Vercel + Supabase próprio

Estado em 26/11/2026. O código deste branch já não depende da Lovable. O que falta é **dados/infra**.

## O que mudou no código
- Removidos `lovable-tagger` (vite) e `@lovable.dev/cloud-auth-js` (+ `src/integrations/lovable`, que não era usado: o login Google/Discord já usa `supabase.auth.signInWithOAuth`).
- Removidos `.lovable/` e `.env.production` (apontava para o Supabase do Lovable Cloud `xxttwzewtqxvpgefggah`).
- `bun.lock` regenerado a partir do npm público (o antigo baixava pacotes do registry privado `lovable-core-prod`). `package-lock.json` (desatualizado) removido: o projeto usa **bun**.
- Cliente Supabase sem URL/chave fixas: só `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `public/push-sw.js` recebe URL/chave do ambiente no build (plugin no `vite.config.ts`).
- `AdminDiscord` mostra a URL de interactions a partir do ambiente; `auth-email-hook` sem fallback para o projeto antigo; Electron aceita `DUELVERSE_SUPABASE_URL`/`DUELVERSE_SUPABASE_ANON_KEY`.
- `drizzle.config.ts` usa `DATABASE_URL` (antes `LOVABLE_DB_MIGRATION_URL`).
- `vercel.json`: Vite, `bun install`, saída `dist`, fallback SPA e cache do service worker.
- `supabase/scripts/repoint-project-url.sql`: troca a URL do projeto antigo pela nova em funções SQL, jobs do pg_cron e views, depois do restore.

## Passo a passo da migração
1. **Lovable Cloud (Vinicius):** o backend `xxttwzewtqxvpgefggah` respondeu 500 em 26/11 (provavelmente pausado por créditos). Reativar em Lovable → projeto → Cloud. Depois: More → Database → Manage → Settings → **Export data** (arquivo `.backup`) e More → Storage → baixar os buckets (`plan-images`, `tournament-decklists`, `match-recordings`, `marketplace-images`, `ringtones`).
2. **Supabase próprio (Vinicius):** criar projeto (free ou Pro) em supabase.com, região São Paulo (`sa-east-1`). Passar o `ref` e o connection string (via Vault/1Password, nunca no chat).
3. **Restore:** `pg_restore --no-owner --no-privileges -d "$DATABASE_URL" export.backup` (schemas `public`, `auth`, `storage`, `cron`, `vault`) e depois
   `psql "$DATABASE_URL" -v old_ref=xxttwzewtqxvpgefggah -v new_ref=NOVO_REF -f supabase/scripts/repoint-project-url.sql`.
   Recriar no Vault o segredo `email_queue_service_role_key` (service role do NOVO projeto) e os segredos do Discord chat sync.
   Usuários: a export oficial pode não trazer senhas utilizáveis → plano B é e-mail de redefinição de senha.
4. **Storage:** criar os buckets com as mesmas políticas e subir os arquivos.
5. **Edge Functions:** `supabase link --project-ref NOVO_REF && supabase functions deploy` (33 funções, `verify_jwt` em `supabase/config.toml`; trocar `project_id` lá).
   Segredos (`supabase secrets set`): `DISCORD_BOT_TOKEN DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET DISCORD_PUBLIC_KEY DISCORD_BOT_BRIDGE_SECRET GEMINI_API_KEY MERCADOPAGO_ACCESS_TOKEN STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SEND_EMAIL_HOOK_SECRET VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY METERED_API_KEY METERED_DOMAIN CLOUDFLARE_TURN_KEY_ID CLOUDFLARE_TURN_API_TOKEN TURN_URLS TURN_USERNAME TURN_CREDENTIAL`. A Lovable não exporta segredos: pegar nos painéis de cada serviço.
6. **Auth:** Site URL `https://duelverse.site`, redirect URLs (`https://duelverse.site/**`, `https://*.vercel.app/**`), provedores Google e Discord com as credenciais OAuth (callback novo: `https://NOVO_REF.supabase.co/auth/v1/callback`), Send Email Hook → `auth-email-hook`, MFA TOTP ligado.
7. **Webhooks externos** apontando para o novo projeto: Stripe (`stripe-webhook`), Mercado Pago (`mercadopago-webhook`), CartPanda (`cartpanda-webhook`), Discord Interactions Endpoint (`discord-interactions`) e o bot Java (`src/main/java`, URL fixa do projeto antigo).
8. **Vercel:** env `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (+ `VITE_*` de anúncios do `.env.example`) em Production e Preview, testar o preview, e só então apontar `duelverse.site` (DNS na Cloudflare) para a Vercel.
9. **Apps:** Capacitor/Electron abrem `https://duelverse.site`, então seguem o domínio. Recompilar o Electron com a URL nova (`electron/main.cjs`).
10. Só depois de tudo testado: despublicar na Lovable. **Não apagar** o projeto Lovable nem o banco antigo.
