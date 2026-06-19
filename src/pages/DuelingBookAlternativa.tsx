/**
 * Dueling Book Alternativa — Página SEO
 * Termo "dueling book" tem volume ~1.000/mês no Brasil (Semrush, KD 42).
 * URL: /dueling-book-alternativa
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { SEOLinksSection } from "@/components/SEOLinksSection";
import { Swords, Crown, Video, Trophy, Users, Zap, Check, X } from "lucide-react";

const DuelingBookAlternativa = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Dueling Book Alternativa em 2026 — Duelverse com Vídeo ao Vivo"
        description="Procurando alternativa ao Dueling Book? O Duelverse oferece duelos de Yu-Gi-Oh online com videochamada, matchmaking instantâneo, torneios e ranking global. Grátis."
        keywords="dueling book alternativa, dueling book, alternativa dueling book, duelverse, yugioh online, yugioh remote, yugioh ao vivo"
        path="/dueling-book-alternativa"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Alternativa ao Dueling Book", path: "/dueling-book-alternativa" },
        ]}
      />

      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden bg-transparent">
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            A Melhor <span className="text-primary">Alternativa ao Dueling Book</span> em 2026
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            O <strong>Duelverse</strong> traz tudo o que o <strong>Dueling Book</strong> oferece — e adiciona videochamada
            ao vivo, matchmaking inteligente, ranking global e torneios com premiação. Tudo grátis.
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              <Zap className="mr-2 h-5 w-5" />
              Testar o Duelverse Grátis
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <article className="prose prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>Dueling Book</strong> foi por anos a principal plataforma para jogar <strong>Yu-Gi-Oh online</strong> gratuitamente. Sua interface clássica
              em estilo "tabletop" conquistou milhares de duelistas. Mas o cenário mudou: hoje, os jogadores querem
              <strong> duelos ao vivo com videochamada</strong>, sistema de ranking, torneios estruturados e uma comunidade ativa. É aí que entra o
              <strong> Duelverse</strong>, a alternativa moderna ao Dueling Book.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Por que procurar uma alternativa ao Dueling Book?</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O Dueling Book continua funcional, mas tem limitações importantes para quem busca a experiência completa de
              <strong> yugioh remote</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Não tem videochamada nativa — você joga sem ver o oponente</li>
              <li>Interface visual datada e pouco amigável em mobile</li>
              <li>Sistema de ranking limitado</li>
              <li>Sem torneios oficiais com premiação real</li>
              <li>Comunidade espalhada por fóruns externos</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Duelverse vs Dueling Book: comparação completa</h2>
            <div className="not-prose my-8 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-4 font-semibold">Recurso</th>
                    <th className="p-4 font-semibold text-primary">Duelverse</th>
                    <th className="p-4 font-semibold text-muted-foreground">Dueling Book</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    ["Videochamada ao vivo", true, false],
                    ["Matchmaking automático", true, false],
                    ["Ranking global", true, "Básico"],
                    ["Torneios com premiação", true, false],
                    ["App mobile (Android/iOS)", true, false],
                    ["Comunidade Discord integrada", true, false],
                    ["YGO Advanced, Rush Duel, Genesis", true, "Apenas Advanced"],
                    ["Deck Builder com IA", true, false],
                    ["100% grátis", true, true],
                    ["Suporte multilíngue", "16 idiomas", "Inglês"],
                  ].map(([label, dv, db], i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="p-4">{label as string}</td>
                      <td className="p-4">{dv === true ? <Check className="text-primary inline" /> : dv === false ? <X className="text-destructive/60 inline" /> : <span className="text-primary">{dv}</span>}</td>
                      <td className="p-4">{db === true ? <Check className="text-muted-foreground inline" /> : db === false ? <X className="text-destructive/60 inline" /> : <span>{db}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="text-3xl font-bold mb-4 mt-10">Como migrar do Dueling Book para o Duelverse</h2>
            <ol className="list-decimal pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Crie sua conta gratuita no <Link to="/auth" className="text-primary hover:underline">Duelverse</Link></li>
              <li>Importe seu deck no <Link to="/deck-builder" className="text-primary hover:underline">deck builder</Link> (ou use os pré-construídos)</li>
              <li>Entre no <Link to="/matchmaking" className="text-primary hover:underline">matchmaking</Link> e ative câmera/microfone</li>
              <li>Duele com videochamada — exatamente como num torneio presencial</li>
              <li>Participe dos <Link to="/tournaments" className="text-primary hover:underline">torneios semanais</Link> e suba no ranking</li>
            </ol>

            <h2 className="text-3xl font-bold mb-4 mt-10">Posso continuar usando o Dueling Book?</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Claro. Muitos jogadores usam o Dueling Book para testes rápidos de combo e migram para o
              <strong> Duelverse</strong> quando querem a experiência social — duelar ao vivo, sentir a emoção de um torneio,
              ver o oponente reagir à sua jogada. Não é uma escolha exclusiva, é uma evolução natural do
              <strong> yugioh online</strong>.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Perguntas frequentes</h2>
            <h3 className="text-2xl font-semibold mb-3 mt-6">O Duelverse é realmente grátis como o Dueling Book?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Sim, 100%. Você cria conta, duela, monta decks, participa de torneios gratuitos e usa toda a plataforma sem pagar.
              Existem planos PRO opcionais apenas para cosméticos e benefícios extras.
            </p>
            <h3 className="text-2xl font-semibold mb-3 mt-6">Preciso baixar algo?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Não. O Duelverse roda direto no navegador. Também há app PWA para Android, iOS e versão desktop Windows
              se preferir uma experiência nativa.
            </p>
            <h3 className="text-2xl font-semibold mb-3 mt-6">A banlist é a mesma do Dueling Book?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Sim. O <strong>Duelverse</strong> segue a Forbidden &amp; Limited List oficial da Konami para YGO Advanced.
              Para formatos alternativos (Rush Duel, Genesis) usamos as regras específicas de cada um.
            </p>
          </article>

          <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">Experimente a alternativa moderna ao Dueling Book</h2>
            <p className="text-lg text-muted-foreground mb-6">Crie sua conta grátis e duele ao vivo em menos de 1 minuto.</p>
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
          <p className="text-sm text-muted-foreground">A alternativa moderna ao Dueling Book.</p>
        </div>
      </footer>
    </div>
  );
};

export default DuelingBookAlternativa;
