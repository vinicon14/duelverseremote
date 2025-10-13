import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDuelInviteNotifications } from "@/hooks/useDuelInviteNotifications";
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
import TournamentDetail from "./pages/TournamentDetail";
import Matchmaking from "./pages/Matchmaking";
import GetPro from "./pages/GetPro";
import News from "./pages/News";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Componente interno que fica dentro do Router para usar useNavigate
const RouterContent = ({ currentUserId }: { currentUserId: string | undefined }) => {
  // Ativar notificações de convites de duelo
  useDuelInviteNotifications(currentUserId);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/duels" element={<Duels />} />
      <Route path="/duel/:id" element={<DuelRoom />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/tournaments" element={<Tournaments />} />
      <Route path="/tournaments/:id" element={<TournamentDetail />} />
      <Route path="/matchmaking" element={<Matchmaking />} />
      <Route path="/get-pro" element={<GetPro />} />
      <Route path="/news" element={<News />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent = () => {
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();

  useEffect(() => {
    // Obter usuário atual
    const getCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUserId(session?.user?.id);
    };

    getCurrentUser();

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter>
      <RouterContent currentUserId={currentUserId} />
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
