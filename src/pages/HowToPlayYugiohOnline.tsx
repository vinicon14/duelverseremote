/**
 * Como Jogar Yu-Gi-Oh Online — Página SEO
 * URL: /como-jogar-yugioh-online
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { Swords, ChevronDown, Crown } from "lucide-react";
import { SEOLinksSection } from "@/components/SEOLinksSection";

const HowToPlayYugiohOnline = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Como Jogar Yu-Gi-Oh Online em 2026 — Guia Completo | Duelverse"
        description="Aprenda como jogar Yu-Gi-Oh online com videochamada. Guia completo para iniciantes: criação de conta, deck builder, matchmaking e duelos remotos ao vivo no Duelverse."
        keywords="como jogar yugioh online, yugioh remote, yugioh ao vivo, duelverse, yugioh discord, yugioh omega, dueling book"
        path="/como-jogar-yugioh-online"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Como Jogar Yu-Gi-Oh Online", path: "/como-jogar-yugioh-online" },
        ]}
      />

      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden bg-transparent">
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            Como Jogar <span className="text-primary">Yu-Gi-Oh Online</span> em 2026
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Guia completo para começar a jogar <strong>Yu-Gi-Oh online</strong> com videochamada. 
            Do cadastro ao primeiro duelo remoto, aprenda tudo sobre o <strong>Duelverse</strong>, 
            a melhor alternativa ao <strong>Dueling Book</strong> e <strong>Yu-Gi-Oh Omega</strong>.
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              Criar Conta Grátis
            </Button>
          </Link>
          <div className="pt-8">
            <a href="#conteudo"><ChevronDown className="w-8 h-8 text-muted-foreground mx-auto animate-bounce" /></a>
          </div>
        </div>
      </section>

      <section id="conteudo" className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <article className="prose prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Jogar <strong>Yu-Gi-Oh online</strong> nunca foi tão fácil. Com o crescimento das plataformas de 
              duelos remotos, você pode enfrentar jogadores do mundo todo sem sair de casa. Neste guia completo, 
              vamos ensinar passo a passo como começar no <strong>Duelverse</strong>, a plataforma ideal para 
              <strong> yugioh remote</strong> com videochamada, comunidade ativa e torneios ao vivo.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">O que você precisa para jogar Yu-Gi-Oh online?</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Antes de começar, prepare o básico:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Um computador, celular ou tablet com acesso à internet</li>
              <li>Câmera e microfone funcionando (essencial para duelos ao vivo)</li>
              <li>Conta gratuita no <strong>Duelverse</strong></li>
              <li>Conhecimento básico das regras de Yu-Gi-Oh</li>
              <li>Seu próprio deck físico ou digital</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Passo 1: Crie sua conta no Duelverse</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Acesse a página de <Link to="/auth" className="text-primary hover:underline">cadastro</Link> e crie 
              sua conta em menos de 1 minuto. Você pode usar e-mail, Google ou Discord. Após confirmar seu e-mail, 
              personalize seu perfil de duelista e escolha seu avatar.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Passo 2: Escolha seu formato</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              O Duelverse oferece três formatos principais de <strong>Yu-Gi-Oh</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li><strong>YGO Advanced:</strong> o formato competitivo oficial com Forbidden &amp; Limited List</li>
              <li><strong>Rush Duel:</strong> regras simplificadas e dinâmicas, perfeito para jogos rápidos</li>
              <li><strong>Genesis:</strong> formato alternativo com regras exclusivas do Duelverse</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Passo 3: Monte seu deck</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Use o <Link to="/deck-builder" className="text-primary hover:underline">deck builder</Link> para 
              montar seu deck. Você pode buscar cartas por nome, atributo, tipo e efeito. Salve quantos decks 
              quiser e organize por formato. Se é iniciante, existem decks pré-construídos e sugestões da comunidade 
              no <strong>yugioh discord</strong> oficial.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Passo 4: Entre na fila de matchmaking</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Na aba <Link to="/matchmaking" className="text-primary hover:underline">Fila Rápida</Link>, escolha 
              o formato e clique em "Buscar Duelo". Nosso sistema encontra um oponente compatível com seu nível 
              em poucos segundos. Aceite o convite e prepare-se para o <strong>yugioh ao vivo</strong>.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Passo 5: Duelo ao vivo com videochamada</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Durante o duelo, a videochamada é ativada automaticamente. Posicione sua câmera sobre o campo de 
              jogo para que seu oponente veja suas cartas. Comunique suas jogadas, ative efeitos e divirta-se com 
              a experiência mais próxima de um duelo presencial.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Dicas para iniciantes em Yu-Gi-Oh online</h2>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Comece com decks simples e diretos antes de tentar combos complexos</li>
              <li>Leia as cartas do oponente com atenção durante o duelo</li>
              <li>Peça ajuda na comunidade Discord — os jogadores são acolhedores</li>
              <li>Assista replays das suas partidas para identificar erros</li>
              <li>Participe de torneios casuais para ganhar experiência</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Duelverse vs outras plataformas</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Enquanto o <strong>Dueling Book</strong> e o <strong>Yu-Gi-Oh Omega</strong> focam em simulação de 
              regras, o <strong>Duelverse</strong> prioriza a experiência social e os duelos ao vivo. Se você quer 
              ver seu oponente, conversar durante a partida e sentir a emoção de um torneio real, o Duelverse é 
              a escolha certa para o seu <strong>yugioh remote</strong>.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Pronto para começar?</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Agora que você sabe <strong>como jogar Yu-Gi-Oh online</strong>, é hora de colocar em prática. 
              Crie sua conta no Duelverse, monte seu deck e entre na fila de duelos. A comunidade está te esperando!
            </p>
          </article>

          <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">Comece sua jornada no Yu-Gi-Oh online</h2>
            <p className="text-lg text-muted-foreground mb-6">Cadastre-se gratuitamente e duelize com jogadores do mundo todo.</p>
            <Link to="/auth">
              <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                <Crown className="mr-2 h-5 w-5" />
                Jogar Agora
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

export default HowToPlayYugiohOnline;
