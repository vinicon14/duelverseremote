/**
 * Duelverse SEO Landing Page
 * Página otimizada para SEO orgânico em nichos de Yu-Gi-Oh online
 * URL: /duelverse-yugioh-duelos-online
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import {
  Swords, Trophy, Users, Video, Zap, Shield,
  Star, TrendingUp, Gamepad2, Crown, ChevronDown,
  Globe, MessageCircle, Monitor, Smartphone
} from "lucide-react";

const LandingSEO = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        tKey="home"
        path="/duelverse-yugioh-duelos-online"
        gameSchema={true}
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Yu-Gi-Oh Online", path: "/duelverse-yugioh-duelos-online" },
        ]}
      />

      <style>{`
        @keyframes tcg-color-cycle {
          0%, 100% { background: linear-gradient(135deg, hsl(270 80% 55% / 0.12) 0%, hsl(315 85% 60% / 0.08) 50%, transparent 100%); }
          33% { background: linear-gradient(135deg, hsl(45 95% 60% / 0.12) 0%, hsl(15 90% 50% / 0.08) 50%, transparent 100%); }
          66% { background: linear-gradient(135deg, hsl(50 100% 50% / 0.12) 0%, hsl(210 90% 50% / 0.08) 50%, transparent 100%); }
        }
        @keyframes tcg-text-cycle {
          0%, 100% { color: hsl(270 80% 65%); text-shadow: 0 0 20px hsl(270 80% 55% / 0.5); }
          33% { color: hsl(35 90% 55%); text-shadow: 0 0 20px hsl(35 90% 50% / 0.5); }
          66% { color: hsl(45 100% 55%); text-shadow: 0 0 20px hsl(45 100% 50% / 0.5); }
        }
        .tcg-text-animate { animation: tcg-text-cycle 9s ease-in-out infinite; }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-0" style={{ 
        background: 'radial-gradient(ellipse at center, hsl(222 47% 11% / 0.97) 0%, hsl(222 47% 8% / 0.99) 50%, hsl(240 40% 5% / 1) 100%)',
        animation: 'tcg-color-cycle 9s ease-in-out infinite'
      }} />

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden">
        <div className="container mx-auto relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border text-xs sm:text-sm border-primary/40 animate-fade-in-up">
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>A plataforma definitiva para duelos de Yu-Gi-Oh online</span>
            </div>
            
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight animate-fade-in-up delay-100">
              <span className="tcg-text-animate">Duelverse</span> — A Melhor Plataforma de{" "}
              <span className="text-foreground">Yu-Gi-Oh Online</span> para Duelos ao Vivo
            </h1>
            
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2 animate-fade-in-up delay-200">
              Duelverse revoluciona a forma como você joga <strong>Yu-Gi-Oh online</strong>. 
              Nossa plataforma oferece duelos remotos ao vivo com videochamada, matchmaking instantâneo, 
              torneios semanais e uma comunidade ativa no Discord. Seja você fã de <strong>YGO Advanced</strong>, 
              Rush Duel ou Genesis, aqui é o seu lugar para duelar.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-2 animate-fade-in-up delay-300">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="text-primary-foreground text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6 rounded-xl w-full sm:w-auto bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  <Zap className="mr-2 h-5 w-5 shrink-0" />
                  Começar a Duelar Grátis
                </Button>
              </Link>
              <a href="#o-que-e-duelverse" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-xl w-full sm:w-auto border-primary/40">
                  Saiba Mais
                </Button>
              </a>
            </div>

            <div className="pt-6 sm:pt-8">
              <a href="#conteudo">
                <ChevronDown className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground mx-auto animate-bounce" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section id="conteudo" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          
          <article className="prose prose-invert max-w-none">
            
            <h2 id="o-que-e-duelverse" className="text-3xl md:text-4xl font-bold mb-6">
              O que é o <span className="tcg-text-animate">Duelverse</span>?
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>Duelverse</strong> é uma plataforma completa de <strong>Yu-Gi-Oh online</strong> 
              desenvolvida para duelistas que buscam uma experiência autêntica, social e competitiva. 
              Diferente de simuladores automatizados, o Duelverse foca em <strong>duelos ao vivo</strong> 
              com videochamada, onde você pode ver seu oponente, conversar em tempo real e jogar exatamente 
              como numa mesa física — mas de qualquer lugar do mundo.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Se você procura uma alternativa ao <strong>Dueling Book</strong>, ao <strong>Yu-Gi-Oh Omega</strong> 
              ou ao <strong>Yu-Gi-Oh Remote Duel</strong> oficial, o Duelverse oferece uma interface moderna, 
              sistema de amigos, ranking global, loja de itens, torneios com premiação e integração com Discord. 
              É a evolução dos duelos remotos de cartas.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mb-6 mt-12">
              Por que escolher o Duelverse para jogar Yu-Gi-Oh?
            </h2>
            
            <h3 className="text-2xl font-semibold mb-4 mt-8">Duelos remotos com videochamada em tempo real</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              A essência do <strong>yugioh remote</strong> está na interação humana. No Duelverse, cada duelo 
              acontece com <strong>videochamada integrada</strong>, permitindo que você leia o oponente, negocie 
              jogadas e reviva a emoção dos torneios presenciais. Não há substituto para ver a reação do adversário 
              quando você ativa sua carta armadilha favorita.
            </p>

            <h3 className="text-2xl font-semibold mb-4 mt-8">Matchmaking inteligente e ranking global</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Nosso sistema de <strong>matchmaking</strong> encontra oponentes compatíveis com seu nível em segundos. 
              Suba no <strong>ranking global de Yu-Gi-Oh</strong>, desbloqueie conquistas e prove que você é o melhor 
              duelista da plataforma. Compita em YGO Advanced, Rush Duel e Genesis com regras atualizadas.
            </p>

            <h3 className="text-2xl font-semibold mb-4 mt-8">Torneios semanais e eventos ao vivo</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Participe de <strong>torneios de Yu-Gi-Oh</strong> gratuitos e pagos com premiação real. 
              Nossos eventos acontecem regularmente e são transmitidos para a comunidade. Se você adora 
              <strong> yugioh ao vivo</strong>, vai se sentir em casa nos campeonatos Duelverse.
            </p>

            <h3 className="text-2xl font-semibold mb-4 mt-8">Comunidade ativa no Discord</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>yugioh discord</strong> do Duelverse é o coração da nossa comunidade. Lá você encontra 
              parceiros de duelo, discute o meta, recebe avisos de torneios e interage diretamente com a equipe. 
              Junte-se a milhares de duelistas apaixonados por cartas.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mb-6 mt-12">
              Duelverse vs Dueling Book vs Yu-Gi-Oh Omega
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O mercado de plataformas de <strong>Yu-Gi-Oh online</strong> possui várias opções. O <strong>Dueling Book</strong> 
              é conhecido pela comunidade competitiva, enquanto o <strong>Yu-Gi-Oh Omega</strong> oferece automação 
              avançada. O <strong>Duelverse</strong> se diferencia ao combinar:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Videochamada nativa para duelos mais imersivos</li>
              <li>Sistema de amigos e chat integrado</li>
              <li>Torneios com estrutura profissional e premiação</li>
              <li>Loja virtual com itens cosméticos e benefícios PRO</li>
              <li>Deck builders específicos para cada formato</li>
              <li>App para Android, iOS e desktop (Windows)</li>
              <li>Integração completa com Discord</li>
            </ul>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Nossa proposta não é substituir outras ferramentas, mas oferecer a experiência mais completa para 
              quem quer jogar <strong>yugioh remote</strong> com pessoas reais, em tempo real e com recursos sociais.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mb-6 mt-12">
              Formatos de jogo suportados
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O Duelverse suporta os principais formatos de <strong>Yu-Gi-Oh</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li><strong>YGO Advanced</strong>: o formato competitivo oficial com Forbidden &amp; Limited List atualizada</li>
              <li><strong>Rush Duel</strong>: formato dinâmico e acessível introduzido em Yu-Gi-Oh! SEVENS</li>
              <li><strong>Genesis</strong>: formato alternativo com regras próprias para experiências variadas</li>
            </ul>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Cada formato possui seu próprio <Link to="/deck-builder" className="text-primary hover:underline">deck builder</Link>, 
              ranking e torneios. Assim, você pode escolher onde quer se especializar ou jogar todos.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mb-6 mt-12">
              Como começar a duelar no Duelverse
            </h2>
            <ol className="list-decimal pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Crie sua conta gratuita em menos de 1 minuto</li>
              <li>Escolha seu formato favorito: YGO Advanced, Rush Duel ou Genesis</li>
              <li>Monte seu deck no <Link to="/deck-builder" className="text-primary hover:underline">deck builder</Link></li>
              <li>Entre na fila de matchmaking ou desafie um amigo</li>
              <li>Inicie o duelo com videochamada e prove suas habilidades</li>
            </ol>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              É simples, rápido e 100% gratuito para começar. Se você quer evoluir como duelista, 
              participe dos <Link to="/tournaments" className="text-primary hover:underline">torneios semanais</Link> 
              e acompanhe seu progresso no <Link to="/ranking" className="text-primary hover:underline">ranking global</Link>.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mb-6 mt-12">
              Yu-Gi-Oh ao vivo: assista, aprenda e participe
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O conteúdo de <strong>yugioh ao vivo</strong> nunca esteve tão acessível. No Duelverse, 
              grandes torneios são transmitidos, duelistas criam salas abertas para espectadores e a comunidade 
              compartilha replays das melhores partidas. Assista aos melhores jogadores, aprenda estratégias 
              novas e depois coloque em prática na sua próxima partida.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mb-6 mt-12">
              Perguntas frequentes sobre Yu-Gi-Oh online no Duelverse
            </h2>
            
            <h3 className="text-2xl font-semibold mb-4 mt-8">O Duelverse é gratuito?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Sim! Você pode criar sua conta, duelar, participar de torneios e usar o deck builder gratuitamente. 
              Existem planos PRO opcionais que oferecem benefícios cosméticos e prioridades, mas o núcleo do jogo é free-to-play.
            </p>

            <h3 className="text-2xl font-semibold mb-4 mt-8">Preciso baixar algum programa?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Não necessariamente. O Duelverse funciona diretamente no navegador. Também oferecemos apps para 
              Windows, Android e iOS para quem prefere uma experiência nativa.
            </p>

            <h3 className="text-2xl font-semibold mb-4 mt-8">O Duelverse substitui o Yu-Gi-Oh Omega?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O <strong>Yu-Gi-Oh Omega</strong> é focado em simulação automatizada de regras. O Duelverse foca 
              em duelos ao vivo com videochamada e interação social. Muitos jogadores usam ambos: treinam no Omega 
              e competem no Duelverse, onde a comunicação e a leitura do oponente fazem toda a diferença.
            </p>

            <h3 className="text-2xl font-semibold mb-4 mt-8">Como entro no Discord do Duelverse?</h3>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Após criar sua conta, você encontra o link de convite do nosso <strong>yugioh discord</strong> 
              diretamente na plataforma. Lá você pode encontrar parceiros de duelo, tirar dúvidas e participar 
              de eventos exclusivos da comunidade.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mb-6 mt-12">
              Domine o meta de Yu-Gi-Oh com o Duelverse
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O meta de <strong>Yu-Gi-Oh</strong> muda constantemente com novos boosters, banlists e estratégias. 
              No Duelverse, você encontra notícias atualizadas, análises de decks, relatórios de torneios e 
              discussões ativas com a comunidade. Mantenha seus decks afiados e esteja sempre um passo à frente 
              dos adversários.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Não importa se você é um iniciante descobrindo as primeiras cartas ou um veterano de campeonatos: 
              o <strong>Duelverse</strong> foi feito para todos os duelistas. Junte-se a nós e transforme sua 
              experiência de <strong>Yu-Gi-Oh online</strong>.
            </p>

          </article>

          {/* CTA Final */}
          <div className="mt-16 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Pronto para começar seus duelos de Yu-Gi-Oh?
            </h2>
            <p className="text-lg text-muted-foreground mb-6 max-w-xl mx-auto">
              Crie sua conta gratuita no Duelverse agora e descubra por que somos a melhor escolha para 
              <strong> yugioh remote</strong>, torneios ao vivo e comunidade no Discord.
            </p>
            <Link to="/auth">
              <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                <Crown className="mr-2 h-5 w-5" />
                Criar Conta Grátis
              </Button>
            </Link>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
            {[
              { icon: Video, title: "Duelos por Vídeo", desc: "Videochamada integrada para duelos imersivos de Yu-Gi-Oh ao vivo." },
              { icon: Trophy, title: "Torneios Semanais", desc: "Campeonatos regulares com premiação e ranking global." },
              { icon: Users, title: "Comunidade Discord", desc: "Milhares de duelistas conectados no yugioh discord oficial." },
              { icon: TrendingUp, title: "Ranking Global", desc: "Escale o ranking e prove que você é o melhor duelista." },
              { icon: Gamepad2, title: "Múltiplos Formatos", desc: "YGO Advanced, Rush Duel e Genesis em uma só plataforma." },
              { icon: Shield, title: "Regras Atualizadas", desc: "Banlists e regras sempre sincronizadas com o meta atual." },
            ].map((feature, i) => (
              <div key={i} className="p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-all">
                <feature.icon className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 px-4 relative z-10 mt-16">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Swords className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg">DUELVERSE</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            A melhor plataforma de Yu-Gi-Oh online. Duelos ao vivo, torneios, ranking global e comunidade Discord.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingSEO;
