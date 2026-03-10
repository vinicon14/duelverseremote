# Duelverse Native App - Specification

## 1. PWA Functionalities Mapping

Based on the codebase analysis, the following features need to be ported to native:

### Core Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Authentication** | Login/Signup with Supabase (email, social) | Critical |
| **Home Dashboard** | Main screen with navigation | Critical |
| **Tournaments** | Browse, create, join, manage tournaments | Critical |
| **Weekly Tournaments** | Automatic weekly tournaments with prizes | Critical |
| **Duels** | Real-time card game duels (Yu-Gi-Oh style) | Critical |
| **Deck Builder** | Create, save, load card decks | Critical |
| **Card Recognition** | Scan cards using camera | High |
| **Friends** | Add friends, view online status | High |
| **Chat** | Global chat, friend chat, duel chat, tournament chat | High |
| **Matchmaking** | Find opponents for ranked/casual duels | High |
| **Profile** | View/edit profile, avatar upload | High |
| **Store** | In-app purchases, subscriptions | High |
| **Duel Coins** | Virtual currency balance and transactions | High |
| **Ranking** | Leaderboards | Medium |
| **Match Gallery** | View past matches | Medium |
| **Video Share** | Share video during duels | Medium |
| **Admin Panel** | Admin user management | Medium |
| **Judge Panel** | Tournament judging tools | Medium |
| **News** | Game news and updates | Low |

### Technical Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Push Notifications** | Firebase Cloud Messaging | Critical |
| **PWA Install Prompt** | Native install experience | High |
| **Offline Support** | Cache for offline gameplay | Medium |
| **Video Calls** | WebRTC for duel streaming | High |

---

## 2. Recommended Framework

### Option A: React Native with Expo (Recommended)
**Pros:**
- Closest to existing React codebase
- Easy migration of components
- Expo SDK handles notifications, camera, etc.
- Can build for Android, iOS, and web
- Windows support via React Native Windows (or Electron for easier desktop)

**Cons:**
- Some web-specific APIs need adaptation
- May need to rewrite some CSS-heavy components

### Option B: Flutter
**Pros:**
- Excellent performance
- Single codebase for all platforms including Windows
- Great UI components

**Cons:**
- Complete rewrite required (no code reuse)
- Steeper learning curve if team is React-focused
- Different state management approach

### Recommendation
**React Native with Expo** is the best choice because:
1. Existing React code can be partially reused
2. Team already knows React/TypeScript
3. Expo handles most native features out of the box
4. Faster development time

For Windows desktop, we can use **Electron** with the existing React code (easier) or **React Native Windows** (more native).

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Duelverse Native                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Mobile    │  │   Desktop   │  │   Shared Services   │ │
│  │  (Expo)     │  │ (Electron)  │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  ├─────────────────────┤ │
│         │                │         │  • Supabase Client   │ │
│         └────────┬───────┘         │  • Auth Service     │ │
│                  │                 │  • Realtime Subs    │ │
│         ┌────────▼────────┐        │  • Push Notifs      │ │
│         │   WebView/      │        │  • Game Logic       │ │
│         │   React Core    │        │  • State Management │ │
│         └─────────────────┘        └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Roadmap

### Phase 1: Setup & Core (Week 1-2)
- [ ] Initialize React Native project with Expo
- [ ] Set up navigation (React Navigation)
- [ ] Implement Supabase client
- [ ] Create authentication flow

### Phase 2: Main Features (Week 3-5)
- [ ] Home dashboard with navigation
- [ ] Tournament system
- [ ] Duel room with game logic
- [ ] Deck builder
- [ ] Friends and chat system

### Phase 3: Integration (Week 6-7)
- [ ] Push notifications with Firebase
- [ ] Camera integration for card recognition
- [ ] Video/audio calls

### Phase 4: Desktop & Polish (Week 8)
- [ ] Windows build with Electron
- [ ] Performance optimization
- [ ] Testing on devices

---

## 5. Native-Specific Adaptations

### Mobile (Android/iOS)
- Use native navigation patterns (bottom tabs, stack navigation)
- Camera access for card scanning
- Push notifications via Expo Notifications / FCM
- Haptic feedback for game actions
- Keep screen awake during duels

### Desktop (Windows)
- Keyboard shortcuts for game actions
- Window management (minimize, maximize)
- System tray for notifications
- Native file dialogs for deck import/export

---

## 6. Notification System

### Firebase Configuration
- Firebase Cloud Messaging (FCM) for push notifications
- Expo Notifications for easier setup
- Notification types:
  - Duel invites
  - Tournament updates
  - Friend requests
  - Chat messages
  - Match results

---

## 7. Next Steps

1. **Confirm framework choice** (React Native + Expo recommended)
2. **Set up development environment**
3. **Create base project structure**
4. **Start implementing core features**

---

*Document generated for Duelverse Native App development*
*Based on existing PWA codebase analysis*
