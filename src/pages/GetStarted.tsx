import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Crown,
  Monitor,
  QrCode,
  ShieldCheck,
  Smartphone,
  Swords,
  Trophy,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { withCampaignParams } from "@/utils/campaignParams";

const steps = [
  {
    icon: UserPlus,
    title: "Crie sua conta",
    description: "Cadastre-se ou entre e escolha o TCG do seu perfil.",
  },
  {
    icon: Camera,
    title: "Prepare sua mesa",
    description: "No computador, posicione a câmera para mostrar seu campo e suas cartas físicas.",
  },
  {
    icon: Swords,
    title: "Encontre um duelo",
    description: "Use o matchmaking no computador ou aceite o desafio de outro duelista.",
  },
];

const faqs = [
  {
    question: "O que preciso para jogar?",
    answer: "Um computador com internet estável, câmera, microfone, suas cartas físicas e uma mesa bem iluminada.",
  },
  {
    question: "Posso criar uma partida pelo celular?",
    answer: "Não. O matchmaking e a entrada em partidas são feitos no computador. O celular pode funcionar como câmera auxiliar.",
  },
  {
    question: "Como uso o celular como câmera?",
    answer: "No computador, abra Conectar celular. Depois, use o celular para ler o QR Code e iniciar a transmissão da câmera.",
  },
  {
    question: "Como encontro meu primeiro duelo?",
    answer: "Depois de entrar pelo computador, acesse as partidas para usar o matchmaking ou receber um desafio de outro jogador.",
  },
];

const GetStarted = () => {
  const location = useLocation();
  const campaignLink = (path: string) => withCampaignParams(path, location.search);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Como começar no Duelverse | Remote Duel com cards físicos"
        description="Prepare seus cards físicos, conecte sua câmera e comece seu primeiro Remote Duel no Duelverse pelo computador."
        path="/comece"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Como começar", path: "/comece" },
        ]}
      />

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between gap-3 px-4" aria-label="Navegação principal">
          <Link to={campaignLink("/")} className="flex min-w-0 items-center gap-2" aria-label="DuelVerse — início">
            <img src="/favicon.png" alt="" className="h-8 w-8 shrink-0" />
            <span className="truncate text-lg font-black tracking-[0.16em] text-primary">DUELVERSE</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to={campaignLink("/auth")}>Entrar</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="border-b border-border px-4 py-14 sm:py-20 lg:py-24">
          <div className="container mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="max-w-3xl">
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">Remote Duel no DuelVerse</p>
              <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
                Seu próximo duelo começa aqui
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Jogue com seus cards físicos em uma mesa real. A câmera mostra seu campo ao oponente enquanto o DuelVerse conecta vocês ao vivo.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="btn-mystic min-h-12 w-full sm:w-auto">
                  <Link to={campaignLink("/auth")}>
                    Criar conta ou entrar
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="min-h-12 w-full sm:w-auto">
                  <Link to={campaignLink("/tournaments")}>
                    <Trophy className="mr-2 h-5 w-5" />
                    Ver torneios
                  </Link>
                </Button>
              </div>
              <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                O matchmaking e a entrada em partidas são feitos no computador.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-lg" aria-label="Representação de uma mesa de Remote Duel">
              <div className="aspect-[4/3] overflow-hidden rounded-lg border border-primary/30 bg-card p-4 shadow-[0_24px_70px_-32px_hsl(var(--primary)/0.55)] sm:p-6">
                <div className="flex h-full flex-col rounded-md border border-border bg-background/60 p-3 sm:p-5">
                  <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="h-2 w-2 rounded-full bg-primary" /> AO VIVO
                    </div>
                    <Camera className="h-5 w-5 text-primary" />
                  </div>
                  <div className="grid flex-1 grid-cols-5 gap-2" aria-hidden="true">
                    {Array.from({ length: 15 }).map((_, index) => (
                      <div key={index} className="rounded-sm border border-primary/25 bg-primary/10" />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3 rounded-md border border-border bg-card p-3">
                    <QrCode className="h-8 w-8 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">Câmera auxiliar</p>
                      <p className="text-xs text-muted-foreground">Conecte o celular pelo QR Code</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20" aria-labelledby="steps-title">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">Primeiro duelo</p>
              <h2 id="steps-title" className="mt-2 text-3xl font-bold sm:text-4xl">Comece em três passos</h2>
            </div>
            <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="bg-card p-6 sm:p-8">
                  <div className="mb-6 flex items-center justify-between">
                    <step.icon className="h-7 w-7 text-primary" />
                    <span className="text-sm font-bold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y border-border bg-card/40 px-4 py-16 sm:py-20" aria-labelledby="setup-title">
          <div className="container mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">Sua configuração</p>
              <h2 id="setup-title" className="mt-2 text-3xl font-bold sm:text-4xl">Cards na mesa. Partida na tela.</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Use uma webcam no computador ou conecte a câmera do celular pelo QR Code. Mantenha o campo enquadrado e bem iluminado para o oponente acompanhar as jogadas.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {["Computador ou notebook", "Internet estável", "Câmera e microfone", "Cards físicos e boa iluminação"].map((item) => (
                <li key={item} className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-background p-4">
                  <Check className="h-5 w-5 shrink-0 text-primary" />
                  <span className="font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20" aria-labelledby="faq-title">
          <div className="container mx-auto max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Antes de entrar</p>
            <h2 id="faq-title" className="mt-2 text-3xl font-bold sm:text-4xl">Perguntas frequentes</h2>
            <div className="mt-8 divide-y divide-border border-y border-border">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    {faq.question}
                    <ChevronDown className="h-5 w-5 shrink-0 text-primary transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="max-w-3xl pb-5 pr-8 leading-relaxed text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-4 py-16 sm:py-20">
          <div className="container mx-auto max-w-4xl text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-5 text-3xl font-bold sm:text-4xl">Prepare a mesa e entre no DuelVerse</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Acesse pelo computador para encontrar seu primeiro oponente.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="btn-mystic min-h-12">
                <Link to={campaignLink("/auth")}>Criar conta ou entrar</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12">
                <Link to={campaignLink("/go-pro")}>
                  <Crown className="mr-2 h-5 w-5" />
                  Conhecer planos Pro
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8">
        <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} DuelVerse</span>
          <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> duelverse.site</span>
        </div>
      </footer>
    </div>
  );
};

export default GetStarted;