import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from '@supabase/supabase-js';
import { DuelInviteNotification } from "@/components/DuelInviteNotification";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
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
import InstallApp from "./pages/InstallApp";
import DeckBuilder from "./pages/DeckBuilder";
import { useAccountType } from "@/hooks/useAccountType";

const queryClient = new QueryClient();

// Componente interno que fica dentro do Router para usar useNavigate
const RouterContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isPro } = useAccountType();
  // Route guards based on plan and path
  useEffect(() => {
    const guard = async () => {
      try {
        const { data: { session } } = await (supabase as any).auth.getSession();
        const path = location.pathname;
        const tryingPro = path.startsWith('/pro');
        const loggedIn = !!session?.user;
        if (tryingPro && !loggedIn) {
          navigate('/auth', { replace: true });
          return;
        }
        if (tryingPro && loggedIn && isPro === false) {
          navigate('/home', { replace: true });
          return;
        }
        const isFreeRoute = path === '/' || path === '/home' || path === '/duels' || path === '/profile' || path === '/login';
        if (path && isFreeRoute && loggedIn && isPro === true) {
          navigate('/pro/home', { replace: true });
          return;
        }
      } catch {
        // ignore
      }
    };
    guard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isPro]);
  return (
  <>
  <Routes>
      <Route path="/" element={<Home />} />
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
      <Route path="/install" element={<InstallApp />} />
      <Route path="/deck-builder" element={<DeckBuilder />} />
      <Route path="/home" element={<Home />} />
      <Route path="/pro/home" element={<Home />} />
      <Route path="/pro/duels" element={<Duels />} />
      <Route path="/pro/profile" element={<Profile />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
   </>
  );
};

const AppContent = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // Enable realtime notifications
  useRealtimeNotifications(user?.id);
  
  // Enable online status tracking
  useOnlineStatus();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // THEN check for existing session
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
      <DuelInviteNotification currentUserId={user?.id} />
      <NotificationPrompt />
      <RouterContent />
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
