/**
 * DuelVerse - Seleção de Perfil TCG
 * 
 * Tela pós-login para selecionar ou criar perfil por TCG.
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTcg, TcgType } from '@/contexts/TcgContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Swords, Sparkles, Zap, Plus, Crown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const TCG_CONFIG: Record<TcgType, { name: string; icon: React.ReactNode; color: string; gradient: string; description: string }> = {
  yugioh: {
    name: "YGO",
    icon: <Swords className="w-10 h-10" />,
    color: "text-purple-400",
    gradient: "from-purple-600 to-pink-600",
    description: "Duele com monstros, magias e armadilhas no TCG clássico!"
  },
  magic: {
    name: "MTG",
    icon: <Sparkles className="w-10 h-10" />,
    color: "text-amber-400",
    gradient: "from-amber-600 to-red-700",
    description: "Explore os planos de MTG com criaturas, feitiços e planeswalkers!"
  },
  pokemon: {
    name: "PKM",
    icon: <Zap className="w-10 h-10" />,
    color: "text-yellow-400",
    gradient: "from-yellow-500 to-blue-600",
    description: "Capture, evolua e batalhe com Pokémon no TCG oficial!"
  }
};

export default function ProfileSelect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profiles, switchProfile, createProfile, isLoading } = useTcg();
  const [creating, setCreating] = useState(false);
  const returnTo = (location.state as any)?.returnTo || '/';

  const handleSelectProfile = (profileId: string) => {
    switchProfile(profileId);
    navigate(returnTo);
  };

  const handleCreateDirect = async (tcg: TcgType) => {
    setCreating(true);
    const success = await createProfile(tcg);
    setCreating(false);
    if (success) {
      toast.success(`Perfil ${TCG_CONFIG[tcg].name} criado!`);
      navigate(returnTo);
    } else {
      toast.error('Erro ao criar perfil. Talvez já exista um para esse TCG.');
    }
  };

  const existingTcgs = new Set(profiles.map(p => p.tcg_type));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-gradient-mystic mb-2">DUELVERSE</h1>
        <p className="text-muted-foreground text-lg">Selecione seu perfil de jogo</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl w-full mb-8">
        {profiles.map(profile => {
          const config = TCG_CONFIG[profile.tcg_type as TcgType];
          if (!config) return null;
          return (
            <Card
              key={profile.id}
              className="cursor-pointer hover:border-primary/60 transition-all group card-mystic"
              onClick={() => handleSelectProfile(profile.id)}
            >
              <CardHeader className="pb-3">
                <div className={`${config.color} mb-2`}>{config.icon}</div>
                <CardTitle className="flex items-center gap-2">
                  {config.name}
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardTitle>
                <CardDescription>{profile.username}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="text-green-400">{profile.wins}W</span>
                  <span className="text-red-400">{profile.losses}L</span>
                  <span className="text-primary">{profile.points} pts</span>
                  <span className="flex items-center gap-1"><Crown className="w-3 h-3" /> Lv.{profile.level}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create new profile buttons */}
      <div className="flex flex-wrap gap-4 justify-center">
        {(Object.keys(TCG_CONFIG) as TcgType[])
          .filter(tcg => !existingTcgs.has(tcg))
          .map(tcg => (
            <Button
              key={tcg}
              variant="outline"
              onClick={() => handleCreateDirect(tcg)}
              className="gap-2"
              disabled={creating}
            >
              <Plus className="w-4 h-4" />
              {creating ? 'Criando...' : `Criar perfil ${TCG_CONFIG[tcg].name}`}
            </Button>
          ))
        }
      </div>

    </div>
  );
}