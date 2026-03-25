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
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from '@supabase/supabase-js';
import { DuelInviteNotification } from "@/components/DuelInviteNotification";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { DynamicTheme } from "@/components/DynamicTheme";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSubscriptionExpirationCheck } from "@/hooks/useSubscriptionExpirationCheck";
import { TcgProvider, useTcg } from "./contexts/TcgContext";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Duels from "./pages/Duels";
import DuelRoom from "./pages/DuelRoom";
import Profile from "./pages/Profile";
import Ranking from "./pages/Ranking";
import Friends from "./pages/Friends";
import Tournaments from "./pages/Tournaments";
import CreateTournament from "./pages/CreateTournament";
import TournamentDetail from "./pages/TournamentDetail";
import Matchmaking from "./pages/Matchmaking";
import Store from "./pages/Store";
import DuelCoins from "./pages/DuelCoins";
import JudgePanel from "./pages/JudgePanel";
import FriendChat from "./pages/FriendChat";
import MatchGallery from "./pages/MatchGallery";
import VideoShare from "./pages/VideoShare";
import News from "./pages/News";
import NotFound from "./pages/NotFound";

import DeckBuilder from "./pages/DeckBuilder";
import MagicDeckBuilder from "./pages/MagicDeckBuilder";
import PokemonDeckBuilder from "./pages/PokemonDeckBuilder";
import ProfileSelect from "./pages/ProfileSelect";
import CreateWeeklyTournament from "./pages/CreateWeeklyTournament";
import WeeklyTournaments from "./pages/WeeklyTournaments";
import MyTournaments from "./pages/MyTournaments";
import TournamentManager from "./pages/TournamentManager";
import TransferHistory from "./pages/TransferHistory";
import Marketplace from "./pages/Marketplace";
import MyItems from "./pages/MyItems";
import BuyDuelCoins from "./pages/BuyDuelCoins";

const queryClient = new QueryClient();

// Componente que redireciona baseado no estado de autenticação
const HomePage = ({ user }: { user: User | null }) => {
  if (user) return <Home />;
  return <Landing />;
};

// Componente que resolve automaticamente o deck builder com base no TCG ativo
const ActiveDeckBuilderRoute = () => {
  const { activeTcg } = useTcg();

  if (activeTcg === "magic") return <MagicDeckBuilder />;
  if (activeTcg === "pokemon") return <PokemonDeckBuilder />;
  return <DeckBuilder />;
};

// Componente interno que fica dentro do Router para usar useNavigate
const RouterContent = ({ user }: { user: User | null }) => {
  return (
    <Routes>
      <Route path="/" element={<HomePage user={user} />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/duels" element={<Duels />} />
      <Route path="/duel/:id" element={<DuelRoom />} />
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
      
      <Route path="/deck-builder" element={<DeckBuilder />} />
      <Route path="/magic-deck-builder" element={<MagicDeckBuilder />} />
      <Route path="/pokemon-deck-builder" element={<PokemonDeckBuilder />} />
      <Route path="/profile-select" element={<ProfileSelect />} />
      <Route path="/weekly-tournaments" element={<WeeklyTournaments />} />
      <Route path="/create-weekly-tournament" element={<CreateWeeklyTournament />} />
      <Route path="/my-tournaments" element={<MyTournaments />} />
      <Route path="/tournament-manager" element={<TournamentManager />} />
      <Route path="/transfer-history" element={<TransferHistory />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/my-items" element={<MyItems />} />
      <Route path="/buy-duelcoins" element={<BuyDuelCoins />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useSubscriptionExpirationCheck();
  
  // Enable realtime notifications
  useRealtimeNotifications(user?.id);
  
  // Enable online status tracking
  useOnlineStatus();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
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
      <DuelInviteNotification currentUserId={user?.id} />
      <NotificationPrompt />
      <RouterContent user={user} />
    </BrowserRouter>
  );
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