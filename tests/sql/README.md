# Testes SQL para a RPC `record_signup_attribution`

Este diretório contém testes de integração SQL para a migration `20261002200000_signup_attribution.sql`.

## Estrutura

- **`setup_test_db.sql`**: Cria o schema mínimo necessário (auth.users, auth.uid(), auth.role(), profiles)
- **`test_signup_attribution.sql`**: Testes da RPC `record_signup_attribution` e do trigger `protect_signup_attribution`

## Requisitos

- PostgreSQL 12+ (local ou Docker)
- Extensão `pgcrypto` (criada automaticamente pelo setup)

## Como rodar

### Opção 1: PostgreSQL local (apt/brew)

```bash
# 1. Criar banco de teste
createdb test_duelverse

# 2. Setup do schema mínimo
psql -U postgres -d test_duelverse -f tests/sql/setup_test_db.sql

# 3. Rodar a migration
psql -U postgres -d test_duelverse -f supabase/migrations/20261002200000_signup_attribution.sql

# 4. Rodar os testes
psql -U postgres -d test_duelverse -f tests/sql/test_signup_attribution.sql
```

### Opção 2: Docker

```bash
# 1. Iniciar Postgres em container
docker run --rm --name test-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:15

# 2. Aguardar alguns segundos para o Postgres iniciar
sleep 5

# 3. Criar banco
docker exec test-postgres psql -U postgres -c "CREATE DATABASE test_duelverse;"

# 4. Setup do schema mínimo
docker exec -i test-postgres psql -U postgres -d test_duelverse < tests/sql/setup_test_db.sql

# 5. Rodar a migration
docker exec -i test-postgres psql -U postgres -d test_duelverse < supabase/migrations/20261002200000_signup_attribution.sql

# 6. Rodar os testes
docker exec -i test-postgres psql -U postgres -d test_duelverse < tests/sql/test_signup_attribution.sql

# 7. Parar container
docker stop test-postgres
```

## Testes incluídos

1. **TESTE 1**: RPC grava atribuição na primeira chamada
2. **TESTE 2**: RPC NÃO grava na segunda chamada (first-touch)
3. **TESTE 3**: RPC NÃO grava para usuário criado há mais de 24h
4. **TESTE 4**: RPC grava 'direct' quando não vem nenhum parâmetro
5. **TESTE 5**: RPC aplica limites de tamanho (100 chars, 255 para referrer)
6. **TESTE 6**: Usuário NÃO pode alterar colunas signup_* diretamente (trigger)
7. **TESTE 7**: RPC NÃO executa para anon (sem autenticação)

## Resultado esperado

```
NOTICE:  TESTE 1 PASSOU: RPC gravou atribuição corretamente
NOTICE:  TESTE 2 PASSOU: RPC não sobrescreve atribuição (first-touch)
NOTICE:  TESTE 3 PASSOU: RPC não grava para usuário > 24h
NOTICE:  TESTE 4 PASSOU: RPC grava 'direct' quando não vem nenhum parâmetro
NOTICE:  TESTE 5 PASSOU: RPC aplica limites de tamanho
NOTICE:  TESTE 6 PASSOU: Usuário não pode alterar colunas signup_*
NOTICE:  TESTE 7 PASSOU: RPC não executa para anon
NOTICE:  
NOTICE:  ========================================
NOTICE:  TODOS OS TESTES PASSARAM!
NOTICE:  ========================================
```

## Limpeza

Para dropar o banco de teste após rodar:

```bash
# PostgreSQL local
dropdb test_duelverse

# Docker (já foi removido com --rm)
```
