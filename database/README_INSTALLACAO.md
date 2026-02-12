# Instructions para Instalação do Sistema de Loja

O sistema de loja foi dividido em 15 arquivos SQL menores para facilitar a instalação no Supabase.

## 📋 Ordem de Execução:

### 1. Acesse o Supabase SQL Editor
- Vá para: https://supabase.com/dashboard
- Selecione seu projeto
- Vá em "SQL Editor" no menu lateral

### 2. Execute os arquivos em ordem:

**Tabelas:**
1. `shop_step1_products.sql` - Tabela de produtos
2. `shop_step2_orders.sql` - Tabela de pedidos
3. `shop_step3_duelcoins_purchases.sql` - Compras de DuelCoins
4. `shop_step4_cashouts.sql` - Resgates de DuelCoins
5. `shop_step5_codes.sql` - Códigos de administração

**Estrutura:**
6. `shop_step6_indexes.sql` - Índices das tabelas
7. `shop_step7_rls.sql` - Ativar Row Level Security

**Políticas de Segurança:**
8. `shop_step8_rls_policies.sql` - Políticas para produtos
9. `shop_step9_orders_policies.sql` - Políticas para pedidos
10. `shop_step10_purchases_policies.sql` - Políticas para compras
11. `shop_step11_cashouts_policies.sql` - Políticas para resgates
12. `shop_step12_codes_policies.sql` - Políticas para códigos

**Funções:**
13. `shop_step13_purchase_function.sql` - Função de compra de DuelCoins
14. `shop_step14_cashout_function.sql` - Função de resgate de DuelCoins

**Configurações:**
15. `shop_step15_settings.sql` - Taxa padrão de resgate

## ⚠️ Importante:

- Execute um arquivo por vez
- Aguarde cada execução completar antes de prosseguir
- Se algum arquivo der erro, verifique se a tabela anterior foi criada corretamente
- A ordem é CRUCIAL para evitar erros de dependência

## ✅ Validação:

Após instalar, você pode validar executando:

```sql
-- Verificar tabelas
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%shop%' OR table_name LIKE '%cashout%' OR table_name LIKE '%purchase%';

-- Verificar funções
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name LIKE 'process_duelcoins%';
```

## 🔄 Atualização Types:

Após instalar as tabelas, execute a atualização dos types do frontend:
1. Execute `npm run supabase:types` (se disponível)
2. Ou atualize manualmente o arquivo `src/integrations/supabase/types.ts`

O sistema estará pronto para uso após todos os 15 arquivos serem executados!