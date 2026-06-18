/**
 * Duelverse Discord — Página SEO
 * URL: /duelverse-discord
 * Página sobre a integração com Discord e comunidade oficial do Duelverse.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { SEOLinksSection } from "@/components/SEOLinksSection";
import { MessageCircle, Users, Video, Swords, Crown, Globe } from "lucide-react";

const DISCORD_INVITE_URL = "https://discord.gg/36dEAWAAR";

const DuelverseDiscord = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Comunidade Duelverse no Discord — Duelos Yu-Gi-Oh ao Vivo"
        description="Entre no Discord oficial do Duelverse. Comunidade de Yu-Gi-Oh online, torneios, avisos de duelos, suporte e integração completa com a plataforma de duelos remotos."
        keywords="duelverse discord, yugioh discord, comunidade yugioh, duelos yugioh online, torneios yugioh discord, remote duel discord"
        path="/duelverse-discord"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Discord Duelverse", path: "/duelverse-discord" },
        ]}
      />

      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden bg-transparent">
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/40 mb-6">
            <MessageCircle className="w-4 h-4 text-primary" />
            <span className="text-sm">Comunidade oficial</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            <span className="text-primary">Discord Duelverse</span> — Junte-se à Comunidade
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Participe do servidor oficial do <strong>Duelverse</strong> no Discord. Converse com outros duelistas, 
            receba avisos de <strong>torneios Yu-Gi-Oh</strong>, encontre adversários para <strong>duelos remotos ao vivo</strong> 
            e fique por dentro de todas as novidades da plataforma.
          </p>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              <MessageCircle className="mr-2 h-5 w-5" />
              Entrar no Discord
            </Button>
          </a>
        </div>
      </section>

      <section className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <article className="prose prose-invert max-w-none">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Por que entrar no Discord do Duelverse?</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>Discord do Duelverse</strong> é o centro da comunidade de jogadores de <strong>Yu-Gi-Oh online</strong>. 
              Lá você encontra outros duelistas, organiza partidas, acompanha campeonatos e recebe suporte direto da equipe.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-12 not-prose">
              {[
                { icon: Users, title: "Comunidade Ativa", desc: "Milhares de duelistas brasileiros e internacionais trocando dicas, decks e estratégias." },
                { icon: Video, title: "Duelos ao Vivo", desc: "Encontre adversários para duelos com videochamada e reviva a emoção dos duelos presenciais." },
                { icon: Swords, title: "Torneios e Eventos", desc: "Receba avisos exclusivos de torneios semanais de YGO Advanced, Rush Duel e Genesis." },
                { icon: Globe, title: "Suporte Multilíngue", desc: "Canais em português, inglês, espanhol, francês e japonês para atender duelistas do mundo todo." },
                { icon: Crown, title: "Ranking e Recompensas", desc: "Acompanhe seu progresso no ranking global e participe de eventos com premiação." },
                { icon: MessageCircle, title: "Integração Total", desc: "Receba notificações de convites de duelo, mensagens e atualizações diretamente no Discord." },
              ].map((feature, i) => (
                <div key={i} className="p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-all">
                  <feature.icon className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>

            <h2 className="text-3xl md:text-4xl font-bold mb-6">Integração Duelverse + Discord</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              A plataforma <strong>Duelverse</strong> possui integração nativa com o Discord. Isso significa que você pode:
            </p>
            <ul className="list-disc pl-6 text-lg text-muted-foreground space-y-2 mb-6">
              <li>Logar na plataforma usando sua conta do Discord</li>
              <li>Receber notificações de convites de duelo em tempo real</li>
              <li>Compartilhar suas vitórias e ranking com a comunidade</li>
              <li>Participar de torneios exclusivos para membros do Discord</li>
              <li>Usar o chat global do Duelverse sincronizado com canais do Discord</li>
            </ul>

            <h2 className="text-3xl md:text-4xl font-bold mb-6">Como entrar</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Clique no botão abaixo para acessar o convite oficial do servidor. É gratuito e não leva nem 1 minuto para participar:
            </p>

            <div className="text-center my-10 not-prose">
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Acessar Discord Oficial
                </Button>
              </a>
            </div>

            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Depois de entrar, leia as regras do servidor e apresente-se na sala de boas-vindas. Nossa equipe e moderadores 
              estão prontos para ajudar você a aproveitar tudo o que o <strong>Duelverse</strong> oferece.
            </p>
          </article>

          <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">Pronto para duelar?</h2>
            <p className="text-lg text-muted-foreground mb-6">Crie sua conta gratuita no Duelverse e entre na comunidade Discord.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth">
                <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  <Crown className="mr-2 h-5 w-5" />
                  Criar Conta Grátis
                </Button>
              </Link>
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="text-lg px-10 py-6 rounded-xl border-primary/40">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Discord
                </Button>
              </a>
            </div>
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

export default DuelverseDiscord;
