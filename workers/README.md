# 🛡️ Duelverse Ad Blocker - Cloudflare Worker

Este Worker do Cloudflare bloqueia anúncios no nível de edge para usuários Pro.

## 🚀 Como Deployar

### 1. Instale o Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Faça Login no Cloudflare

```bash
wrangler login
```

### 3. Configure o Worker

Edite `wrangler.toml` e adicione suas rotas:

```toml
[[routes]]
pattern = "duelverse.site/*"
zone_name = "duelverse.site"
```

### 4. Deploy

```bash
cd workers
npm install
wrangler deploy --env production
```

## 🔧 Configuração

### Bloquear Domínios Específicos

Edite `worker.js` e modifique o array `adDomains`:

```javascript
const adDomains = [
  'monetag.com',
  'momntx.com',
  'mts.ru',
  'quge5.com',
  'googlesyndication.com',
  // Adicione mais domínios aqui
];
```

## 🌍 Configuração no Cloudflare Dashboard

Se preferir configurar pelo dashboard:

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Vá em **Workers & Pages** > **Create** > **Deploy**
3. Cole o código de `worker.js`
4. Configure as rotas em **Triggers** > **Routes**

## 🔄 Atualização de Rotas

Para adicionar o domínio principal:

1. Vá em **Workers & Pages** > **duelverse-ads-blocker**
2. Clique em **Triggers** > **Routes**
3. Adicione: `duelverse.site/*`
4. Configure como: `duelverse.site/*` (com wildcard)

## 📋 O que o Worker Faz

1. **Bloqueio no Edge**: Intercepta requisições para domínios de anúncios
2. **Injeção de Script**: Adiciona script de bloqueio ao HTML para usuários Pro
3. **Headers de Segurança**: Adiciona X-Content-Type-Options, X-Frame-Options

## ⚠️ Notas

- O worker só bloqueia requisições HTTP(S)
- Alguns scripts podem já estar em cache do navegador
- Usuários devem limpar cache se os anúncios persistirem
- Monitore em **Workers** > **duelverse-ads-blocker** > **Logs**

## 🧪 Testes

```bash
wrangler dev
# Acesse http://localhost:8787
```

---

Para dúvidas, consulte a [Documentação do Cloudflare Workers](https://developers.cloudflare.com/workers/)
