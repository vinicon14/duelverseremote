/**
 * DuelVerse - Landing Page
 * Desenvolvido por Vinícius
 * 
 * Página inicial pública com informações sobre a plataforma.
 * Exibe funcionalidades, call-to-action para login/cadastro.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Swords, Trophy, Users, Video, Zap, Shield } from "lucide-react";

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzgwNTBhMCIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20" />
        
        <div className="container mx-auto relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8 animate-slide-up">
            <div className="inline-block mb-4">
              <div className="w-24 h-24 mx-auto rounded-full bg-primary/20 flex items-center justify-center animate-glow-pulse">
                <Swords className="w-12 h-12 text-primary" />
              </div>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold">
              <span className="text-gradient-mystic">DUELVERSE</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              A plataforma definitiva para duelos de Yu-Gi-Oh ao vivo com chamadas de vídeo
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/matchmaking">
                <Button size="lg" className="btn-mystic text-white text-lg px-8">
                  <Zap className="mr-2 h-5 w-5" />
                  Encontrar Partida
                </Button>
              </Link>
              <Link to="/duels">
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <Swords className="mr-2 h-5 w-5" />
                  Ver Duelos
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mt-12">
              <div className="text-center">
                <div className="text-3xl font-bold text-gradient-mystic mb-1">1000+</div>
                <div className="text-sm text-muted-foreground">Duelistas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gradient-gold mb-1">500+</div>
                <div className="text-sm text-muted-foreground">Duelos Diários</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gradient-mystic mb-1">50+</div>
                <div className="text-sm text-muted-foreground">Torneios</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="text-gradient-mystic">Recursos Incríveis</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              Tudo que você precisa para duelos épicos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="card-mystic p-6 hover:border-primary/40 transition-all">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                <Video className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gradient-mystic">
                Chamadas de Vídeo
              </h3>
              <p className="text-muted-foreground">
                Duele cara a cara com seus oponentes através de chamadas de vídeo integradas
              </p>
            </Card>

            <Card className="card-mystic p-6 hover:border-primary/40 transition-all">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gradient-mystic">
                Tempo Real
              </h3>
              <p className="text-muted-foreground">
                Acompanhe pontos de vida e movimentos em tempo real durante os duelos
              </p>
            </Card>

            <Card className="card-mystic p-6 hover:border-primary/40 transition-all">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                <Trophy className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gradient-mystic">
                Sistema ELO
              </h3>
              <p className="text-muted-foreground">
                Suba no ranking com o sistema de classificação ELO competitivo
              </p>
            </Card>

            <Card className="card-mystic p-6 hover:border-primary/40 transition-all">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gradient-mystic">
                Sistema Social
              </h3>
              <p className="text-muted-foreground">
                Adicione amigos, envie desafios e construa sua comunidade
              </p>
            </Card>

            <Card className="card-mystic p-6 hover:border-primary/40 transition-all">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gradient-mystic">
                Histórico Completo
              </h3>
              <p className="text-muted-foreground">
                Acesse todo seu histórico de duelos e estatísticas detalhadas
              </p>
            </Card>

            <Card className="card-mystic p-6 hover:border-primary/40 transition-all">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                <Swords className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gradient-mystic">
                Salas Personalizadas
              </h3>
              <p className="text-muted-foreground">
                Crie salas privadas e convide amigos para duelos personalizados
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <Card className="card-mystic p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10" />
            <div className="relative z-10 space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold">
                <span className="text-gradient-mystic">Pronto para Duelar?</span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Entre na arena e mostre suas habilidades contra duelistas do mundo todo
              </p>
              <Link to="/auth">
                <Button size="lg" className="btn-mystic text-white text-lg px-12">
                  Criar Conta Grátis
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Home;
