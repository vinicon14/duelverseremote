import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Swords, Trophy, User, LogOut, Menu, Users, Zap, Shield, Store, Newspaper, Coins, Scale, Video, Layers, BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { useJudge } from "@/hooks/useJudge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { OnlineUsersCounter } from "@/components/OnlineUsersCounter";

export const Navbar = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const { isAdmin } = useAdmin();
  const { isJudge } = useJudge();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (data) {
      setProfile(data);
    }
  };

  const handleLogout = async () => {
    // Mark user as offline before logout
    if (user) {
      await supabase
        .from('profiles')
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq('user_id', user.id);
    }
    
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const NavLinks = ({ horizontal = false }: { horizontal?: boolean }) => (
    <div className={horizontal ? "flex flex-wrap gap-1 justify-start" : "flex flex-col"}>
      <Link to="/duels">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Swords className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Duelos</span>}
        </Button>
      </Link>
      <Link to="/matchmaking">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Zap className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Fila Rápida</span>}
        </Button>
      </Link>
      <Link to="/tournaments">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Trophy className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Torneios</span>}
        </Button>
      </Link>
      <Link to="/friends">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Users className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Amigos</span>}
        </Button>
      </Link>
      <Link to="/ranking">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <BarChart3 className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Ranking</span>}
        </Button>
      </Link>
      <Link to="/news">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Newspaper className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Notícias</span>}
        </Button>
      </Link>
      <Link to="/gallery">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Video className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Galeria</span>}
        </Button>
      </Link>
      <Link to="/deck-builder">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Layers className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Deck Build</span>}
        </Button>
      </Link>
      <Link to="/duelcoins">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Coins className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">DuelCoins</span>}
        </Button>
      </Link>
      <Link to="/store">
        <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
          <Store className="h-4 w-4" />
          {horizontal ? "" : <span className="ml-2">Loja</span>}
        </Button>
      </Link>
      {isAdmin && (
        <Link to="/admin">
          <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
            <Shield className="h-4 w-4" />
            {horizontal ? "" : <span className="ml-2">Admin</span>}
          </Button>
        </Link>
      )}
      {isJudge && (
        <Link to="/judge-panel">
          <Button variant="ghost" size={horizontal ? "sm" : "default"} className="text-foreground hover:text-primary">
            <Scale className="h-4 w-4" />
            {horizontal ? "" : <span className="ml-2">Juiz</span>}
          </Button>
        </Link>
      )}
    </div>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-primary/20 bg-card/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center space-x-2">
          <div className="text-2xl font-bold text-gradient-mystic">
            DUELVERSE
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-2 overflow-x-auto flex-1 mx-4">
          <div className="flex items-center space-x-2 min-w-max">
            <NavLinks horizontal />
          </div>
        </div>
        
        <div className="hidden md:flex items-center space-x-2 shrink-0">
          <OnlineUsersCounter />
          
          {user && <NotificationBell userId={user.id} />}
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/20">
                      {profile?.username?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button className="btn-mystic text-white">
                Entrar
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile Navigation */}
        <Sheet>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 h-[100dvh] p-0 flex flex-col">
            {/* Logo and User Section */}
            <div className="p-3 border-b shrink-0">
              <Link to="/" className="flex items-center space-x-2 mb-3">
                <div className="text-lg font-bold text-gradient-mystic">
                  DUELVERSE
                </div>
              </Link>
              {user && (
                <div className="flex items-center gap-3">
                  <NotificationBell userId={user.id} />
                  <OnlineUsersCounter />
                </div>
              )}
            </div>
            
            {/* Nav Links with Scroll - Horizontal layout */}
            <div className="flex-1 overflow-y-auto p-2">
              <NavLinks horizontal />
            </div>
            
            {/* Bottom Actions */}
            <div className="p-2 border-t shrink-0">
              {user ? (
                <div className="space-y-2">
                  <Button variant="ghost" onClick={() => navigate('/profile')} className="justify-start w-full">
                    <User className="mr-2 h-4 w-4" />
                    Perfil
                  </Button>
                  <Button variant="ghost" onClick={handleLogout} className="justify-start w-full">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </Button>
                </div>
              ) : (
                <Button className="btn-mystic text-white w-full" onClick={() => navigate('/auth')}>
                  Entrar
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};
