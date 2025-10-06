import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
