/**
 * Yu-Gi-Oh Remote Duel — Página SEO
 * URL: /yugioh-remote-duel
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { Swords, Crown } from "lucide-react";
import { SEOLinksSection } from "@/components/SEOLinksSection";

const YugiohRemoteDuel = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Yu-Gi-Oh Remote Duel — Duelos ao Vivo com Vídeo | Duelverse"
        description="Jogue Yu-Gi-Oh Remote Duel com videochamada no Duelverse. A melhor experiência de duelos remotos ao vivo, alternativa ao Dueling Book e Yu-Gi-Oh Omega."
        keywords="yugioh remote duel, yugioh remote, yugioh ao vivo, duelverse, yugioh discord, dueling book, yugioh omega"
        path="/yugioh-remote-duel"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Yu-Gi-Oh Remote Duel", path: "/yugioh-remote-duel" },
        ]}
      />

      <style>{`
        @keyframes tcg-color-cycle {
          0%, 100% { background: linear-gradient(135deg, hsl(270 80% 55% / 0.12) 0%, hsl(315 85% 60% / 0.08) 50%, transparent 100%); }
          33% { background: linear-gradient(135deg, hsl(45 95% 60% / 0.12) 0%, hsl(15 90% 50% / 0.08) 50%, transparent 100%); }
          66% { background: linear-gradient(135deg, hsl(50 100% 50% / 0.12) 0%, hsl(210 90% 50% / 0.08) 50%, transparent 100%); }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-0" style={{ 
        background: 'radial-gradient(ellipse at center, hsl(222 47% 11% / 0.97) 0%, hsl(222 47% 8% / 0.99) 50%, hsl(240 40% 5% / 1) 100%)',
        animation: 'tcg-color-cycle 9s ease-in-out infinite'
      }} />

      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden">
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            <span className="text-primary">Yu-Gi-Oh Remote Duel</span> ao Vivo
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Reviva a emoção dos duelos presenciais com <strong>Yu-Gi-Oh Remote Duel</strong> no Duelverse. 
            Videochamada integrada, regras oficiais e comunidade ativa para jogar <strong>yugioh ao vivo</strong>.
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              Começar a Duelar
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <article className="prose prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>Yu-Gi-Oh Remote Duel</strong> é a modalidade de duelos à distância que ganhou força durante 
              os últimos anos. Com ela, jogadores usam câmeras para mostrar suas cartas e jogam como se estivessem 
              sentados à mesma mesa. O <strong>Duelverse</strong> eleva essa experiência com videochamada integrada, 
              sistema de matchmaking e ferramentas exclusivas para <strong>yugioh remote</strong>.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">O que é Yu-Gi-Oh Remote Duel?</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Remote Duel é a forma de jogar <strong>Yu-Gi-Oh online</strong> mantendo a autenticidade do jogo 
              físico. Em vez de simuladores automatizados, você usa cartas reais (ou versões digitais exibidas na 
              câmera) e interage diretamente com o oponente. Essa modalidade é aprovada pela Konami para eventos 
              oficiais e é muito popular entre duelistas que valorizam a interação humana.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Como funciona o Remote Duel no Duelverse?</h2>
            <ol className="list-decimal pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Você entra na fila de <strong>yugioh remote</strong> ou aceita um desafio de amigo</li>
              <li>A videochamada inicia automaticamente dentro da sala de duelo</li>
              <li>Posicione sua câmera para mostrar campo, mão e deck ao oponente</li>
              <li>Comunique suas jogadas, ative efeitos e resolva dúvidas em tempo real</li>
              <li>Ao final, o resultado é registrado no ranking global</li>
            </ol>

            <h2 className="text-3xl font-bold mb-4 mt-10">Vantagens do Remote Duel no Duelverse</h2>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Experiência próxima do jogo físico com videochamada</li>
              <li>Matchmaking rápido para encontrar oponentes</li>
              <li>Suporte a múltiplos formatos: YGO Advanced, Rush Duel e Genesis</li>
              <li>Registro automático de resultados e estatísticas</li>
              <li>Integração com Discord para encontrar parceiros</li>
              <li>Torneios e eventos oficiais da comunidade</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Equipamento recomendado</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Para a melhor experiência de <strong>yugioh ao vivo</strong>, recomendamos:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Webcam ou câmera de celular com boa resolução</li>
              <li>Microfone claro para comunicação durante o duelo</li>
              <li>Iluminação estável para visualização das cartas</li>
              <li>Conexão de internet estável (mínimo 5 Mbps)</li>
              <li>Superfície plana e organizada para o campo de jogo</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Duelverse: a melhor alternativa para Remote Duel</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Embora existam outras ferramentas como <strong>Dueling Book</strong> e <strong>Yu-Gi-Oh Omega</strong>, 
              o <strong>Duelverse</strong> se destaca como a plataforma mais completa para <strong>Yu-Gi-Oh Remote 
              Duel</strong>. Combinamos tecnologia, comunidade e recursos sociais para oferecer a melhor experiência 
              de duelos remotos do mercado.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Comece seu Remote Duel agora</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Crie sua conta gratuita no Duelverse, entre na fila de <strong>yugioh remote</strong> e descubra por 
              que milhares de duelistas escolhem nossa plataforma para jogar <strong>Yu-Gi-Oh online</strong> todos 
              os dias.
            </p>
          </article>

          <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">Experimente o Remote Duel no Duelverse</h2>
            <p className="text-lg text-muted-foreground mb-6">Cadastre-se grátis e duelize ao vivo com videochamada.</p>
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
          <p className="text-sm text-muted-foreground">A melhor plataforma de Yu-Gi-Oh online.</p>
        </div>
      </footer>
    </div>
  );
};

export default YugiohRemoteDuel;
