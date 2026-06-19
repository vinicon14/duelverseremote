/**
 * Yu-Gi-Oh Omega Alternativa — Página SEO
 * Termo "yugioh omega" tem volume ~880/mês no Brasil (Semrush, KD 34).
 * URL: /yugioh-omega-alternativa
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { SEOLinksSection } from "@/components/SEOLinksSection";
import { Swords, Crown, Video, Trophy, Users, Zap, Check, X } from "lucide-react";

const YugiohOmegaAlternativa = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Yu-Gi-Oh Omega Alternativa — Duelverse com Vídeo ao Vivo | 2026"
        description="Alternativa ao Yu-Gi-Oh Omega: o Duelverse traz duelos remotos com videochamada, matchmaking, torneios e comunidade Discord. Online, no navegador, sem instalação."
        keywords="yugioh omega alternativa, yugioh omega, alternativa yugioh omega, duelverse, ygo omega, yugioh online sem download, yugioh remote"
        path="/yugioh-omega-alternativa"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Alternativa ao Yu-Gi-Oh Omega", path: "/yugioh-omega-alternativa" },
        ]}
      />

      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden bg-transparent">
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            A Melhor <span className="text-primary">Alternativa ao Yu-Gi-Oh Omega</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            O <strong>Duelverse</strong> é a alternativa moderna ao <strong>Yu-Gi-Oh Omega</strong>: zero download,
            funciona em qualquer dispositivo, duelos ao vivo com videochamada e torneios reais com premiação.
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              <Zap className="mr-2 h-5 w-5" />
              Jogar Agora no Navegador
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <article className="prose prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>Yu-Gi-Oh Omega</strong> (YGO Omega) é um simulador automatizado de Yu-Gi-Oh extremamente
              poderoso para teste de combos — mas exige download, instalação e configuração. O
              <strong> Duelverse</strong> é a alternativa para quem quer duelar <strong>online no navegador</strong>,
              ver o oponente por vídeo e fazer parte de uma comunidade ativa.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Quando o YGO Omega é melhor?</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>Yu-Gi-Oh Omega</strong> brilha quando você quer:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Testar combos solo com automação total de regras</li>
              <li>Praticar contra IA básica</li>
              <li>Acessar todas as cartas existentes offline</li>
              <li>Replays e análise pesada de jogadas</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Quando o Duelverse é melhor?</h2>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Duelar contra pessoas reais com videochamada</li>
              <li>Participar de torneios semanais com premiação</li>
              <li>Jogar no celular ou tablet sem instalar nada</li>
              <li>Conhecer outros duelistas no Discord oficial</li>
              <li>Acompanhar evolução em um ranking global</li>
              <li>Jogar formatos diferentes (Rush Duel, Genesis)</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Duelverse vs Yu-Gi-Oh Omega: comparação direta</h2>
            <div className="not-prose my-8 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-4 font-semibold">Recurso</th>
                    <th className="p-4 font-semibold text-primary">Duelverse</th>
                    <th className="p-4 font-semibold text-muted-foreground">YGO Omega</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    ["Funciona no navegador", true, false],
                    ["App mobile (Android/iOS)", true, false],
                    ["Videochamada ao vivo", true, false],
                    ["Matchmaking online", true, "Limitado"],
                    ["Torneios com premiação", true, false],
                    ["Ranking global", true, false],
                    ["Comunidade Discord oficial", true, false],
                    ["Automação completa de regras", "Parcial", true],
                    ["Banco de cartas offline", false, true],
                    ["Instalação necessária", false, true],
                    ["100% grátis", true, true],
                  ].map(([label, dv, om], i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="p-4">{label as string}</td>
                      <td className="p-4">{dv === true ? <Check className="text-primary inline" /> : dv === false ? <X className="text-destructive/60 inline" /> : <span className="text-primary">{dv}</span>}</td>
                      <td className="p-4">{om === true ? <Check className="text-muted-foreground inline" /> : om === false ? <X className="text-destructive/60 inline" /> : <span>{om}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="text-3xl font-bold mb-4 mt-10">A combinação perfeita: Omega + Duelverse</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              A maioria dos duelistas competitivos usa <strong>os dois</strong>. Treinam combos no
              <strong> Yu-Gi-Oh Omega</strong> (onde toda regra é automatizada) e migram para o
              <strong> Duelverse</strong> quando querem competir contra pessoas reais, participar de
              <Link to="/tournaments" className="text-primary hover:underline"> torneios</Link> ou apenas se divertir
              com a comunidade ao vivo.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Como começar no Duelverse em 1 minuto</h2>
            <ol className="list-decimal pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Acesse <Link to="/auth" className="text-primary hover:underline">duelverse.site</Link> no navegador</li>
              <li>Cadastre-se com e-mail, Google ou Discord</li>
              <li>Importe ou monte seu deck no <Link to="/deck-builder" className="text-primary hover:underline">deck builder</Link></li>
              <li>Entre no <Link to="/matchmaking" className="text-primary hover:underline">matchmaking</Link> e ative a câmera</li>
              <li>Duele ao vivo — sem instalar nada</li>
            </ol>

            <h2 className="text-3xl font-bold mb-4 mt-10">Perguntas frequentes</h2>
            <h3 className="text-2xl font-semibold mb-3 mt-6">O Duelverse roda no celular?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Sim. O <strong>Yu-Gi-Oh Omega</strong> não tem versão mobile, mas o Duelverse funciona em qualquer
              smartphone Android ou iOS, no navegador ou como PWA instalável.
            </p>
            <h3 className="text-2xl font-semibold mb-3 mt-6">Posso usar meu deck do Omega no Duelverse?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Sim. O deck builder do Duelverse aceita as mesmas cartas e segue a mesma banlist oficial,
              então sua decklist do Omega funciona aqui sem ajustes.
            </p>
          </article>

          <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">Duele sem instalar nada</h2>
            <p className="text-lg text-muted-foreground mb-6">Crie sua conta gratuita e jogue Yu-Gi-Oh online direto no navegador.</p>
            <Link to="/auth">
              <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                <Crown className="mr-2 h-5 w-5" />
                Criar Conta Grátis
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <SEOLinksSection />

      <footer className="border-t border-border py-10 px-4 relative z-10 mt-16">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Swords className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg">DUELVERSE</span>
          </div>
          <p className="text-sm text-muted-foreground">A alternativa moderna ao Yu-Gi-Oh Omega.</p>
        </div>
      </footer>
    </div>
  );
};

export default YugiohOmegaAlternativa;
