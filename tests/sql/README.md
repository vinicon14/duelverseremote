# Testes SQL: `record_signup_attribution`

Testes de integração da migration `20261002200000_signup_attribution.sql`.

- `setup_test_db.sql`: mínimo do Supabase (roles `anon`/`authenticated`/`service_role`,
  `auth.users`, `auth.uid()`/`auth.role()` com as definições reais) + `profiles` com as
  policies RLS de produção. Idempotente.
- `test_signup_attribution.sql`: simula requests do PostgREST (`SET LOCAL ROLE` +
  `request.jwt.claims`) e cobre: update legítimo do dono, dono não altera `signup_*`
  (nem forjando o flag), RPC grava 1x, usuário > 24h rejeitado, perfil inexistente → NULL,
  `direct`/referrer, anon sem EXECUTE, service_role e SQL direto podem corrigir, outras
  funções SECURITY DEFINER continuam atualizando `profiles`.

## Como rodar (Postgres local, superuser)

```bash
createdb test_duelverse
psql -v ON_ERROR_STOP=1 -d test_duelverse -f tests/sql/setup_test_db.sql
psql -v ON_ERROR_STOP=1 -d test_duelverse -f supabase/migrations/20261002200000_signup_attribution.sql
psql -v ON_ERROR_STOP=1 -d test_duelverse -f tests/sql/test_signup_attribution.sql
```

Use sempre `ON_ERROR_STOP=1`: qualquer asserção que falha aborta o script com exit code ≠ 0
e a última linha `TODOS OS TESTES PASSARAM` só aparece se tudo passou.
