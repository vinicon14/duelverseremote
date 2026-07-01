# 🎮 Duelverse — Guia Completo Google Play Store

Este guia contém **todo** o processo para publicar o Duelverse na Google Play Store, incluindo geração do arquivo **AAB** (Android App Bundle), assinatura, upload e configuração da ficha da loja.

> ⚠️ **Importante:** o arquivo `.aab` **não pode ser gerado dentro do sandbox da Lovable** (falta Android SDK + JDK 21 + keystore). Ele precisa ser gerado localmente na sua máquina com Android Studio ou via linha de comando. Todos os arquivos de configuração já estão prontos neste repositório.

---

## 📋 Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Baixar o projeto](#2-baixar-o-projeto)
3. [Gerar a keystore de assinatura](#3-gerar-a-keystore-de-assinatura)
4. [Configurar a assinatura](#4-configurar-a-assinatura)
5. [Build do AAB](#5-build-do-aab)
6. [Criar conta na Play Console](#6-criar-conta-na-play-console)
7. [Criar o app na Play Console](#7-criar-o-app-na-play-console)
8. [Ficha da loja (Store Listing)](#8-ficha-da-loja-store-listing)
9. [Classificação, público e conteúdo](#9-classificação-público-e-conteúdo)
10. [Política de privacidade e permissões](#10-política-de-privacidade-e-permissões)
11. [Upload do AAB e release](#11-upload-do-aab-e-release)
12. [Checklist final](#12-checklist-final-antes-de-enviar)

---

## 1. Pré-requisitos

Instale na sua máquina (Windows, Mac ou Linux):

| Ferramenta | Versão | Link |
|---|---|---|
| **Node.js** | 20+ | https://nodejs.org |
| **JDK** | **21** (obrigatório) | https://adoptium.net |
| **Android Studio** | Latest (Hedgehog+) | https://developer.android.com/studio |
| **Android SDK** | API 34 + 36 | via Android Studio SDK Manager |

Verifique após instalar:
```bash
node -v      # v20+
java -version # 21
```

Defina `JAVA_HOME` e `ANDROID_HOME` nas variáveis de ambiente.

---

## 2. Baixar o projeto

Faça o push do projeto para o seu GitHub via botão **GitHub** no topo do Lovable e clone:

```bash
git clone https://github.com/SEU_USUARIO/duelverse.git
cd duelverse
npm install
npm run build            # gera a pasta dist/
npx cap sync android     # sincroniza a build web com o projeto Android
```

---

## 3. Gerar a keystore de assinatura

**ATENÇÃO:** essa keystore é **única e insubstituível**. Se você perder, nunca mais conseguirá atualizar o app na Play Store. **Faça backup em pelo menos 2 lugares (nuvem + pen drive).**

Na pasta `android/app/`:

```bash
keytool -genkey -v \
  -keystore duelverse-release.keystore \
  -alias duelverse \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Responda:
- **Senha da keystore:** (guarde!)
- **Nome:** Duelverse
- **Unidade organizacional:** Duelverse
- **Organização:** Duelverse
- **Cidade / Estado / País (BR)**
- **Senha do alias:** (pode ser a mesma)

Arquivo gerado: `android/app/duelverse-release.keystore`

---

## 4. Configurar a assinatura

Crie o arquivo `android/keystore.properties` (já está no `.gitignore` — **nunca comite**):

```properties
storeFile=duelverse-release.keystore
storePassword=SUA_SENHA_DA_KEYSTORE
keyAlias=duelverse
keyPassword=SUA_SENHA_DO_ALIAS
```

O `android/app/build.gradle` já está configurado para ler esse arquivo automaticamente (veja seção `signingConfigs`).

---

## 5. Build do AAB

### Opção A — Linha de comando (recomendado)

```bash
cd android
./gradlew bundleRelease         # Linux/Mac
gradlew.bat bundleRelease       # Windows
```

Arquivo gerado:
```
android/app/build/outputs/bundle/release/app-release.aab
```

### Opção B — Android Studio

1. Abra `android/` no Android Studio
2. Menu **Build → Generate Signed Bundle / APK**
3. Escolha **Android App Bundle**
4. Selecione a keystore criada e as senhas
5. Escolha **release** e clique em **Finish**

---

## 6. Criar conta na Play Console

1. Acesse https://play.google.com/console
2. Pague a taxa única de **US$ 25** (obrigatória, vitalícia)
3. Complete a verificação de identidade (documento + selfie) — pode levar até 48h
4. Se for conta de organização, adicione dados fiscais (CNPJ)

---

## 7. Criar o app na Play Console

Menu lateral → **Criar app**:

- **Nome do app:** Duelverse
- **Idioma padrão:** Português (Brasil) – pt-BR
- **App ou jogo:** **Jogo**
- **Gratuito ou pago:** Gratuito
- Aceite as declarações de política e leis de exportação

---

## 8. Ficha da loja (Store Listing)

Todo o texto pronto (PT + EN) está no arquivo [`PLAY_STORE_LISTING.md`](./PLAY_STORE_LISTING.md).

### Recursos gráficos obrigatórios

| Item | Especificação | Onde está |
|---|---|---|
| Ícone | 512x512 PNG 32-bit | `android/app/src/main/res/mipmap-*` (extraia o hdpi 512) |
| Banner (feature graphic) | 1024x500 PNG/JPG | **precisa criar** — use os promo videos como base |
| Screenshots celular | 2–8 imagens, min 320px, ratio 16:9 ou 9:16 | Capture do app rodando |
| Vídeo promocional (opcional) | YouTube URL | Já temos 5 em `/mnt/documents/duelverse-promo-*.mp4` — suba no YouTube |

**Dica de screenshots:** capture pelo menos:
1. Tela inicial (Home)
2. Sala de duelo com videochamada
3. Deck Builder
4. Torneios
5. Ranking
6. Marketplace

---

## 9. Classificação, público e conteúdo

Play Console → **Classificação de conteúdo** → responda o questionário IARC:

- **Categoria:** Jogo — Cartas / Estratégia
- **Violência:** Não
- **Conteúdo sexual:** Não
- **Linguagem imprópria:** Não (chat moderado)
- **Substâncias controladas:** Não
- **Jogos de azar simulados:** Não
- **Interação de usuários:** **Sim** (chat, videochamada, marketplace)
- **Compartilha localização:** Não
- **Compras digitais:** **Sim** (DuelCoins, PRO)

**Público-alvo:** 13+ (ideal para TCG)

**Categoria da Play Store:** Jogos → Cartas

---

## 10. Política de privacidade e permissões

### Política de privacidade

**Obrigatória.** Arquivo pronto em [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md).

Hospede em: `https://duelverse.site/privacy` (crie a página no app ou hospede o markdown convertido para HTML).

### Justificativa de permissões sensíveis

O `AndroidManifest.xml` já declara. Justifique na Play Console:

| Permissão | Justificativa |
|---|---|
| `CAMERA` | Videochamada durante duelos remotos ao vivo |
| `RECORD_AUDIO` | Áudio da videochamada e chat de voz |
| `POST_NOTIFICATIONS` | Convites de duelo, torneios, mensagens |
| `FOREGROUND_SERVICE` | Manter conexão WebRTC ativa durante duelos |
| `USE_FULL_SCREEN_INTENT` | Notificação de chamada de duelo (estilo WhatsApp) |
| `SYSTEM_ALERT_WINDOW` | Overlay de chamada recebida |

### Segurança de dados (Data Safety)

Play Console → **Segurança de dados** → declare:

- **Coleta:** email, nome, foto de perfil, país
- **Compartilha com terceiros:** Não (apenas Supabase = backend próprio)
- **Criptografia em trânsito:** Sim (HTTPS/TLS)
- **Usuário pode pedir exclusão:** Sim (via app: Perfil → Configurações → Excluir conta)

---

## 11. Upload do AAB e release

1. Play Console → **Produção** (ou **Testes fechados** primeiro para validar)
2. **Criar nova versão**
3. **Fazer upload** → selecione `app-release.aab`
4. Preencha **Notas da versão** (use `CHANGELOG.md` como referência):

```
🎉 Duelverse 1.8.4
• Novo sistema de torneios semanais com premiação
• Melhorias no Deck Builder (Yu-Gi-Oh, Magic e Pokémon)
• Correções de estabilidade na videochamada
• Otimização de bateria em duelos longos
```

5. Clique em **Revisar versão** → **Iniciar lançamento na produção**

⏱ **Tempo de análise:** 1 a 7 dias na primeira submissão. Atualizações costumam sair em 24h.

---

## 12. Checklist final antes de enviar

- [ ] Keystore com backup em 2 locais
- [ ] `keystore.properties` preenchido e **fora do git**
- [ ] AAB gerado e testado via `bundletool` ou instalado por Internal Testing
- [ ] Ícone 512x512 sem transparência
- [ ] Feature graphic 1024x500
- [ ] Mínimo 2 screenshots (recomendo 6)
- [ ] Descrição curta (80 chars) e completa (4000 chars)
- [ ] Política de privacidade hospedada em URL pública
- [ ] Segurança de dados preenchida
- [ ] Classificação de conteúdo concluída
- [ ] Público-alvo definido (13+)
- [ ] Categoria: Jogos → Cartas
- [ ] versionCode incrementado (atual: **184**)
- [ ] versionName correto (atual: **1.8.4**)

---

## 🆘 Problemas comuns

**"Você fez upload de um APK ou Android App Bundle que não foi assinado"**
→ Sua `keystore.properties` não está sendo lida. Confira o caminho.

**"Este APK não é compatível com nenhum dispositivo"**
→ Verifique `minSdkVersion 24` no `variables.gradle`.

**"Você precisa usar uma versão diferente"**
→ Incremente `versionCode` no `android/app/build.gradle`.

**AAB muito grande (>150MB)**
→ Ative `minifyEnabled true` e `shrinkResources true` no `build.gradle`.

---

## 📞 Suporte

- Documentação oficial: https://support.google.com/googleplay/android-developer
- Capacitor + Android: https://capacitorjs.com/docs/android
