/**
 * DuelVerse - Seleção de Perfil TCG (One-time cleanup)
 * 
 * Tela exibida quando o usuário tem mais de um perfil TCG.
 * O usuário escolhe UM perfil e os demais são excluídos permanentemente.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTcg, TcgType } from '@/contexts/TcgContext';
import { useAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Swords, Sparkles, Zap, Crown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const TCG_CONFIG: Record<TcgType, { name: string; icon: React.ReactNode; color: string }> = {
  yugioh: {
    name: "Yu-Gi-Oh!",
    icon: <Swords className="w-10 h-10" />,
    color: "text-purple-400",
  },
  magic: {
    name: "Magic: The Gathering",
    icon: <Sparkles className="w-10 h-10" />,
    color: "text-amber-400",
  },
  pokemon: {
    name: "Pokémon TCG",
    icon: <Zap className="w-10 h-10" />,
    color: "text-yellow-400",
  }
};

export default function ProfileSelect() {
  const navigate = useNavigate();
  const { profiles, isLoading, refreshProfiles } = useTcg();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [selecting, setSelecting] = useState(false);

  // Admins should never be on this page — they keep all profiles
  useEffect(() => {
    if (!adminLoading && isAdmin) {
      if (!localStorage.getItem('activeTcg')) {
        localStorage.setItem('activeTcg', 'yugioh');
      }
      navigate('/duels', { replace: true });
    }
  }, [isAdmin, adminLoading, navigate]);

  const handleSelectProfile = async (profileId: string, tcgType: TcgType) => {
    setSelecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Delete all other TCG profiles
      const { error } = await supabase
        .from('tcg_profiles')
        .delete()
        .eq('user_id', user.id)
        .neq('id', profileId);

      if (error) throw error;

      localStorage.setItem('activeTcg', tcgType);
      await refreshProfiles();
      toast.success(`Perfil ${TCG_CONFIG[tcgType]?.name || tcgType} selecionado!`);
      navigate('/duels', { replace: true });
    } catch (err: any) {
      console.error('Error selecting profile:', err);
      toast.error('Erro ao selecionar perfil.');
    } finally {
      setSelecting(false);
    }
  };

  if (isLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  if (isAdmin) return null;

  // If only one profile, redirect immediately
  if (profiles.length <= 1) {
    if (profiles.length === 1) {
      localStorage.setItem('activeTcg', profiles[0].tcg_type);
    }
    navigate('/duels', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-bold text-gradient-mystic mb-2">DUELVERSE</h1>
        <p className="text-muted-foreground text-lg">Escolha seu TCG principal</p>
      </div>

      <div className="flex items-center gap-2 mb-8 p-3 rounded-lg bg-destructive/10 border border-destructive/30 max-w-md text-center">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
        <p className="text-sm text-destructive">
          Você possui mais de um perfil. Escolha <strong>um</strong> para manter — os demais serão removidos permanentemente.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl w-full">
        {profiles.map(profile => {
          const config = TCG_CONFIG[profile.tcg_type as TcgType];
          if (!config) return null;
          return (
            <Card
              key={profile.id}
              className="cursor-pointer hover:border-primary/60 transition-all group card-mystic"
              onClick={() => !selecting && handleSelectProfile(profile.id, profile.tcg_type)}
            >
              <CardHeader className="pb-3">
                <div className={`${config.color} mb-2`}>{config.icon}</div>
                <CardTitle>{config.name}</CardTitle>
                <CardDescription>{profile.username}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="text-green-400">{profile.wins}W</span>
                  <span className="text-red-400">{profile.losses}L</span>
                  <span className="text-primary">{profile.points} pts</span>
                  <span className="flex items-center gap-1"><Crown className="w-3 h-3" /> Lv.{profile.level}</span>
                </div>
                <Button className="w-full mt-4" disabled={selecting}>
                  {selecting ? 'Selecionando...' : 'Escolher este perfil'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
