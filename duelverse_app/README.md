# Duelverse Native App (Flutter)

App nativo do Duelverse para Android, iOS e Windows, construído com Flutter.

## Pré-requisitos

1. **Flutter SDK** >= 3.2.0
   - [Instalar Flutter](https://docs.flutter.dev/get-started/install)
2. **Android Studio** (para Android)
3. **Xcode** (para iOS, apenas macOS)
4. **Visual Studio** com C++ desktop workload (para Windows)

## Setup

```bash
# Instalar dependências
cd duelverse_app
flutter pub get

# Rodar no Android
flutter run -d android

# Rodar no iOS
flutter run -d ios

# Rodar no Windows
flutter run -d windows

# Build APK
flutter build apk --release

# Build iOS
flutter build ios --release

# Build Windows
flutter build windows --release
```

## Estrutura do Projeto

```
lib/
├── main.dart                    # Entry point
├── app.dart                     # MaterialApp configuration
├── core/
│   ├── config/
│   │   └── env_config.dart      # Environment variables
│   ├── router/
│   │   └── app_router.dart      # GoRouter navigation
│   ├── services/
│   │   ├── notification_service.dart  # Push notifications
│   │   └── supabase_service.dart      # Supabase client
│   └── theme/
│       └── app_theme.dart       # Dark theme (mystic design)
├── features/
│   ├── auth/                    # Login/Signup
│   ├── home/                    # Dashboard
│   ├── tournaments/             # Tournament system
│   ├── duels/                   # Duel rooms & game logic
│   ├── deck_builder/            # Card deck builder
│   ├── friends/                 # Friends list
│   ├── profile/                 # User profile
│   ├── store/                   # In-app store
│   ├── ranking/                 # Leaderboards
│   ├── chat/                    # Global & friend chat
│   └── duel_coins/              # Virtual currency
└── shared/
    └── widgets/
        └── main_scaffold.dart   # Bottom navigation
```

## Tecnologias

- **Flutter** - Framework UI multiplataforma
- **Supabase** - Backend (auth, database, realtime, storage)
- **Riverpod** - State management
- **GoRouter** - Navigation
- **Firebase** - Push notifications (FCM)
- **WebRTC** - Video calls during duels

## Backend

O app usa o mesmo backend Supabase do PWA existente. Todas as tabelas, funções RPC e Edge Functions são compartilhadas.

## Configuração Firebase

1. Criar projeto no [Firebase Console](https://console.firebase.google.com)
2. Adicionar apps Android e iOS
3. Baixar `google-services.json` (Android) e `GoogleService-Info.plist` (iOS)
4. Colocar nos diretórios `android/app/` e `ios/Runner/` respectivamente
5. Descomentar o código Firebase em `notification_service.dart`

## Próximos Passos

- [ ] Instalar Flutter SDK
- [ ] Rodar `flutter create .` para gerar arquivos de plataforma
- [ ] Configurar Firebase
- [ ] Implementar funcionalidades completas de cada feature
- [ ] Testes em dispositivos reais
- [ ] Publicar na Play Store e App Store
