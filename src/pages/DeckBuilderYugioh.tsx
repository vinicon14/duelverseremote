/**
 * Deck Builder Yu-Gi-Oh — Página SEO
 * URL: /deck-builder-yugioh
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { Swords, Crown } from "lucide-react";
import { SEOLinksSection } from "@/components/SEOLinksSection";

const DeckBuilderYugioh = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Deck Builder Yu-Gi-Oh Online — Monte Decks Competitivos | Duelverse"
        description="Use o deck builder Yu-Gi-Oh do Duelverse para criar decks de YGO Advanced, Rush Duel e Genesis. Ferramenta gratuita com busca, filtros e compartilhamento."
        keywords="deck builder yugioh, yugioh deck builder, yugioh online, yugioh remote, duelverse, dueling book, yugioh omega"
        path="/deck-builder-yugioh"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Deck Builder Yu-Gi-Oh", path: "/deck-builder-yugioh" },
        ]}
      />

      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden bg-transparent">
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            Deck Builder <span className="text-primary">Yu-Gi-Oh</span> Online
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Crie, salve e compartilhe decks competitivos de <strong>Yu-Gi-Oh</strong> com o deck builder do 
            <strong> Duelverse</strong>. Suporte para YGO Advanced, Rush Duel e Genesis.
          </p>
          <Link to="/deck-builder">
            <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              Abrir Deck Builder
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <article className="prose prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Um bom <strong>deck builder Yu-Gi-Oh</strong> é essencial para qualquer duelista que quer competir. 
              No <strong>Duelverse</strong>, nossa ferramenta de construção de decks foi projetada para ser rápida, 
              intuitiva e completa. Seja você um jogador casual ou um competidor de alto nível, nosso 
              <strong> yugioh deck builder</strong> oferece tudo o que você precisa para criar estratégias vencedoras.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Por que usar o Deck Builder do Duelverse?</h2>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Interface moderna e responsiva para desktop e mobile</li>
              <li>Banco de dados com milhares de cartas de Yu-Gi-Oh</li>
              <li>Filtros por atributo, tipo, nível, efeito e formato</li>
              <li>Validação automática de deck para cada formato</li>
              <li>Salvamento ilimitado de decks na nuvem</li>
              <li>Compartilhamento fácil com amigos e comunidade</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Como montar um deck competitivo</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              A construção de um deck vencedor em <strong>Yu-Gi-Oh</strong> segue princípios claros. No formato 
              <strong> YGO Advanced</strong>, a maioria dos decks competitivos tem 40 cartas principais, 15 cartas 
              no Extra Deck e 15 no Side Deck. A proporção ideal varia conforme a estratégia, mas geralmente inclui:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li><strong>Engines:</strong> conjuntos de cartas que geram vantagem e estabilidade</li>
              <li><strong>Handtraps:</strong> cartas que interrompem o oponente na mão</li>
              <li><strong>Removal:</strong> magias e armadilhas para limpar o campo adversário</li>
              <li><strong>Extra Deck:</strong> monstruos de fusão, synchro, xyz, pendulum e link</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Formatos suportados</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Nosso <strong>deck builder yugioh</strong> suporta os três formatos do Duelverse:
            </p>
            <h3 className="text-2xl font-semibold mb-3 mt-6">YGO Advanced</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O formato oficial competitivo. Use a Forbidden &amp; Limited List mais recente e monte decks alinhados 
              ao meta atual. Ideal para quem quer jogar <strong>yugioh remote</strong> sério e participar de torneios.
            </p>
            <h3 className="text-2xl font-semibold mb-3 mt-6">Rush Duel</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Regras simplificadas com invocações ilimitadas por turno. Perfeito para partidas rápidas e para 
              iniciantes que querem aprender <strong>Yu-Gi-Oh online</strong> sem complexidade excessiva.
            </p>
            <h3 className="text-2xl font-semibold mb-3 mt-6">Genesis</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Formato alternativo exclusivo do Duelverse, com regras próprias e pool de cartas personalizado. 
              Uma experiência diferente para jogadores experientes.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Compartilhe seus decks</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Depois de montar seu deck, compartilhe com a comunidade no <strong>yugioh discord</strong> do 
              Duelverse. Receba feedback, descubra melhorias e inspire outros jogadores. Os decks mais populares 
              são destacados na plataforma.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Comece a construir agora</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Acesse o <Link to="/deck-builder" className="text-primary hover:underline">deck builder</Link> do 
              Duelverse e crie seu primeiro deck. É gratuito, rápido e a melhor forma de se preparar para os 
              duelos ao vivo.
            </p>
          </article>

          <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">Crie seu deck Yu-Gi-Oh agora</h2>
            <p className="text-lg text-muted-foreground mb-6">Use o deck builder gratuito do Duelverse.</p>
            <Link to="/deck-builder">
              <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                <Crown className="mr-2 h-5 w-5" />
                Abrir Deck Builder
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
          <p className="text-sm text-muted-foreground">A melhor plataforma de Yu-Gi-Oh online.</p>
        </div>
      </footer>
    </div>
  );
};

export default DeckBuilderYugioh;
