/**
 * DuelVerse - Perfil do Usuario
 *
 * Exibe identidade do usuario, estatisticas por TCG ativo, XP separado,
 * historico de partidas, galeria de videos e configuracoes de conta.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Trophy, Swords, Star, Calendar, Video, Eye, Play, Sparkles, Loader2, Gift, CheckCircle2, Clapperboard, Target } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { LanguageSelector } from "@/components/LanguageSelector";
import { DiscordLinkCard } from "@/components/DiscordLinkCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS, es, fr, de, it, ja, ko, zhCN, ru, nl, pl, tr, ar, id as idLocale } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useTcg } from "@/contexts/TcgContext";
import { getTcgDisplayName } from "@/utils/tcgDisplay";
import { hasRewardedAdUnit, showRewardedVideoAd } from "@/utils/rewardedAds";
import { DAILY_XP_REWARDS, RANKED_XP_DIFFICULTIES, WELCOME_XP_REWARDS, getRankedDifficultyStorageKey, type RankedXpDifficultyKey } from "@/utils/xpRewards";

const dateLocaleMap: Record<string, any> = {
  "pt-BR": ptBR, "pt-PT": ptBR, en: enUS, es, fr, de, it, ja, ko, zh: zhCN, ru, nl, pl, tr, ar, id: idLocale,
};

interface Recording {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  views: number;
  is_public: boolean;
}

interface DailyQuest {
  id: string;
  quest_type: string;
  progress: number;
  target: number;
  reward_xp: number;
  claimed: boolean;
}

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const Profile = () => {
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { activeTcg, refreshProfiles } = useTcg();
  const dateLocale = dateLocaleMap[i18n.language] || enUS;

  const [profile, setProfile] = useState<any>(null);
  const [tcgProfile, setTcgProfile] = useState<any>(null);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [dailyQuests, setDailyQuests] = useState<DailyQuest[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [claimingDailyXp, setClaimingDailyXp] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'stats');
  const [rankedDifficulty, setRankedDifficulty] = useState<RankedXpDifficultyKey>(RANKED_XP_DIFFICULTIES[0].key);

  const loadTcgProfile = async (userId: string, ownProfile: boolean) => {
    if (ownProfile) {
      const { data, error } = await supabase
        .from('tcg_profiles')
        .select('*')
        .eq('user_id', userId)
        .eq('tcg_type', activeTcg)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
    // For other users: pick their most-progressed TCG profile (highest XP, then points)
    const { data, error } = await supabase
      .from('tcg_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('xp_total', { ascending: false })
      .order('points', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  };

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  const loadRecentMatches = async (userId: string) => {
    const { data, error } = await supabase
      .from('match_history')
      .select(`
        *,
        player1:profiles!match_history_player1_id_fkey(username),
        player2:profiles!match_history_player2_id_fkey(username),
        winner:profiles!match_history_winner_id_fkey(username)
      `)
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .order('played_at', { ascending: false })
      .limit(5);

    if (error) throw error;
    return data || [];
  };

  const loadRecordings = async (userId: string) => {
    const { data, error } = await supabase
      .from('match_recordings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const loadDailyQuests = async (_userId: string): Promise<DailyQuest[]> => {
    // Daily quests table not implemented yet; return empty list.
    return [];
  };

  useEffect(() => {
    const tab = searchParams.get('tab') || 'stats';
    if (tab !== activeTab) setActiveTab(tab);
  }, [activeTab, searchParams]);

  useEffect(() => {
    const stored = localStorage.getItem(getRankedDifficultyStorageKey(activeTcg));
    if (stored && RANKED_XP_DIFFICULTIES.some(difficulty => difficulty.key === stored)) {
      setRankedDifficulty(stored as RankedXpDifficultyKey);
    }
  }, [activeTcg]);

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      setProfileLoading(true);
      setActivityLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const targetUserId = paramUserId || session.user.id;
      setCurrentUser(session.user);
      setIsOwnProfile(targetUserId === session.user.id);

      const [profileResult, tcgResult, questsResult] = await Promise.allSettled([
        loadProfile(targetUserId),
        loadTcgProfile(targetUserId, targetUserId === session.user.id),
        loadDailyQuests(targetUserId),
      ]);

      if (cancelled) return;

      if (profileResult.status === 'rejected') {
        toast({
          title: t('profile.errorProfile'),
          description: profileResult.reason?.message,
          variant: "destructive",
        });
      }

      const loadedProfile = profileResult.status === 'fulfilled' ? profileResult.value : null;
      if (!loadedProfile) {
        toast({
          title: t('profile.userNotFound'),
          description: t('profile.userNotFoundDesc'),
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      setProfile(loadedProfile);
      setTcgProfile(tcgResult.status === 'fulfilled' ? tcgResult.value : null);
      setDailyQuests(questsResult.status === 'fulfilled' ? questsResult.value : []);
      setProfileLoading(false);

      const [matchesResult, recordingsResult] = await Promise.allSettled([
        loadRecentMatches(targetUserId),
        loadRecordings(targetUserId),
      ]);

      if (cancelled) return;

      if (matchesResult.status === 'fulfilled') {
        setRecentMatches(matchesResult.value);
      } else {
        console.error('Erro ao carregar partidas:', matchesResult.reason);
      }

      if (recordingsResult.status === 'fulfilled') {
        setRecordings(recordingsResult.value);
      } else {
        console.error('Erro ao carregar gravações:', recordingsResult.reason);
      }

      setActivityLoading(false);
    };

    loadPage();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramUserId, activeTcg]);

  const stats = useMemo(() => {
    const wins = tcgProfile?.wins || 0;
    const losses = tcgProfile?.losses || 0;
    const total = wins + losses;
    return {
      totalGames: total,
      wins,
      losses,
      winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0',
      points: tcgProfile?.points || 0,
      level: tcgProfile?.level || 1,
    };
  }, [tcgProfile]);

  const xp = useMemo(() => {
    const total = tcgProfile?.xp_total || 0;
    const level = tcgProfile?.xp_level || Math.floor(total / 100) + 1;
    const currentLevelStart = (level - 1) * 100;
    const nextLevelAt = level * 100;
    const currentProgress = Math.max(total - currentLevelStart, 0);
    const needed = Math.max(nextLevelAt - total, 0);
    const percent = Math.min(100, Math.max(0, (currentProgress / 100) * 100));
    const lastClaim = tcgProfile?.xp_last_daily_claim ? new Date(tcgProfile.xp_last_daily_claim).toISOString().slice(0, 10) : null;

    return {
      total,
      level,
      currentProgress,
      nextLevelAt,
      needed,
      percent,
      claimedToday: lastClaim === getTodayKey(),
    };
  }, [tcgProfile]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams(value === 'stats' ? {} : { tab: value }, { replace: true });
  };

  const handleClaimDailyXp = async () => {
    if (!profile?.user_id) return;

    setClaimingDailyXp(true);
    try {
      const { data, error } = await supabase.rpc('claim_daily_xp', { _tcg_type: activeTcg } as any);
      if (error) throw error;

      // Função retorna TABLE → PostgREST devolve array de linhas
      const row: any = Array.isArray(data) ? data[0] : data;
      const claimed = row?.claimed === true;
      const leveledUp = row?.leveled_up === true;

      if (!claimed) {
        toast({
          title: 'XP diário',
          description: 'Você já coletou hoje. Volte em 24h!',
        });
      } else {
        toast({
          title: '✨ +5 XP coletados!',
          description: leveledUp
            ? `Subiu para o nível ${row?.new_level} em ${getTcgDisplayName(activeTcg)}!`
            : `Total: ${row?.new_total} XP em ${getTcgDisplayName(activeTcg)}`,
        });
      }

      const freshTcgProfile = await loadTcgProfile(profile.user_id, true);
      const freshQuests = await loadDailyQuests(profile.user_id);
      setTcgProfile(freshTcgProfile);
      setDailyQuests(freshQuests);
      refreshProfiles();
    } catch (error: any) {
      toast({
        title: 'Erro ao coletar XP',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setClaimingDailyXp(false);
    }
  };

  const handleWatchRewardedAd = async () => {
    if (!profile?.user_id) return;

    setWatchingAd(true);
    try {
      if (!hasRewardedAdUnit()) {
        throw new Error('Sistema de anúncios indisponível no momento.');
      }

      const adResult = await showRewardedVideoAd();
      if (!adResult.rewarded) {
        throw new Error('O anuncio nao liberou recompensa.');
      }

      const { data, error } = await supabase.rpc('claim_ads_xp_bundle', {
        _tcg_type: activeTcg,
      } as any);
      if (error) throw error;

      // Função retorna TABLE → array
      const row: any = Array.isArray(data) ? data[0] : data;
      const bundleAwarded = row?.bundle_awarded === true;
      const adsWatched = row?.ads_watched || 0;

      if (bundleAwarded) {
        toast({
          title: '🎁 +100 XP liberados!',
          description: `Você completou ${adsWatched} anúncios e ganhou o bônus!`,
        });
      } else {
        toast({
          title: 'Anúncio contabilizado',
          description: `${adsWatched % 10}/10 anúncios para o próximo bônus de 100 XP`,
        });
      }

      const freshTcgProfile = await loadTcgProfile(profile.user_id, true);
      const freshQuests = await loadDailyQuests(profile.user_id);
      setTcgProfile(freshTcgProfile);
      setDailyQuests(freshQuests);
      refreshProfiles();
    } catch (error: any) {
      toast({
        title: 'Anuncio nao concluido',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setWatchingAd(false);
    }
  };

  const questLabels: Record<string, { title: string; description: string }> = {
    daily_login: {
      title: 'Login diario',
      description: `+${DAILY_XP_REWARDS.login} XP uma vez por dia`,
    },
    play_casual: {
      title: 'Duelo casual',
      description: `+${DAILY_XP_REWARDS.casualDuel} XP ao concluir um duelo casual`,
    },
    watch_ad: {
      title: 'Assistir 5 anuncios',
      description: `+${DAILY_XP_REWARDS.adsBundle} XP ao concluir 5 videos`,
    },
    forum_interaction: {
      title: 'Interagir no forum',
      description: `+${DAILY_XP_REWARDS.forumInteraction} XP ao participar do chat/forum`,
    },
  };

  const welcomeMissions = useMemo(() => [
    {
      title: 'Primeiro login',
      description: `Conta criada com +${WELCOME_XP_REWARDS.initialAccount} XP iniciais`,
      complete: true,
      progress: 1,
      target: 1,
    },
    {
      title: 'Configurar perfil',
      description: 'Adicione avatar ou bio para completar',
      complete: Boolean(profile?.avatar_url || profile?.bio),
      progress: profile?.avatar_url || profile?.bio ? 1 : 0,
      target: 1,
    },
    {
      title: 'Primeira partida',
      description: 'Complete sua primeira partida registrada',
      complete: stats.totalGames > 0,
      progress: stats.totalGames > 0 ? 1 : 0,
      target: 1,
    },
  ], [profile?.avatar_url, profile?.bio, stats.totalGames]);

  const adQuest = dailyQuests.find(q => q.quest_type === 'watch_ad');
  const dailyLoginQuest = dailyQuests.find(q => q.quest_type === 'daily_login');
  const completedDailyQuests = dailyQuests.filter(q => q.claimed).length;
  const totalDailyQuests = dailyQuests.length || 4;
  const adProgress = `${adQuest?.progress || 0}/${adQuest?.target || 5}`;
  const selectedRankedDifficulty = RANKED_XP_DIFFICULTIES.find(difficulty => difficulty.key === rankedDifficulty) || RANKED_XP_DIFFICULTIES[0];

  const handleSelectRankedDifficulty = (difficulty: RankedXpDifficultyKey) => {
    setRankedDifficulty(difficulty);
    localStorage.setItem(getRankedDifficultyStorageKey(activeTcg), difficulty);
    navigate('/duels?ranked=1');
  };

  const renderProfileSkeleton = () => (
    <div className="animate-pulse space-y-6">
      <div className="h-48 bg-card rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-card rounded-lg" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />

      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        {profileLoading && !profile ? (
          renderProfileSkeleton()
        ) : (
          <>
            <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <Card className="card-mystic h-full animate-fade-in-up">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-4 sm:gap-6">
                  {isOwnProfile ? (
                    <AvatarUpload
                      userId={profile?.user_id}
                      currentAvatarUrl={profile?.avatar_url}
                      username={profile?.username}
                      onAvatarUpdated={(newUrl) => setProfile({ ...profile, avatar_url: newUrl })}
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/20">
                      <img
                        src={profile?.avatar_url || '/placeholder.svg'}
                        alt={profile?.username}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex-1 text-center md:text-left">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                      <h1 className="text-2xl sm:text-3xl font-bold text-gradient-mystic">
                        {profile?.username || t('profile.user')}
                      </h1>
                      <span className="mx-auto md:mx-0 w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {getTcgDisplayName(tcgProfile?.tcg_type || activeTcg)}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-muted-foreground mb-4">
                      {profile?.bio || t('profile.duelist')}
                    </p>

                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-3 sm:justify-center md:justify-start">
                      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary/10">
                        <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" />
                        <span className="text-sm sm:text-base font-semibold">{t('profile.level', { level: stats.level })}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary/10">
                        <Star className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        <span className="text-sm sm:text-base font-semibold">{t('profile.points', { points: stats.points })}</span>
                      </div>
                    </div>
                  </div>

                  {isOwnProfile && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                      <ChangePasswordForm />
                      <Button onClick={() => navigate('/duels')} className="btn-mystic text-white">
                        <Swords className="mr-2 h-4 w-4" />
                        {t('profile.newDuel')}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="card-mystic h-full animate-fade-in-up">
              <CardContent className="pt-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <h2 className="text-lg font-bold text-gradient-mystic">XP {getTcgDisplayName(tcgProfile?.tcg_type || activeTcg)}</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Nivel {xp.level} • {xp.total.toLocaleString('pt-BR')} XP exatos • {xp.needed.toLocaleString('pt-BR')} XP para o proximo nivel
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-center">
                    <p className="text-xs uppercase text-muted-foreground">XP atual</p>
                    <p className="text-2xl font-bold text-primary">{xp.total.toLocaleString('pt-BR')}</p>
                  </div>
                  {isOwnProfile && (
                    <Button
                      onClick={handleClaimDailyXp}
                      disabled={claimingDailyXp || Boolean(dailyLoginQuest?.claimed)}
                      variant={dailyLoginQuest?.claimed ? "outline" : "default"}
                      className={dailyLoginQuest?.claimed ? "" : "btn-mystic text-white"}
                    >
                      {claimingDailyXp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {dailyLoginQuest?.claimed ? 'XP diário coletado' : 'Coletar XP diário'}
                    </Button>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  <Progress value={xp.percent} className="h-3" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{(xp.level - 1) * 100} XP</span>
                    <span>{xp.currentProgress}/100 XP no nivel</span>
                    <span>{xp.nextLevelAt} XP</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Missões hoje</p>
                    <p className="text-lg font-bold text-primary">{completedDailyQuests}/{totalDailyQuests}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Anúncios</p>
                    <p className="text-lg font-bold text-primary">{adProgress}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Ranqueada</p>
                    <p className="text-lg font-bold text-primary">{selectedRankedDifficulty.xp.toLocaleString('pt-BR')} XP</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-card/80 p-1 md:grid-cols-4">
                <TabsTrigger value="stats" className="gap-2">
                  <Trophy className="h-4 w-4" />
                  {t('profile.tabStats')}
                </TabsTrigger>
                <TabsTrigger value="missions" className="gap-2">
                  <Gift className="h-4 w-4" />
                  Missões
                </TabsTrigger>
                <TabsTrigger value="ranked" className="gap-2">
                  <Target className="h-4 w-4" />
                  Ranqueada
                </TabsTrigger>
                <TabsTrigger value="gallery" className="gap-2">
                  <Video className="h-4 w-4" />
                  {t('profile.tabGallery')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="stats" className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 animate-fade-in-up delay-150">
                  <Card className="card-mystic">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs sm:text-sm text-muted-foreground">{t('profile.totalGames')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl sm:text-3xl font-bold text-gradient-mystic">
                        {stats.totalGames}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-mystic">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs sm:text-sm text-muted-foreground">{t('profile.wins')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl sm:text-3xl font-bold text-gradient-gold">
                        {stats.wins}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-mystic">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs sm:text-sm text-muted-foreground">{t('profile.losses')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl sm:text-3xl font-bold text-destructive">
                        {stats.losses}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-mystic">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs sm:text-sm text-muted-foreground">{t('profile.winRate')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl sm:text-3xl font-bold text-primary">
                        {stats.winRate}%
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {isOwnProfile && profile?.user_id && (
                  <LanguageSelector
                    userId={profile.user_id}
                    currentLanguage={profile.language_code}
                    onLanguageUpdated={(lng) => setProfile({ ...profile, language_code: lng })}
                  />
                )}

                {isOwnProfile && <DiscordLinkCard />}

                <Card className="card-mystic animate-fade-in-up delay-300">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      <span className="text-gradient-mystic">{t('profile.recentMatches')}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activityLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}
                      </div>
                    ) : recentMatches.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        {t('profile.noMatches')}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {recentMatches.map((match) => {
                          const isWinner = match.winner_id === profile?.user_id;
                          return (
                            <div
                              key={match.id}
                              className={`p-4 rounded-lg border ${
                                isWinner ? 'border-secondary/30 bg-secondary/5' : 'border-destructive/30 bg-destructive/5'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-4 min-w-0">
                                  <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                    isWinner ? 'bg-secondary/20 text-secondary' : 'bg-destructive/20 text-destructive'
                                  }`}>
                                    {isWinner ? t('profile.victory') : t('profile.defeat')}
                                  </div>
                                  <span className="text-sm text-muted-foreground truncate">
                                    vs {match.player1?.username === profile?.username ? match.player2?.username : match.player1?.username}
                                  </span>
                                </div>
                                <div className="text-sm text-muted-foreground shrink-0">
                                  {new Date(match.played_at).toLocaleDateString(i18n.language)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="missions" className="space-y-6">
                <Card className="card-mystic">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="w-5 h-5 text-secondary" />
                      <span className="text-gradient-mystic">Missões de boas-vindas</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {welcomeMissions.map((mission) => (
                        <div key={mission.title} className="rounded-lg border border-border/60 bg-background/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{mission.title}</p>
                              <p className="text-xs text-muted-foreground">{mission.description}</p>
                            </div>
                            {mission.complete ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                            ) : (
                              <span className="text-xs font-semibold text-muted-foreground shrink-0">
                                {mission.progress}/{mission.target}
                              </span>
                            )}
                          </div>
                          <Progress value={(mission.progress / mission.target) * 100} className="mt-3 h-2" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-mystic">
                  <CardHeader>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-primary" />
                          <span className="text-gradient-mystic">Missões diárias</span>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Reset diário para {getTcgDisplayName(activeTcg)}.
                        </p>
                      </div>

                      {isOwnProfile && (
                        <Button
                          onClick={handleWatchRewardedAd}
                          disabled={watchingAd || Boolean(adQuest?.claimed)}
                          className="btn-mystic text-white"
                        >
                          {watchingAd ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Clapperboard className="mr-2 h-4 w-4" />
                          )}
                          {adQuest?.claimed
                            ? 'Bônus de anúncios coletado'
                            : `Assistir anúncio (${adQuest?.progress || 0}/${adQuest?.target || 5})`}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {dailyQuests.map((quest) => {
                        const label = questLabels[quest.quest_type] || {
                          title: quest.quest_type,
                          description: `${quest.reward_xp} XP`,
                        };
                        const percent = Math.min(100, (quest.progress / Math.max(quest.target, 1)) * 100);

                        return (
                          <div key={quest.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{label.title}</p>
                                <p className="text-xs text-muted-foreground">{label.description}</p>
                              </div>
                              {quest.claimed ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                              ) : (
                                <span className="text-xs font-semibold text-muted-foreground shrink-0">
                                  {quest.progress}/{quest.target}
                                </span>
                              )}
                            </div>
                            <Progress value={percent} className="mt-3 h-2" />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ranked" className="space-y-6">
                <Card className="card-mystic">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      <span className="text-gradient-mystic">Partida ranqueada por XP</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Seu saldo atual é {xp.total.toLocaleString('pt-BR')} XP. O valor escolhido é descontado ao criar a sala ranqueada.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {RANKED_XP_DIFFICULTIES.map((difficulty) => {
                        const selected = rankedDifficulty === difficulty.key;
                        const disabled = xp.total < difficulty.xp;

                        return (
                          <Button
                            key={difficulty.key}
                            type="button"
                            variant={selected ? "default" : "outline"}
                            disabled={disabled}
                            onClick={() => handleSelectRankedDifficulty(difficulty.key)}
                            className={`h-auto flex-col gap-1 py-4 ${selected ? "btn-mystic text-white" : ""}`}
                          >
                            <span className="font-bold">{difficulty.label}</span>
                            <span className="text-xs opacity-80">{difficulty.xp.toLocaleString('pt-BR')} XP</span>
                          </Button>
                        );
                      })}
                    </div>
                    <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                      Se vencer, você recebe de volta o XP apostado e o resultado ranqueado continua contando para o ranking competitivo.
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="gallery">
                <Card className="card-mystic">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Video className="w-5 h-5 text-primary" />
                      <span className="text-gradient-mystic">{t('profile.videoGallery')}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activityLoading ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => <div key={i} className="aspect-video rounded-lg bg-muted/40 animate-pulse" />)}
                      </div>
                    ) : recordings.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        {t('profile.noRecordings')}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recordings.map((recording) => (
                          <Card
                            key={recording.id}
                            className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                            onClick={() => navigate(`/video/${recording.id}`)}
                          >
                            <div className="relative aspect-video bg-muted">
                              {recording.thumbnail_url ? (
                                <img
                                  src={recording.thumbnail_url}
                                  alt={recording.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20">
                                  <Video className="w-12 h-12 text-muted-foreground" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Play className="w-12 h-12 text-white" />
                              </div>
                            </div>
                            <CardContent className="p-3">
                              <h3 className="font-semibold text-sm truncate">{recording.title}</h3>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {recording.views}
                                </span>
                                <span>
                                  {formatDistanceToNow(new Date(recording.created_at), {
                                    addSuffix: true,
                                    locale: dateLocale,
                                  })}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
};

export default Profile;
