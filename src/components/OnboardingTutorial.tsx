import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Swords, Layers, Trophy, Users, Sparkles, ShoppingBag, ChevronRight, ChevronLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingTutorialProps {
  userId?: string;
}

const STORAGE_KEY = "duelverse_onboarding_completed";

const steps = [
  {
    icon: Sparkles,
    title: "Bem-vindo ao Duelverse! ⚔️",
    body: "A plataforma definitiva para duelar Yu-Gi-Oh!, Magic: The Gathering e Pokémon TCG online com jogadores do mundo todo.",
    cta: "Vamos começar!",
  },
  {
    icon: Layers,
    title: "Monte seu Deck",
    body: "Use o Deck Builder para criar, salvar e organizar seus decks. Importe listas, reconheça cartas por foto com IA e mantenha múltiplos decks por TCG.",
    cta: "Próximo",
    route: "/deck-builder",
  },
  {
    icon: Swords,
    title: "Entre em Duelo",
    body: "Crie uma sala de duelo, jogue casual ou ranqueado, transmita vídeo/áudio com seu oponente em tempo real e ganhe XP em cada partida.",
    cta: "Próximo",
    route: "/duels",
  },
  {
    icon: Trophy,
    title: "Torneios e Ranking",
    body: "Participe de torneios semanais, ganhe DuelCoins e suba no ranking global da sua TCG favorita.",
    cta: "Próximo",
    route: "/tournaments",
  },
  {
    icon: Users,
    title: "Comunidade",
    body: "Adicione amigos, converse no chat global, mencione jogadores e acompanhe quem está online. Conecte seu Discord para mais recursos.",
    cta: "Próximo",
    route: "/friends",
  },
  {
    icon: ShoppingBag,
    title: "Loja e Recompensas",
    body: "Compre sleeves, playmats e itens cosméticos na loja. Complete missões diárias e ganhe 100 XP iniciais por criar sua conta!",
    cta: "Começar a duelar!",
    route: "/store",
  },
];

export const OnboardingTutorial = ({ userId }: OnboardingTutorialProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;
    const key = `${STORAGE_KEY}:${userId}`;
    if (localStorage.getItem(key) === "1") return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("created_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        const createdAt = data?.created_at ? new Date(data.created_at).getTime() : 0;
        const ageMs = Date.now() - createdAt;
        // show for accounts created in the last 7 days that haven't seen the tutorial
        if (createdAt && ageMs < 7 * 24 * 60 * 60 * 1000) {
          setOpen(true);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const finish = () => {
    if (userId) localStorage.setItem(`${STORAGE_KEY}:${userId}`, "1");
    setOpen(false);
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  const handleNext = () => {
    if (isLast) {
      finish();
      if (current.route) navigate(current.route);
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent className="max-w-md rounded-2xl border border-primary/30 bg-card p-0 overflow-hidden">
        <button
          onClick={finish}
          aria-label="Pular tutorial"
          className="absolute right-3 top-3 z-10 rounded-full bg-background/60 p-1.5 text-muted-foreground hover:text-foreground transition"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-6 pt-8 pb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary">
            <Icon className="h-8 w-8" />
          </div>
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-bold text-center">{current.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground text-center leading-relaxed">
              {current.body}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <Progress value={progress} className="h-1.5" />
          <p className="text-center text-xs text-muted-foreground">
            Passo {step + 1} de {steps.length}
          </p>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>

            <button
              onClick={finish}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Pular tutorial
            </button>

            <Button onClick={handleNext} size="sm" className="gap-1 btn-mystic">
              {current.cta}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingTutorial;
