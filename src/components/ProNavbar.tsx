import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Swords, Trophy, User, LogOut, Menu, Users, Zap, Shield, Store, Newspaper, Coins, Scale, Video, Layers, Crown } from "lucide-react";
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

export const ProNavbar = () => {
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
    if (user) {
      await supabase
        .from('profiles')
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq('user_id', user.id);
    }
    
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const NavLinks = () => (
    <>
      <Link to="/pro/duels">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Swords className="mr-2 h-4 w-4" />
          Duelos
        </Button>
      </Link>
      <Link to="/pro/matchmaking">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Zap className="mr-2 h-4 w-4" />
          Fila Rápida
        </Button>
      </Link>
      <Link to="/pro/tournaments">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Trophy className="mr-2 h-4 w-4" />
          Torneios
        </Button>
      </Link>
      <Link to="/pro/friends">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Users className="mr-2 h-4 w-4" />
          Amigos
        </Button>
      </Link>
      <Link to="/pro/ranking">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Trophy className="mr-2 h-4 w-4" />
          Ranking
        </Button>
      </Link>
      <Link to="/pro/news">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Newspaper className="mr-2 h-4 w-4" />
          Notícias
        </Button>
      </Link>
      <Link to="/pro/gallery">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Video className="mr-2 h-4 w-4" />
          Galeria
        </Button>
      </Link>
      <Link to="/pro/deck-builder">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Layers className="mr-2 h-4 w-4" />
          Deck Build
        </Button>
      </Link>
      <Link to="/pro/duelcoins">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Coins className="mr-2 h-4 w-4" />
          DuelCoins
        </Button>
      </Link>
      <Link to="/pro/store">
        <Button variant="ghost" className="text-foreground hover:text-primary">
          <Store className="mr-2 h-4 w-4" />
          Loja
        </Button>
      </Link>
      {isAdmin && (
        <Link to="/admin">
          <Button variant="ghost" className="text-foreground hover:text-primary">
            <Shield className="mr-2 h-4 w-4" />
            Admin
          </Button>
        </Link>
      )}
      {isJudge && (
        <Link to="/judge-panel">
          <Button variant="ghost" className="text-foreground hover:text-primary">
            <Scale className="mr-2 h-4 w-4" />
            Juiz
          </Button>
        </Link>
      )}
    </>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-yellow-500/30 bg-card/95 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/pro/home" className="flex items-center space-x-2">
          <Crown className="w-6 h-6 text-yellow-500" />
          <div className="text-2xl font-bold text-gradient-pro bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600">
            DUELVERSE PRO
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-2 overflow-x-auto flex-1 mx-4">
          <div className="flex items-center space-x-2 min-w-max">
            <NavLinks />
          </div>
        </div>
        
        <div className="hidden md:flex items-center space-x-2 shrink-0">
          <OnlineUsersCounter />
          
          {user && <NotificationBell userId={user.id} />}
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full border border-yellow-500/30">
                  <Avatar>
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-yellow-500/20 text-yellow-500">
                      {profile?.username?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/pro/profile')}>
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
            <Button 
              className="btn-mystic text-white"
              onClick={async () => {
                // Fazer logout antes de ir para auth
                await supabase.auth.signOut();
                navigate('/auth');
              }}
            >
              Entrar
            </Button>
          )}
        </div>

        {/* Mobile Navigation */}
        <Sheet>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 border-yellow-500/20">
            <div className="flex flex-col space-y-4 mt-8">
              <NavLinks />
              {user ? (
                <>
                  <Button variant="ghost" onClick={() => navigate('/pro/profile')} className="justify-start">
                    <User className="mr-2 h-4 w-4" />
                    Perfil
                  </Button>
                  <Button variant="ghost" onClick={handleLogout} className="justify-start">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </Button>
                </>
              ) : (
                <Button 
                  className="btn-mystic text-white" 
                  onClick={async () => {
                    // Fazer logout antes de ir para auth
                    await supabase.auth.signOut();
                    navigate('/auth');
                  }}
                >
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
