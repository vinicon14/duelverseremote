import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProGuard } from "@/components/ProGuard";
import { ProModeProvider } from "@/hooks/useProMode";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ProModeProvider>
        <BrowserRouter>
          <Routes>
          {/* ============ ROTAS NORMAIS (com anúncios) ============ */}
          <Route path="/" element={<Home />} />
          <Route path="/landing" element={<Landing />} />
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
          <Route path="/admin" element={<Admin />} />

          {/* ============ ROTAS PRO (sem anúncios + verificação) ============ */}
          <Route path="/pro" element={<Navigate to="/pro/duels" replace />} />
          <Route path="/pro/home" element={<ProGuard><Home /></ProGuard>} />
          <Route path="/pro/landing" element={<ProGuard><Landing /></ProGuard>} />
          <Route path="/pro/duels" element={<ProGuard><Duels /></ProGuard>} />
          <Route path="/pro/duel/:id" element={<ProGuard><DuelRoom /></ProGuard>} />
          <Route path="/pro/profile" element={<ProGuard><Profile /></ProGuard>} />
          <Route path="/pro/profile/:userId" element={<ProGuard><Profile /></ProGuard>} />
          <Route path="/pro/ranking" element={<ProGuard><Ranking /></ProGuard>} />
          <Route path="/pro/friends" element={<ProGuard><Friends /></ProGuard>} />
          <Route path="/pro/chat/:friendId" element={<ProGuard><FriendChat /></ProGuard>} />
          <Route path="/pro/tournaments" element={<ProGuard><Tournaments /></ProGuard>} />
          <Route path="/pro/create-tournament" element={<ProGuard><CreateTournament /></ProGuard>} />
          <Route path="/pro/tournaments/:id" element={<ProGuard><TournamentDetail /></ProGuard>} />
          <Route path="/pro/matchmaking" element={<ProGuard><Matchmaking /></ProGuard>} />
          <Route path="/pro/duelcoins" element={<ProGuard><DuelCoins /></ProGuard>} />
          <Route path="/pro/judge-panel" element={<ProGuard><JudgePanel /></ProGuard>} />
          <Route path="/pro/store" element={<ProGuard><Store /></ProGuard>} />
          <Route path="/pro/news" element={<ProGuard><News /></ProGuard>} />
          <Route path="/pro/gallery" element={<ProGuard><MatchGallery /></ProGuard>} />
          <Route path="/pro/video/:id" element={<ProGuard><VideoShare /></ProGuard>} />
          <Route path="/pro/install" element={<ProGuard><InstallApp /></ProGuard>} />
          <Route path="/pro/deck-builder" element={<ProGuard><DeckBuilder /></ProGuard>} />
          <Route path="/pro/admin" element={<ProGuard><Admin /></ProGuard>} />

          {/* Rota 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </ProModeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
