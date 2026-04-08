

## Plano: Correções de Anúncios PRO, Permissões APK, Notificações Nativas e Ícone PWA

### Problema Atual
1. **Anúncios Monetag aparecem para PRO** — O `ConditionalMonetagLoader` bloqueia corretamente, mas o `NoMonetagAds` aplica o mesmo bloqueio para FREE e PRO (ambos usam `enableBlocking()`). Além disso, o `index.html` carrega Google AdSense e AMP Auto Ads incondicionalmente para todos.
2. **APK não pede permissões** — Câmera, microfone e notificações não são solicitados ao iniciar.
3. **Notificações nativas no APK** — Não há ponte Java para disparar notificações nativas do Android.
4. **Ícone PWA incorreto** — Os ícones atuais estão em escala de cinza. A imagem enviada (`channels4_profile.jpg`) é o logo correto (escudo com cartas em fundo preto).

---

### Tarefa 1: Bloqueio Total de Anúncios para PRO

**Arquivos:** `src/components/ConditionalMonetagLoader.tsx`, `src/components/NoMonetagAds.tsx`, `src/components/GoogleAd.tsx`, `src/pages/Home.tsx`, `src/pages/Duels.tsx`

- No `ConditionalMonetagLoader`, adicionar limpeza agressiva do DOM para PRO (remover scripts Monetag, iframes, divs `container-*`, scripts AdSense) com intervalo de 1s
- No `NoMonetagAds`, diferenciar comportamento: PRO faz cleanup completo incluindo Google AdSense scripts; FREE mantém bloqueio apenas de popups
- No `GoogleAd.tsx`, já retorna null para PRO (OK), mas garantir que o script AdSense do `index.html` também seja removido dinamicamente para PRO
- Criar um componente `ProAdCleaner` que roda no App.tsx e remove todos os scripts de ads (AdSense, AMP, Monetag) do `<head>` quando detecta PRO

### Tarefa 2: Permissões no APK (Câmera, Microfone, Notificação)

**Escopo:** Mudanças no código web (detecção via User Agent `DuelVerseApp`)

- Criar componente `NativePermissionPrompt` que aparece logo após o login quando `isNativeApp === true`
- Solicita permissões de câmera (`navigator.mediaDevices.getUserMedia({ video: true, audio: true })`), microfone e notificação (`Notification.requestPermission()`) em sequência
- Exibe dialog modal explicando cada permissão antes de solicitar
- Armazena em `localStorage` que as permissões já foram solicitadas para não repetir

### Tarefa 3: Notificações Nativas no APK

**Escopo:** Ponte JavaScript no web app que utiliza `DuelVerseNative` bridge

- Atualizar `src/hooks/useBrowserNotifications.tsx` para detectar `DuelVerseNative` no window e chamar `window.DuelVerseNative.showNotification(title, body)` quando disponível
- Atualizar `showNotification` para priorizar a ponte nativa sobre a API de Notification do browser
- Isso já funciona se o APK implementar a bridge; o código web vai tentar usar a ponte e fazer fallback para Web Notification API

### Tarefa 4: Ícone PWA Correto

- Copiar `user-uploads://channels4_profile.jpg` para `public/favicon.png` (substituindo o atual em escala de cinza)
- Regenerar todos os ícones PWA (72x72 até 512x512) e maskable icons a partir da nova imagem
- Atualizar `public/apple-touch-icon.png`
- O `vite.config.ts` já referencia os caminhos corretos, não precisa alterar

---

### Detalhes Técnicos

**ProAdCleaner (novo componente no App.tsx):**
```typescript
// Remove ALL ad scripts from DOM for PRO users
// Runs on mount and every 2s to catch dynamic injections
// Targets: adsbygoogle, amp-auto-ads, monetag scripts, container-* divs
```

**NativePermissionPrompt:**
```typescript
// Shows after login on native app (DuelVerseApp UA)
// Step 1: Camera + Mic → getUserMedia({ video: true, audio: true })
// Step 2: Notifications → Notification.requestPermission()
// Stores 'native-permissions-prompted' in localStorage
```

**Notificação nativa bridge:**
```typescript
// In useBrowserNotifications showNotification:
if ((window as any).DuelVerseNative?.showNotification) {
  (window as any).DuelVerseNative.showNotification(title, options?.body || '');
  return;
}
```

