# 🂡 DuelVerse - Plataforma de Duelos Online Yu-Gi-Oh!

<p align="center">
  <img src="https://img.shields.io/badge/Vite-5.4.19-blue" alt="Vite">
  <img src="https://img.shields.io/badge/React-18.3.1-blue" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.8.3-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Supabase-Realtime-brightgreen" alt="Supabase">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

> Desenvolvido por **Vinícius** - Uma plataforma completa para duelistas de Yu-Gi-Oh! jogarem online com videochamada, torneios e muito mais!

---

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Como Executar](#como-executar)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Contribuição](#contribuição)
- [Licença](#licença)

---

## 🎮 Sobre o Projeto

DuelVerse é uma plataforma completa de duelos online de Yu-Gi-Oh! que permite duelistas de todo o Brasil (e do mundo) jogarem partidas em tempo real com videochamada, sistema de torneios, ranking, loja virtual e muito mais.

O projeto foi desenvolvido com foco em:
- **Experiência em tempo real** - Partidas sincronizadas via Supabase Realtime
- **Videochamada** - Integração com Daily.co para comunicação entre duelistas
- **Sistema completo de torneios** - Torneios semanais e customizados com premiações
- **Economia virtual** - DuelCoins para compras e premiações
- **Interface responsiva** - Funciona em desktop e mobile

---

## ✨ Funcionalidades

### 🗡️ Duelos
- Criar e entrar em salas de duelo
- Videochamada em tempo real (Daily.co)
- Chat durante o duelo
- Calculadora de Life Points (LP) flutuante e arrastável
- Sistema de chamadas de juíz
- Visualizador de deck do oponente
- Timer sincronizado

### 🎯 Matchmaking
- Busca automática de oponentes
- Modos ranqueado e casual
- Fila de espera em tempo real

### 🏆 Torneios
- Torneios customizados (criação livre)
- Torneios semanais com premiação em DuelCoins
- Sistema de rodadas (Swiss)
- Gerenciamento de participantes
- Distribuição automática de premiações

### 🃏 Deck Builder
- Busca de cartas Yu-Gi-Oh!
- Criação e edição de decks
- Reconhecimento de cartas por imagem (IA)
- Deck público e privado

### 👥 Social
- Lista de amigos
- Solicitações de amizade
- Chat privado com amigos
- Chat global
- Status online em tempo real

### 🏅 Sistema de Ranking
- Leaderboard de jogadores
- Pontos por vitórias
- Estatísticas detalhadas

### 💰 DuelCoins
- Moeda virtual do plataforma
- Transferência entre usuários
- Compra de assinaturas Pro
- Histórico de transações

### 👨‍⚖️ Sistema de Juízes
- Painel dejuíz para verificar chamadas
- Registro de decisões

### ⚙️ Administração
- Gerenciamento de usuários
- Criação/edição de notícias
- Gerenciamento de anúncios
- Configurações do sistema

### 💎 Assinatura Pro
- Duelos exclusivos Pro
- Torneios exclusivos
- Remoção de anúncios
- Benefícios exclusivos

---

## 🛠️ Tecnologias

### Frontend
- **React 18** - Framework principal
- **TypeScript** - Tipagem estática
- **Vite** - Build tool
- **React Router v6** - Roteamento
- **TanStack Query** - Gerenciamento de estado servidor
- **Tailwind CSS** - Estilização
- **shadcn/ui** - Componentes UI (Radix UI)
- **Lucide React** - Ícones

### Backend/Services
- **Supabase** - Backend-as-a-Service
  - Autenticação
  - Banco de dados PostgreSQL
  - Realtime subscriptions
  - Edge Functions
- **Daily.co** - Videochamadas

### Ferramentas
- **ESLint** - Linting
- **TypeScript** - Compilação
- **PostgreSQL** - Banco de dados

---

## 📁 Estrutura do Projeto

```
duelverseremote/
├── src/
│   ├── components/
│   │   ├── ui/              # Componentes shadcn/ui
│   │   ├── admin/          # Componentes do painel admin
│   │   ├── deckbuilder/    # Componentes do Deck Builder
│   │   ├── duel/           # Componentes de duelo
│   │   └── ...
│   ├── pages/
│   │   ├── pro/            # Páginas Pro
│   │   └── ...
│   ├── hooks/              # Custom React Hooks
│   ├── integrations/
│   │   └── supabase/       # Cliente e tipos Supabase
│   ├── utils/              # Funções utilitárias
│   ├── types/              # Tipos TypeScript
│   └── layouts/            # Layouts da aplicação
├── supabase/
│   └── functions/          # Edge Functions do Supabase
├── database/               # Migrações do banco
└── public/                 # Arquivos estáticos
```

---

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- npm ou yarn

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/vinicon14/duelverseremote.git
cd duelverseremote
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

5. Acesse em: `http://127.0.0.1:8080`

### Build para Produção
```bash
npm run build
```

### Preview do Build
```bash
npm run preview
```

---

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env` com as seguintes variáveis:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

---

## 🤝 Contribuição

Contribuições são bem-vindas! Sinta-se livre para:

1. Fork o projeto
2. Criar uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abrir um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 📞 Contato

Desenvolvido por **Vinícius**

- GitHub: [vinicon14](https://github.com/vinicon14)
- Plataforma: [DuelVerse](https://duelverse.com.br)

---

<p align="center">
  <strong>🂡 Que os duelistas marquem suas cartas! 🂡</strong>
</p>
