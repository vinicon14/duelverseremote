/**
 * DuelVerse - Plataforma de Duelos Online Yu-Gi-Oh!
 * Desenvolvido por Vinícius
 * 
 * Este é o arquivo principal da aplicação React.
 * Configura o roteamento, providers globais e listeners de autenticação.
 */
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConditionalMonetagLoader } from "@/components/ConditionalMonetagLoader";
import { UniversalNewTabBlocker } from "@/components/UniversalNewTabBlocker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from '@supabase/supabase-js';
import { DuelCallNotification } from "@/components/DuelCallNotification";
import { useDuelInviteResponse } from "@/hooks/useDuelInviteResponse";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { DynamicTheme } from "@/components/DynamicTheme";
import { ProAdCleaner } from "@/components/ProAdCleaner";
import { NativePermissionPrompt } from "@/components/NativePermissionPrompt";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { PageNavigationArrows } from "@/components/PageNavigationArrows";
import { UnifiedPageLoader } from "@/components/UnifiedPageLoader";
import { BackgroundMusic } from "@/components/BackgroundMusic";

import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSubscriptionExpirationCheck } from "@/hooks/useSubscriptionExpirationCheck";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";
import { isRunningInsideDiscord } from "@/hooks/useDiscordActivity";
import { TcgProvider, normalizeTcgType, useTcg } from "./contexts/TcgContext";
const Home = lazy(() => import("./pages/Home"));
const Landing = lazy(() => import("./pages/Landing"));
const Admin = lazy(() => import("./pages/Admin"));
const Auth = lazy(() => import("./pages/Auth"));
const Duels = lazy(() => import("./pages/Duels"));
const DuelRoom = lazy(() => import("./pages/DuelRoom"));
const JoinDuel = lazy(() => import("./pages/JoinDuel"));
const MatchInvite = lazy(() => import("./pages/MatchInvite"));
const Profile = lazy(() => import("./pages/Profile"));
const Ranking = lazy(() => import("./pages/Ranking"));
const Friends = lazy(() => import("./pages/Friends"));
const Tournaments = lazy(() => import("./pages/Tournaments"));
const CreateTournament = lazy(() => import("./pages/CreateTournament"));
const TournamentDetail = lazy(() => import("./pages/TournamentDetail"));
const Matchmaking = lazy(() => import("./pages/Matchmaking"));
const Store = lazy(() => import("./pages/Store"));
const DuelCoins = lazy(() => import("./pages/DuelCoins"));
const JudgePanel = lazy(() => import("./pages/JudgePanel"));
const FriendChat = lazy(() => import("./pages/FriendChat"));
const MatchGallery = lazy(() => import("./pages/MatchGallery"));
const VideoShare = lazy(() => import("./pages/VideoShare"));
const News = lazy(() => import("./pages/News"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const DiscordActivity = lazy(() => import("./pages/DiscordActivity"));
const NotFound = lazy(() => import("./pages/NotFound"));

const DeckBuilder = lazy(() => import("./pages/DeckBuilder"));
const GenesisDeckBuilder = lazy(() => import("./pages/GenesisDeckBuilder"));
const RushDuelDeckBuilder = lazy(() => import("./pages/RushDuelDeckBuilder"));
const ProfileSelect = lazy(() => import("./pages/ProfileSelect"));
const CreateWeeklyTournament = lazy(() => import("./pages/CreateWeeklyTournament"));
const WeeklyTournaments = lazy(() => import("./pages/WeeklyTournaments"));
const MyTournaments = lazy(() => import("./pages/MyTournaments"));
const TournamentManager = lazy(() => import("./pages/TournamentManager"));
const TransferHistory = lazy(() => import("./pages/TransferHistory"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MyItems = lazy(() => import("./pages/MyItems"));
const BuyDuelCoins = lazy(() => import("./pages/BuyDuelCoins"));
const ProHome = lazy(() => import("./pages/pro/ProHome"));
const ProDuels = lazy(() => import("./pages/pro/ProDuels"));
const ProTournaments = lazy(() => import("./pages/pro/ProTournaments"));
import { ProRouteGuard } from "./components/ProRouteGuard";

const queryClient = new QueryClient();

// Componente que redireciona baseado no estado de autenticação
const HomePage = ({ user }: { user: User | null }) => {
  if (user) return <Home />;
  return <Landing />;
};

// Componente que resolve automaticamente o deck builder com base no TCG ativo
const ActiveDeckBuilderRoute = () => {
  const { activeTcg } = useTcg();
  if (activeTcg === "genesis") return <GenesisDeckBuilder />;
  if (activeTcg === "rush_duel") return <RushDuelDeckBuilder />;
  return <DeckBuilder />;
};

// Componente interno que fica dentro do Router para usar useNavigate
const RouterContent = ({ user }: { user: User | null }) => {
  return (
    <Suspense fallback={
      <div className="flex-1 w-full flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <Routes>
        <Route path="/" element={<HomePage user={user} />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/duels" element={<Duels />} />
        <Route path="/duel/:id" element={<DuelRoom />} />
        <Route path="/join/:duelId" element={<JoinDuel />} />
        <Route path="/m/:inviteId" element={<MatchInvite />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:userId" element={<Profile />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/chat/:friendId" element={<FriendChat />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/create-tournament" element={<CreateTournament />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/matchmaking" element={<Matchmaking />} />
        <Route path="/duelcoins" element={<DuelCoins />} />
        <Route path="/judge-panel" element={<JudgePanel />} />
        <Route path="/store" element={<Store />} />
        <Route path="/news" element={<News />} />
        <Route path="/gallery" element={<MatchGallery />} />
        <Route path="/video/:id" element={<VideoShare />} />
        
        <Route path="/deck-builder" element={<ActiveDeckBuilderRoute />} />
        <Route path="/genesis" element={<GenesisDeckBuilder />} />
        <Route path="/rush-duel" element={<RushDuelDeckBuilder />} />
        <Route path="/advanced" element={<DeckBuilder />} />
        <Route path="/profile-select" element={<ProfileSelect />} />
        <Route path="/weekly-tournaments" element={<WeeklyTournaments />} />
        <Route path="/create-weekly-tournament" element={<CreateWeeklyTournament />} />
        <Route path="/my-tournaments" element={<MyTournaments />} />
        <Route path="/tournament-manager" element={<TournamentManager />} />
        <Route path="/transfer-history" element={<TransferHistory />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/my-items" element={<MyItems />} />
        <Route path="/buy-duelcoins" element={<BuyDuelCoins />} />
        <Route path="/install-app" element={<InstallApp />} />
        <Route path="/discord-activity" element={<DiscordActivity />} />

        {/* PRO routes - guarded; reuse standard pages so they always work */}
        <Route path="/pro/home" element={<ProRouteGuard><ProHome /></ProRouteGuard>} />
        <Route path="/pro/matchmaking" element={<ProRouteGuard><Matchmaking /></ProRouteGuard>} />
        <Route path="/pro/duels" element={<ProRouteGuard><ProDuels /></ProRouteGuard>} />
        <Route path="/pro/tournaments" element={<ProRouteGuard><ProTournaments /></ProRouteGuard>} />
        <Route path="/pro/friends" element={<ProRouteGuard><Friends /></ProRouteGuard>} />
        <Route path="/pro/ranking" element={<ProRouteGuard><Ranking /></ProRouteGuard>} />
        <Route path="/pro/news" element={<ProRouteGuard><News /></ProRouteGuard>} />
        <Route path="/pro/gallery" element={<ProRouteGuard><MatchGallery /></ProRouteGuard>} />
        <Route path="/pro/deck-builder" element={<ProRouteGuard><ActiveDeckBuilderRoute /></ProRouteGuard>} />
        <Route path="/pro/duelcoins" element={<ProRouteGuard><DuelCoins /></ProRouteGuard>} />
        <Route path="/pro/store" element={<ProRouteGuard><Store /></ProRouteGuard>} />

        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const MainAppContent = () => {
  const [user, setUser] = useState<User | null>(null);

  useSubscriptionExpirationCheck();
  
  // Enable realtime notifications
  useRealtimeNotifications(user?.id);
  
  // Listen for duel invite responses (accepted/rejected)
  useDuelInviteResponse(user?.id);
  
  // Enable online status tracking
  useOnlineStatus();

  // Mark user as "Jogando DuelVerse" on linked Discord servers while logged in
  useDiscordPresence(user?.id);

  const syncNativeAuth = (session: { access_token: string; refresh_token?: string; user?: { id?: string } } | null) => {
    const nativeBridge = (window as any).DuelVerseNative;

    if (nativeBridge?.setAuthSession && session?.access_token && session?.user?.id) {
      nativeBridge.setAuthSession(
        session.access_token,
        session.refresh_token || '',
        session.user.id,
      );
    } else if (nativeBridge?.clearAuthSession) {
      nativeBridge.clearAuthSession();
    }
  };

  useEffect(() => {
    const normalizedTcg = normalizeTcgType(localStorage.getItem('activeTcg'));
    localStorage.setItem('activeTcg', normalizedTcg);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);

        // Sync auth state with Electron desktop app
        if ((window as any).electronAPI?.syncAuth) {
          if (session?.access_token && session?.user?.id) {
            (window as any).electronAPI.syncAuth(session.access_token, session.user.id);
          }
        }

        syncNativeAuth(session);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);

      if ((window as any).electronAPI?.syncAuth && session?.access_token && session?.user?.id) {
        (window as any).electronAPI.syncAuth(session.access_token, session.user.id);
      }

      syncNativeAuth(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter>
      <DynamicTheme />
      <UniversalNewTabBlocker />
      <ConditionalMonetagLoader />
      <ProAdCleaner />
      <DuelCallNotification currentUserId={user?.id} />
      <NotificationPrompt />
      <NativePermissionPrompt userId={user?.id} />
      <AnimatedBackground />
      <PageNavigationArrows />
      <UnifiedPageLoader />
      <BackgroundMusic />
      <div className="router-view-animate">
        <RouterContent user={user} />
      </div>
    </BrowserRouter>
  );
};

const DiscordActivityShell = () => (
  <Suspense fallback={
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  }>
    <DiscordActivity />
  </Suspense>
);

const AppContent = () => {
  if (isRunningInsideDiscord()) return <DiscordActivityShell />;
  return <MainAppContent />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TcgProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppContent />
      </TooltipProvider>
    </TcgProvider>
  </QueryClientProvider>
);

export default App;
