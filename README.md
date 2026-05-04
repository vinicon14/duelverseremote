# DuelVerse

> Plataforma global de duelos remotos de TCG ao vivo, com videochamada, economia virtual e torneios estruturados.
>
> 🌐 **Site oficial:** [duelverse.site](https://duelverse.site)
> ✉️ **Contato:** duelverse.app@gmail.com
> 👤 **Criado e mantido por:** Vinícius

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Funcionalidades](#funcionalidades)
3. [Arquitetura](#arquitetura)
4. [Stack Tecnológica Completa](#stack-tecnológica-completa)
5. [Animações e Identidade Visual](#animações-e-identidade-visual)
6. [Guia de Instalação](#guia-de-instalação)
7. [Scripts Disponíveis](#scripts-disponíveis)
8. [Estrutura de Pastas](#estrutura-de-pastas)
9. [Empacotamento Multi-Plataforma](#empacotamento-multi-plataforma)
10. [Banco de Dados e Backend](#banco-de-dados-e-backend)
11. [Boas Práticas Adotadas](#boas-práticas-adotadas)
12. [Contribuindo](#contribuindo)
13. [Roadmap](#roadmap)
14. [Licença e Contato](#licença-e-contato)

---

## Visão Geral

O **DuelVerse** nasceu da insatisfação com simuladores tradicionais: eles funcionam, mas tiram o que torna o TCG presencial inesquecível — o adversário do outro lado da mesa.

A proposta é simples: você joga **com cartas físicas**, em videochamada com seu oponente, dentro de um ambiente que cuida do resto — pontos de vida, timer, deck virtual de apoio, ranking, economia, torneios e premiações.

Três pilares norteiam cada decisão de produto:

| Pilar         | O que significa na prática                                                       |
|---------------|----------------------------------------------------------------------------------|
| **Presença**  | Câmera e voz em primeiro plano. O cenário digital nunca rouba o foco do duelo.   |
| **Progresso** | Cada partida vale algo: XP, DuelCoins, ranking sazonal e itens cosméticos.       |
| **Comunidade**| Torneios semanais, chat global, sistema de juízes e amigos online.               |

Atualmente o DuelVerse atende três perfis de jogo:
- **YGO Advanced** — formato competitivo principal
- **Rush Duel** — formato dinâmico/casual
- **Genesis** — formato lendário com regras próprias

---

## Funcionalidades

### Para o Duelista
- Matchmaking ranqueado e casual com pareamento por TCG ativo
- Sala de duelo com videochamada **WebRTC peer-to-peer** (servidores TURN OpenRelay como fallback)
- Calculadora de LP flutuante, timer compartilhado e chat de partida
- Construtor de decks com importação de listas, busca por arquétipo e reconhecimento de cartas por IA (Gemini)
- Gravação da partida (MediaRecorder) com galeria pessoal e modo público/privado
- Equipamentos cosméticos: sleeves e playmats persistidos por usuário

### Para a Comunidade
- **Torneios Suíços + Top 4** com inscrição por DuelCoins e premiação automática
- **Torneios Semanais** com taxa de inscrição e prize pool acumulado
- Chat global com menções, moderação e push notifications
- Sistema de **juízes** com chamada via call e recompensas por atendimento
- Ranking isolado por TCG e leaderboard global

### Para o Organizador / Admin
- Dashboard administrativo (`/admin`) com gestão de usuários, torneios, marketplace e conteúdo
- Aprovação de produtos do marketplace e curadoria de notícias
- Distribuição de DuelCoins e gestão de pacotes pagos
- Configuração de itens digitais (sleeves, playmats, ringtones)
- Painel Discord para sincronização da comunidade

### Plataforma
- **PWA instalável** (Android/iOS/Desktop) com manifesto completo
- **App Android nativo** via Capacitor (assinaturas V1/V2/V3)
- **Versão Desktop** via Electron com instalador NSIS para Windows
- Internacionalização em **16 idiomas** com detecção por geolocalização
- Modo escuro nativo, animações suaves e acessibilidade

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTES                            │
│  PWA Web │ Android (Capacitor) │ Desktop (Electron)     │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS / WSS
┌────────────────────▼────────────────────────────────────┐
│              FRONTEND (Vite + React 18)                 │
│  • TanStack Query (cache de dados)                      │
│  • React Router (SPA)                                   │
│  • i18next (16 idiomas)                                 │
│  • Tailwind + Design Tokens HSL                         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              BACKEND (Supabase)                         │
│  • PostgreSQL com RLS em todas as tabelas               │
│  • Auth (email + OAuth)                                 │
│  • Realtime (presença, chat, duelos)                    │
│  • Storage (decks, gravações, marketplace)              │
│  • Edge Functions (Deno) — lógica atômica e webhooks    │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│          INTEGRAÇÕES EXTERNAS                           │
│  WebRTC P2P │ MercadoPago │ Stripe │ Discord Bot (Java) │
│  Gemini AI  │ MailerSend  │ Push (VAPID) │ OpenRelay TURN│
└─────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológica Completa

### Frontend Core
| Tecnologia          | Versão   | Função                                              |
|---------------------|----------|-----------------------------------------------------|
| React               | 18.3     | Biblioteca de UI declarativa                        |
| TypeScript          | 5.8      | Tipagem estática                                    |
| Vite                | 5.4      | Build tool + dev server (SWC)                       |
| React Router        | 6.x      | Roteamento SPA                                      |
| TanStack Query      | 5.83     | Cache e sincronização de dados do servidor          |

### Estilo e UI
| Tecnologia          | Versão   | Função                                              |
|---------------------|----------|-----------------------------------------------------|
| Tailwind CSS        | 3.4      | Utility-first styling com tokens HSL                |
| Radix UI / shadcn   | latest   | Componentes acessíveis sem opinião visual           |
| Lucide React        | 0.462    | Ícones SVG consistentes                             |
| Sonner              | 1.7      | Sistema de toasts                                   |
| Framer Motion       | latest   | Animações declarativas em componentes específicos   |
| Embla Carousel      | 8.6      | Carrosséis touch-friendly                           |
| Recharts            | 2.15     | Gráficos para dashboards                            |

### Formulários, Estado, Internacionalização
| Tecnologia          | Versão   | Função                                              |
|---------------------|----------|-----------------------------------------------------|
| React Hook Form     | 7.61     | Formulários performáticos                           |
| Zod                 | 3.25     | Validação schema-first                              |
| i18next             | 26.0     | i18n com 16 locales                                 |
| date-fns            | 3.6      | Manipulação de datas                                |

### Backend e Infraestrutura
| Tecnologia          | Função                                                          |
|---------------------|-----------------------------------------------------------------|
| Supabase            | BaaS — Postgres + Auth + Realtime + Storage + Edge Functions    |
| PostgreSQL          | Banco relacional com RLS em todas as tabelas                    |
| Edge Functions Deno | Lógica server-side (cobranças, webhooks, push, IA)              |
| Vault               | Armazenamento seguro de secrets                                 |

### Comunicação em Tempo Real
| Tecnologia              | Função                                                       |
|-------------------------|--------------------------------------------------------------|
| WebRTC (nativo)         | Vídeo P2P na sala de duelo                                   |
| OpenRelay TURN          | Fallback NAT traversal                                       |
| Supabase Realtime       | Presença, chat global, sincronização de duelos               |
| Web Push (VAPID)        | Notificações push em PWA                                     |

### Inteligência Artificial
| Tecnologia              | Função                                                       |
|-------------------------|--------------------------------------------------------------|
| Gemini 2.5 Flash        | Reconhecimento de cartas via foto da decklist                |

### Pagamentos
| Tecnologia              | Função                                                       |
|-------------------------|--------------------------------------------------------------|
| MercadoPago             | Checkout PIX/cartão para o mercado brasileiro                |
| Stripe                  | Checkout internacional                                       |
| CartPanda               | Webhook de assinaturas legado                                |

### Empacotamento Multi-Plataforma
| Tecnologia          | Versão   | Plataforma alvo                                     |
|---------------------|----------|-----------------------------------------------------|
| Capacitor           | 8.2      | Android nativo                                      |
| Electron            | 41.1     | Desktop (Windows/macOS/Linux)                       |
| vite-plugin-pwa     | latest   | Service Worker + manifest                           |
| Workbox             | 7.x      | Estratégias de cache do SW                          |

### Bot Discord (módulo separado)
| Tecnologia          | Função                                                          |
|---------------------|-----------------------------------------------------------------|
| Java 17 + Gradle    | Bot oficial DuelVerse                                           |
| JDA                 | Cliente Discord                                                 |

### Qualidade e Tooling
| Tecnologia          | Função                                                          |
|---------------------|-----------------------------------------------------------------|
| ESLint 9            | Linting                                                         |
| Vitest / Playwright | Testes unitários e E2E                                          |
| Biome               | Formatação alternativa                                          |

---

## Animações e Identidade Visual

A identidade visual do DuelVerse é construída em camadas — nenhuma animação é gratuita, todas reforçam a sensação de "estar em um duelo".

### Sistema de Tokens
Toda a paleta vive em `src/index.css` como variáveis HSL semânticas:
```css
:root {
  --background: 240 10% 4%;
  --primary: 270 80% 55%;
  --primary-glow: 270 90% 70%;
  --gradient-mystic: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%);
  --shadow-mystic: 0 10px 40px -10px hsl(var(--primary) / 0.5);
}
```
Quando o usuário troca de TCG, o componente `<DynamicTheme />` reescreve essas variáveis em `:root` — toda a UI reage sem remontar componentes.

### Catálogo de Animações
| Classe / animação        | Onde aparece                                            |
|--------------------------|---------------------------------------------------------|
| `animate-fade-in-up`     | Cards de matchmaking, dashboard, listagens              |
| `animate-card-fall-0..4` | Loader unificado entre páginas                          |
| `page-flip-left/right`   | Transição entre rotas (efeito de virada de carta)       |
| `animate-pulse` + `glow` | CTAs primários e elementos em destaque                  |
| `hover-scale`            | Cards interativos                                       |
| `story-link`             | Underline animado em links inline                       |
| Stagger reveal           | Listas e grids com `delay-100..500`                     |

### Otimizações
- `prefers-reduced-motion`: respeitado globalmente
- Apenas `transform` e `opacity` para garantir aceleração de GPU
- `will-change` aplicado seletivamente em elementos animados frequentemente
- Loader unificado de página (`UnifiedPageLoader`) com fade controlado em 450ms

---

## Guia de Instalação

### Pré-requisitos
- **Node.js** ≥ 18
- **npm** ≥ 9 (ou pnpm/yarn)
- **Git**
- (Opcional) Android Studio para builds Android
- (Opcional) JDK 17 para o bot Discord

### 1. Clonar o repositório
```bash
git clone https://github.com/vinicon14/duelverseremote.git
cd duelverseremote
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Variáveis de ambiente
Crie um `.env` na raiz baseado em `.env.example`:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_publica_anon
VITE_SUPABASE_PROJECT_ID=seu_project_id
```

> ⚠️ Nunca versione o `.env`. Chaves anônimas do Supabase são públicas por design (RLS protege os dados), mas trate qualquer outro segredo com cuidado.

### 4. Rodar em desenvolvimento
```bash
npm run dev
```
Acesse http://localhost:8080.

### 5. Build de produção
```bash
npm run build
npm run preview   # serve o build localmente
```

---

## Scripts Disponíveis

| Script                      | Descrição                                                |
|-----------------------------|----------------------------------------------------------|
| `npm run dev`               | Servidor de desenvolvimento com HMR                      |
| `npm run build`             | Build otimizado para produção em `dist/`                 |
| `npm run preview`           | Serve o build localmente                                 |
| `npm run lint`              | Roda ESLint em todo o projeto                            |
| `npm run package:win`       | Empacota app desktop para Windows (Electron)             |
| `npm run installer:win`     | Gera instalador `.exe` via NSIS                          |
| `npx cap sync android`      | Sincroniza assets para o projeto Android                 |
| `npx cap open android`      | Abre Android Studio com o projeto                        |

---

## Estrutura de Pastas

```
duelverseremote/
├── src/
│   ├── components/        # Componentes React reutilizáveis (UI, duelo, admin)
│   ├── pages/             # Rotas top-level (Home, DuelRoom, Auth, Admin...)
│   ├── hooks/             # Custom hooks (useTcg, useDuelDeck, useAdmin...)
│   ├── contexts/          # Providers globais (TcgContext)
│   ├── integrations/      # Cliente Supabase (auto-gerado)
│   ├── i18n/              # Traduções e detecção de locale
│   ├── utils/             # Helpers puros (sfx, push, plataforma)
│   └── data/              # Dados estáticos (genesys points, etc.)
├── supabase/
│   ├── functions/         # Edge Functions (Deno)
│   ├── config.toml        # Configuração do projeto Supabase
│   └── migrations/        # Histórico SQL versionado
├── android/               # Projeto Android nativo (Capacitor)
├── electron/              # Entry points do app desktop
├── public/                # Assets estáticos servidos como-está
└── database/              # SQL utilitários e resets
```

---

## Empacotamento Multi-Plataforma

### PWA (padrão)
Já vem configurado em `vite.config.ts` via `vite-plugin-pwa`. Após `npm run build`, o app fica instalável em qualquer navegador moderno.

### Android
```bash
npm run build
npx cap sync android
npx cap open android
# build no Android Studio (Generate Signed Bundle/APK)
```
Use sempre assinaturas **V1 + V2 + V3** ao publicar na Play Store.

### Desktop (Windows)
```bash
npm run package:win     # gera pasta empacotada
npm run installer:win   # gera .exe instalador (NSIS)
```

---

## Banco de Dados e Backend

- Toda tabela em `public` tem **RLS habilitado** — leitura/escrita só com auth válida.
- Roles ficam em uma tabela `user_roles` separada (`admin`, `judge`, `pro`...) com função `has_role()` `SECURITY DEFINER` para evitar recursão.
- Operações financeiras (DuelCoins, torneios) acontecem em **funções RPC atômicas** que registram em ledger.
- Webhooks de pagamento (MercadoPago/Stripe) são edge functions com `verify_jwt = false`.
- Notificações push usam VAPID + service worker (`public/push-sw.js`).

---

## Boas Práticas Adotadas

- ✅ Nenhuma cor hard-coded em componentes — apenas tokens semânticos
- ✅ Nenhum dado sensível no client — RLS + edge functions cobrem tudo
- ✅ Single TCG Policy: um perfil por conta, isolamento estrito de dados
- ✅ Lazy loading de todas as rotas para reduzir bundle inicial
- ✅ Internacionalização completa em 16 idiomas
- ✅ Acessibilidade: respeitamos `prefers-reduced-motion`, semântica HTML5
- ✅ SEO: meta tags multilíngues, JSON-LD, sitemap, hreflang completo

---

## Contribuindo

Sugestões e relatos de bug são bem-vindos via Issues do GitHub. Para PRs:
1. Abra uma issue antes para alinhar escopo
2. Mantenha o estilo do design system (tokens HSL, sem cores cruas)
3. Inclua testes quando alterar lógica crítica de duelo/economia
4. Descreva o problema e a solução com clareza no PR

---

## Roadmap

| Horizonte         | Foco                                                                |
|-------------------|---------------------------------------------------------------------|
| Curto (3-6 meses) | Estabilidade da experiência core, redução de fricção para iniciantes|
| Médio (6-12 meses)| Novos formatos, modo espectador avançado, integração com lojas      |
| Longo (1+ ano)    | Ecossistema integrado: criadores, lojas físicas, NFTs colecionáveis |

---

## Licença e Contato

**Projeto:** DuelVerse
**Autor:** Vinícius
**Email oficial:** duelverse.app@gmail.com
**Site:** [duelverse.site](https://duelverse.site)

> *"Construído por um duelista, para duelistas. Cada decisão de produto passa primeiro pela mesa de jogo."*

*Última atualização: Maio de 2026*
