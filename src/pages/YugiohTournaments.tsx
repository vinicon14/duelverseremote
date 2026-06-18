/**
 * Torneios de Yu-Gi-Oh Online — Página SEO
 * URL: /torneios-yugioh-online
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { Swords, Crown } from "lucide-react";
import { SEOLinksSection } from "@/components/SEOLinksSection";

const YugiohTournaments = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Torneios de Yu-Gi-Oh Online — Campeonatos ao Vivo | Duelverse"
        description="Participe de torneios de Yu-Gi-Oh online no Duelverse. Eventos semanais de YGO Advanced, Rush Duel e Genesis com premiação, ranking e transmissões ao vivo."
        keywords="torneios yugioh online, yugioh ao vivo, yugioh remote, duelverse, yugioh discord, dueling book, yugioh omega"
        path="/torneios-yugioh-online"
        breadcrumbs={[
          { name: "Início", path: "/" },
          { name: "Torneios Yu-Gi-Oh Online", path: "/torneios-yugioh-online" },
        ]}
      />

      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden bg-transparent">
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            Torneios de <span className="text-primary">Yu-Gi-Oh Online</span> ao Vivo
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Compita nos melhores <strong>torneios de Yu-Gi-Oh</strong> da internet. Eventos semanais, premiação real, 
            transmissões de <strong>yugioh ao vivo</strong> e ranking global no <strong>Duelverse</strong>.
          </p>
          <Link to="/tournaments">
            <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
              Ver Torneios
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-16 px-4 relative z-10">
        <div className="container mx-auto max-w-4xl">
          <article className="prose prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Os <strong>torneios de Yu-Gi-Oh online</strong> se tornaram uma parte fundamental da comunidade de 
              card games. Com o <strong>Duelverse</strong>, você pode participar de campeonatos estruturados sem 
              sair de casa, enfrentar os melhores duelistas e ainda assistir às finais em <strong>yugioh ao vivo</strong>.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Tipos de torneios no Duelverse</h2>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li><strong>Torneios Semanais:</strong> eventos regulares gratuitos para todos os formatos</li>
              <li><strong>Torneios Pagos:</strong> campeonatos com premiação em dinheiro ou itens raros</li>
              <li><strong>Torneios por Convite:</strong> eventos exclusivos para jogadores de alto ranking</li>
              <li><strong>Eventos Especiais:</strong> celebrações de novas expansões e parcerias</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Como participar de um torneio</h2>
            <ol className="list-decimal pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Acesse a página de <Link to="/tournaments" className="text-primary hover:underline">torneios</Link></li>
              <li>Escolha o evento do formato desejado (YGO Advanced, Rush Duel ou Genesis)</li>
              <li>Leia as regras e confirme sua inscrição</li>
              <li>Prepare seu deck e esteja online no horário do torneio</li>
              <li>Duele nas rodadas e avance pelo bracket</li>
            </ol>

            <h2 className="text-3xl font-bold mb-4 mt-10">Premiação e ranking</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Os vencedores dos torneios Duelverse recebem premiação variada: DuelCoins, itens cosméticos exclusivos, 
              planos PRO e, em eventos pagos, dinheiro real. Além disso, cada participação e vitória contam pontos 
              para o <Link to="/ranking" className="text-primary hover:underline">ranking global</Link>, destacando 
              os melhores duelistas da plataforma.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Transmissões ao vivo</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              As finais dos principais torneios são transmitidas em <strong>yugioh ao vivo</strong> para toda a 
              comunidade. Com narração, comentários e interação no chat, você sente a emoção de um grande evento 
              presencial. Siga nosso canal no <strong>yugioh discord</strong> para não perder as transmissões.
            </p>

            <h2 className="text-3xl font-bold mb-4 mt-10">Dicas para vencer torneios</h2>
            <ul className="list-disc pl-6 space-y-3 text-lg text-muted-foreground mb-6">
              <li>Estude o meta atual e prepare um Side Deck eficiente</li>
              <li>Treine contra diferentes decks antes do evento</li>
              <li>Mantenha a calma e gerencie bem o tempo de cada partida</li>
              <li>Conheça as regras específicas do torneio</li>
              <li>Participe de eventos menores para ganhar experiência</li>
            </ul>

            <h2 className="text-3xl font-bold mb-4 mt-10">Participe do próximo torneio</h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Não fique de fora. Os <strong>torneios de Yu-Gi-Oh online</strong> do Duelverse acontecem toda semana 
              e são a melhor oportunidade para testar suas habilidades, conhecer jogadores e conquistar prêmios. 
              Inscreva-se agora e mostre do que você é capaz.
            </p>
          </article>

          <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 text-center">
            <h2 className="text-3xl font-bold mb-4">Inscreva-se no próximo torneio</h2>
            <p className="text-lg text-muted-foreground mb-6">Veja os eventos disponíveis e garanta sua vaga.</p>
            <Link to="/tournaments">
              <Button size="lg" className="text-primary-foreground text-lg px-10 py-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                <Crown className="mr-2 h-5 w-5" />
                Ver Torneios
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

export default YugiohTournaments;
