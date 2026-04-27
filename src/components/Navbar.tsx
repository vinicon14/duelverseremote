/**
 * DuelVerse - Componente de Navegação
 * Desenvolvido por Vinícius
 * 
 * Barra de navegação principal com links para todas as páginas.
 * Inclui menu mobile, notificações e informações do usuário.
 */
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Swords, Trophy, User, LogOut, Menu, Users, Zap, Shield, Store, Newspaper, Coins, Scale, Video, Layers, BarChart3, Crown, Gift } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { useJudge } from "@/hooks/useJudge";
import { useAccountType } from "@/hooks/useAccountType";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { OnlineUsersCounter } from "@/components/OnlineUsersCounter";
import { TcgSwitcher } from "@/components/TcgSwitcher";
import { useTcg } from "@/contexts/TcgContext";
import { useTranslation } from "react-i18next";

export const Navbar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const { isAdmin } = useAdmin();
  const { isJudge } = useJudge();
  const { isPro } = useAccountType();
  const { activeTcg } = useTcg();

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

      // Remove "Jogando DuelVerse" role on linked Discord servers
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (token) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-presence`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ playing: false }),
          });
        }
      } catch { /* best-effort */ }
    }
    
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => {
    const btnClass = mobile 
      ? "text-foreground hover:text-primary w-full justify-start h-11 text-base"
      : "text-foreground hover:text-primary";
    return (
      <>
        <Link to="/duels">
          <Button variant="ghost" className={btnClass}>
            <Swords className="mr-2 h-4 w-4" />
            {t('nav.duels')}
          </Button>
        </Link>
        <Link to="/matchmaking">
          <Button variant="ghost" className={btnClass}>
            <Zap className="mr-2 h-4 w-4" />
            {t('nav.matchmaking')}
          </Button>
        </Link>
        <Link to="/tournaments">
          <Button variant="ghost" className={btnClass}>
            <Trophy className="mr-2 h-4 w-4" />
            {t('nav.tournaments')}
          </Button>
        </Link>
        <Link to="/friends">
          <Button variant="ghost" className={btnClass}>
            <Users className="mr-2 h-4 w-4" />
            {t('nav.friends')}
          </Button>
        </Link>
        <Link to="/ranking">
          <Button variant="ghost" className={btnClass}>
            <BarChart3 className="mr-2 h-4 w-4" />
            {t('nav.ranking')}
          </Button>
        </Link>
        <Link to="/news">
          <Button variant="ghost" className={btnClass}>
            <Newspaper className="mr-2 h-4 w-4" />
            {t('nav.news')}
          </Button>
        </Link>
        <Link to="/gallery">
          <Button variant="ghost" className={btnClass}>
            <Video className="mr-2 h-4 w-4" />
            {t('nav.gallery')}
          </Button>
        </Link>
        <Link to={activeTcg === 'magic' ? '/magic-deck-builder' : '/deck-builder'}>
          <Button variant="ghost" className={btnClass}>
            <Layers className="mr-2 h-4 w-4" />
            {t('nav.deckBuilder')}
          </Button>
        </Link>
        <Link to="/duelcoins">
          <Button variant="ghost" className={btnClass}>
            <Coins className="mr-2 h-4 w-4" />
            {t('nav.duelcoins')}
          </Button>
        </Link>
        <Link to="/store">
          <Button variant="ghost" className={btnClass}>
            <Store className="mr-2 h-4 w-4" />
            {t('nav.store')}
          </Button>
        </Link>
        <Link to="/my-items">
          <Button variant="ghost" className={btnClass}>
            <Gift className="mr-2 h-4 w-4" />
            {t('nav.myItems')}
          </Button>
        </Link>
        {isAdmin && (
          <Link to="/admin">
            <Button variant="ghost" className={btnClass}>
              <Shield className="mr-2 h-4 w-4" />
              {t('nav.admin')}
            </Button>
          </Link>
        )}
        {isJudge && (
          <Link to="/judge-panel">
            <Button variant="ghost" className={btnClass}>
              <Scale className="mr-2 h-4 w-4" />
              {t('nav.judge')}
            </Button>
          </Link>
        )}
      </>
    );
  };

  // Navbar scroll effect
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Custom scrollbar for nav links
  const navScrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbLeft, setThumbLeft] = useState(0);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [showThumb, setShowThumb] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  const updateThumb = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth) {
      setShowThumb(false);
      return;
    }
    setShowThumb(true);
    const trackWidth = trackRef.current?.clientWidth || clientWidth;
    const ratio = clientWidth / scrollWidth;
    const tw = Math.max(ratio * trackWidth, 40);
    const maxScroll = scrollWidth - clientWidth;
    const left = maxScroll > 0 ? (scrollLeft / maxScroll) * (trackWidth - tw) : 0;
    setThumbWidth(tw);
    setThumbLeft(left);
  }, []);

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateThumb, { passive: true });
    const ro = new ResizeObserver(updateThumb);
    ro.observe(el);
    updateThumb();
    return () => {
      el.removeEventListener('scroll', updateThumb);
      ro.disconnect();
    };
  }, [updateThumb]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartScroll.current = navScrollRef.current?.scrollLeft || 0;
  };

  const justDragged = useRef(false);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const el = navScrollRef.current;
      const track = trackRef.current;
      if (!el || !track) return;
      const dx = e.clientX - dragStartX.current;
      const trackWidth = track.clientWidth;
      const ratio = (el.scrollWidth - el.clientWidth) / (trackWidth - thumbWidth);
      el.scrollLeft = dragStartScroll.current + dx * ratio;
    };
    const handleUp = () => {
      setIsDragging(false);
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 100);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, thumbWidth]);

  const handleTrackClick = (e: React.MouseEvent) => {
    if (justDragged.current) return;
    const el = navScrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300 border-b border-white/5 ${scrolled ? 'bg-background/80' : 'bg-background/40'}`}>
      <div className="container flex h-16 items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex items-center space-x-2">
          <div className="text-xl font-black text-primary tracking-[0.2em] flex items-center gap-2">
            {isPro ? <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500 drop-shadow-md" /> : <div className="w-2 h-6 bg-primary rounded-sm" />}
            DUELVERSE
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex flex-col flex-1 mx-4 relative overflow-hidden">
          <div
            ref={navScrollRef}
            className="flex items-center space-x-2 overflow-x-auto flex-1 scrollbar-none"
            style={{ scrollbarWidth: 'none' }}
          >
            <div className="flex items-center space-x-2 min-w-max">
              <NavLinks />
            </div>
          </div>
          {/* Custom animated scrollbar */}
          {showThumb && (
            <div
              ref={trackRef}
              className="h-1.5 mt-3 rounded-full cursor-pointer relative bg-white/5 border border-white/10 hover:h-2 transition-all duration-300 group"
              onClick={handleTrackClick}
            >
              <div
                className="absolute top-0 h-full rounded-full cursor-grab active:cursor-grabbing bg-primary/70 shadow-[0_0_8px_hsl(var(--primary))] transition-all duration-300 group-hover:bg-primary group-hover:shadow-[0_0_15px_hsl(var(--primary))] animate-glow-pulse"
                style={{
                  left: `${thumbLeft}px`,
                  width: `${thumbWidth}px`,
                }}
                onMouseDown={handleThumbMouseDown}
              />
            </div>
          )}
        </div>
        
        <div className="hidden md:flex items-center space-x-2 shrink-0">
          <TcgSwitcher />
          <OnlineUsersCounter />
          
          {user && <NotificationBell userId={user.id} />}
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className={isPro ? "bg-yellow-500/20" : "bg-primary/20"}>
                      {profile?.username?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {isPro && (
                    <Crown className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 fill-yellow-500" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  {t('nav.profile')}
                  {isPro && <Crown className="ml-2 w-3 h-3 text-yellow-500" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button className="btn-mystic text-white">
                {t('nav.login')}
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
          <SheetContent side="right" className="w-72 h-screen overflow-y-auto p-4">
            <div className="flex flex-col space-y-1 pt-6 h-full pb-24">
              <div className="flex items-center gap-2 pb-3 mb-2 border-b border-border">
                <TcgSwitcher />
                <OnlineUsersCounter />
                {user && <NotificationBell userId={user.id} />}
              </div>
              <NavLinks mobile />
              <div className="border-t border-border pt-2 mt-2">
                {user ? (
                  <>
                    <Button variant="ghost" onClick={() => navigate('/profile')} className="w-full justify-start h-11 text-base">
                      <User className="mr-2 h-4 w-4" />
                      {t('nav.profile')}
                    </Button>
                    <Button variant="ghost" onClick={handleLogout} className="w-full justify-start h-11 text-base text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      {t('nav.logout')}
                    </Button>
                  </>
                ) : (
                  <Button className="btn-mystic text-white w-full h-11" onClick={() => navigate('/auth')}>
                    {t('nav.login')}
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};
