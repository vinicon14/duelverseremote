# Sistema de Anúncios - Duelverse

## Como funciona:

### 1. Carregamento Inicial (index.html)
- Scripts de anúncios (Google AdSense e Monetag) são carregados automaticamente
- **Exceto** se a URL começar com `/pro/` (rotas PRO)

### 2. Componentes de Anúncios

#### GoogleAd.tsx
- Verifica `useAccountType()` para saber se usuário é PRO
- Se for PRO: retorna `null` (não renderiza nada)
- Se for FREE: renderiza anúncio do Google AdSense

#### AdBanner.tsx  
- Verifica `useAccountType()` para saber se usuário é PRO
- Se for PRO: retorna `null` (não renderiza nada)
- Se for FREE: renderiza banner de anúncio interno

#### AdPopup.tsx
- Usado em Duels.tsx para mostrar anúncio antes de criar/entrar em duelo
- **Só aparece em rotas normais** (não em `/pro/*`)
- Tem countdown de 5 segundos antes de permitir continuar

### 3. Páginas com Anúncios

#### Home.tsx
- Mostra GoogleAdBanner no topo (só se !isPro)
- Mostra AdBanners internos (só se !isPro)
- Mostra GoogleAdBanner no meio (só se !isPro)

#### Duels.tsx  
- Mostra AdPopup antes de criar/entrar em duelo (só em rotas normais)
- Em rotas `/pro/*`: cria/entra em duelo imediatamente sem anúncio

### 4. Verificação em Tempo Real

#### useAccountType()
- Verifica `profiles.account_type` no Supabase
- Retorna `{ isPro: boolean }`
- Atualiza automaticamente se o tipo de conta mudar

#### ProGuard (rotas /pro/*)
- Verifica se usuário é PRO antes de permitir acesso
- Se não for PRO: retorna 404
- Se for PRO: remove todos os anúncios do DOM

### 5. Comportamento por Tipo de Conta

#### Usuário FREE:
1. ✅ Vê anúncios Google AdSense
2. ✅ Vê anúncios Monetag  
3. ✅ Vê anúncios internos (AdBanner)
4. ✅ Vê AdPopup antes de criar/entrar em duelos
5. ✅ Acessa rotas normais (`/duels`, `/profile`, etc.)

#### Usuário PRO:
1. ❌ Não vê anúncios Google AdSense
2. ❌ Não vê anúncios Monetag
3. ❌ Não vê anúncios internos
4. ❌ Não vê AdPopup (vai direto para a ação)
5. ✅ Acessa rotas `/pro/*` (404 se tentar acessar sendo FREE)

### 6. Testar

Para testar se anúncios aparecem para FREE:
1. Crie uma conta normal (FREE)
2. Acesse: http://localhost:8080/
3. Você deve ver:
   - Anúncios do Google nas páginas
   - AdPopup ao criar/entrar em duelo

Para testar se anúncios NÃO aparecem para PRO:
1. Mude o account_type para 'pro' no Supabase
2. Faça login novamente
3. Você deve ser redirecionado para `/pro/duels`
4. Você NÃO deve ver nenhum anúncio

### 7. Segurança

- Rotas `/pro/*` retornam 404 para usuários FREE
- Anúncios são removidos do DOM em rotas PRO
- Verificação constante em tempo real
- Se perder PRO, é redirecionado automaticamente
