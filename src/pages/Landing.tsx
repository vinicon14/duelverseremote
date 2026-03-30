/**
 * DuelVerse - Landing Page
 * Desenvolvido por Vinícius
 * 
 * Página inicial pública com informações sobre a plataforma.
 * Exibe funcionalidades, vídeo promocional e call-to-action para login/cadastro.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Swords, Trophy, Users, Video, Zap, Shield,
  Play, Star, TrendingUp, Gamepad2, Crown, ChevronDown,
  Download, Monitor, Smartphone, Bell } from
"lucide-react";

const Landing = () => {
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    const fetchVideo = async () => {
      const { data } = await supabase.
      from('system_settings').
      select('value').
      eq('key', 'landing_video_url').
      maybeSingle();
      if (data?.value) setVideoUrl(data.value);
    };
    fetchVideo();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Animated TCG color overlay */}
      <style>{`
        @keyframes tcg-color-cycle {
          0%, 100% { background: linear-gradient(135deg, hsl(270 80% 55% / 0.15) 0%, hsl(315 85% 60% / 0.1) 50%, transparent 100%); }
          33% { background: linear-gradient(135deg, hsl(45 95% 60% / 0.15) 0%, hsl(15 90% 50% / 0.1) 50%, transparent 100%); }
          66% { background: linear-gradient(135deg, hsl(50 100% 50% / 0.15) 0%, hsl(210 90% 50% / 0.1) 50%, transparent 100%); }
        }
        @keyframes tcg-text-cycle {
          0%, 100% { color: hsl(270 80% 65%); text-shadow: 0 0 20px hsl(270 80% 55% / 0.5); }
          33% { color: hsl(35 90% 55%); text-shadow: 0 0 20px hsl(35 90% 50% / 0.5); }
          66% { color: hsl(45 100% 55%); text-shadow: 0 0 20px hsl(45 100% 50% / 0.5); }
        }
        .tcg-text-animate { animation: tcg-text-cycle 9s ease-in-out infinite; }
        @keyframes tcg-btn-cycle {
          0%, 100% { background: linear-gradient(135deg, hsl(270 80% 55%), hsl(315 85% 60%)); box-shadow: 0 10px 40px -10px hsl(270 80% 55% / 0.5); }
          33% { background: linear-gradient(135deg, hsl(35 90% 50%), hsl(0 75% 50%)); box-shadow: 0 10px 40px -10px hsl(35 90% 50% / 0.5); }
          66% { background: linear-gradient(135deg, hsl(45 100% 50%), hsl(210 80% 55%)); box-shadow: 0 10px 40px -10px hsl(45 100% 50% / 0.5); }
        }
        .tcg-btn-animate { animation: tcg-btn-cycle 9s ease-in-out infinite; }
        @keyframes tcg-border-cycle {
          0%, 100% { border-color: hsl(270 80% 55% / 0.4); color: hsl(270 80% 65%); }
          33% { border-color: hsl(35 90% 50% / 0.4); color: hsl(35 90% 55%); }
          66% { border-color: hsl(45 100% 50% / 0.4); color: hsl(45 100% 55%); }
        }
        .tcg-border-animate { animation: tcg-border-cycle 9s ease-in-out infinite; }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-0" style={{ animation: 'tcg-color-cycle 9s ease-in-out infinite' }} />
      {/* Navbar simples */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ animation: 'tcg-color-cycle 9s ease-in-out infinite' }}>
              <Swords className="w-5 h-5 tcg-text-animate" />
            </div>
            <span className="text-xl font-bold tcg-text-animate">DUELVERSE</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" className="tcg-border-animate hover:text-foreground">
                Entrar
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="tcg-btn-animate text-primary-foreground">
                Criar Conta
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm tcg-border-animate">
              <Star className="w-4 h-4" />
              <span>A plataforma #1 de duelos de TCG online</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight">
              <span className="tcg-text-animate">Duele Online</span>
              <br />
              <span className="text-foreground">Como Nunca Antes</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Desafie duelistas do mundo todo com chamadas de vídeo ao vivo, 
              torneios com premiações em DuelCoins e um sistema de ranking competitivo.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/auth">
                <Button size="lg" className="tcg-btn-animate text-primary-foreground text-lg px-10 py-6 rounded-xl">
                  <Zap className="mr-2 h-5 w-5" />
                  Comece Agora — É Grátis
                </Button>
              </Link>
              {videoUrl &&
              <a href="#video">
                  <Button size="lg" variant="outline" className="tcg-border-animate text-lg px-8 py-6 rounded-xl">
                    <Play className="mr-2 h-5 w-5" />
                    Ver Vídeo
                  </Button>
                </a>
              }
            </div>

            <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto mt-16">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold tcg-text-animate mb-1">1000+</div>
                <div className="text-sm text-muted-foreground">Duelistas Ativos</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold tcg-text-animate mb-1">500+</div>
                <div className="text-sm text-muted-foreground">Duelos Diários</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold tcg-text-animate mb-1">50+</div>
                <div className="text-sm text-muted-foreground">Torneios</div>
              </div>
            </div>

            <div className="pt-8">
              <a href="#features">
                <ChevronDown className="w-8 h-8 text-muted-foreground mx-auto animate-bounce" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Video Section */}
      {videoUrl &&
      <section id="video" className="py-20 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                <span className="tcg-text-animate">Conheça o DuelVerse</span>
              </h2>
              <p className="text-muted-foreground text-lg">
                Veja como funciona a plataforma em ação
              </p>
            </div>
            
            <div className="relative rounded-2xl overflow-hidden border border-border shadow-2xl bg-card aspect-video">
              {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ?
            <iframe
              src={videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Vídeo DuelVerse" /> :


            <video
              src={videoUrl}
              controls
              className="w-full h-full object-cover"
              poster="">
              
                  Seu navegador não suporta vídeo.
                </video>
            }
            </div>
          </div>
        </section>
      }

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="tcg-text-animate">Por Que Escolher o DuelVerse?</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Recursos desenvolvidos por duelistas, para duelistas
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
            { icon: Video, title: "Chamadas de Vídeo", desc: "Duele cara a cara com seus oponentes através de chamadas de vídeo integradas em tempo real" },
            { icon: Zap, title: "Matchmaking Automático", desc: "Encontre oponentes do seu nível em segundos com nosso sistema inteligente de fila" },
            { icon: Trophy, title: "Torneios & Premiações", desc: "Participe de torneios semanais com premiações em DuelCoins e suba no ranking" },
            { icon: TrendingUp, title: "Sistema de Ranking", desc: "Acompanhe sua evolução com um sistema de pontos competitivo e leaderboard global" },
            { icon: Users, title: "Comunidade Ativa", desc: "Adicione amigos, envie desafios, troque mensagens e construa sua rede de duelistas" },
            { icon: Gamepad2, title: "Deck Builder", desc: "Construa e salve seus decks com nosso editor visual completo integrado à plataforma" }].
            map((feature, i) =>
            <Card key={i} className="group p-6 bg-card border-border hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mb-4 group-hover:bg-primary/25 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-card/50">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="tcg-text-animate">Como Funciona</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
            { step: "1", title: "Crie Sua Conta", desc: "Cadastre-se gratuitamente e personalize seu perfil de duelista" },
            { step: "2", title: "Encontre um Oponente", desc: "Use o matchmaking automático ou crie uma sala personalizada" },
            { step: "3", title: "Duele & Vença!", desc: "Duele por vídeo chamada, ganhe pontos e suba no ranking" }].
            map((item, i) =>
            <div key={i} className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto text-2xl font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Pro Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <Card className="p-10 md:p-14 relative overflow-hidden border-primary/20 bg-card">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 text-center space-y-6">
              <Crown className="w-12 h-12 text-secondary mx-auto" />
              <h2 className="text-3xl md:text-4xl font-bold">
                <span className="tcg-text-animate">DuelVerse PRO</span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                Sem anúncios, acesso a torneios exclusivos, badge especial e muito mais. 
                Eleve sua experiência ao próximo nível.
              </p>
              <Link to="/auth">
                <Button size="lg" className="tcg-btn-animate text-primary-foreground text-lg px-10 py-6 rounded-xl">
                  <Crown className="mr-2 h-5 w-5" />
                  Saiba Mais
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-24 px-4">
        <div className="container mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-extrabold">
            <span className="tcg-text-animate">Pronto para Duelar?</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Junte-se a milhares de duelistas e comece sua jornada agora mesmo
          </p>
          <Link to="/auth">
            <Button size="lg" className="tcg-btn-animate text-primary-foreground text-xl px-14 py-7 rounded-xl">
              <Swords className="mr-2 h-6 w-6" />
              Criar Conta Grátis
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 px-4">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Swords className="w-5 h-5 tcg-text-animate" />
                <span className="font-bold tcg-text-animate">DUELVERSE</span>
              </div>
              <p className="text-sm text-muted-foreground">
                A plataforma definitiva de duelos de TCG online.
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Baixe o App</h4>
              <div className="space-y-2">
                <Link to="/install-app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Monitor className="w-4 h-4" /> Windows / Desktop
                </Link>
                <Link to="/install-app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Smartphone className="w-4 h-4" /> Android / iOS
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Links</h4>
              <div className="space-y-2">
                <Link to="/auth" className="block text-sm text-muted-foreground hover:text-primary transition-colors">Entrar / Cadastrar</Link>
                <Link to="/install-app" className="block text-sm text-muted-foreground hover:text-primary transition-colors">Instalar PWA</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} DuelVerse. Todos os direitos reservados. Desenvolvido por Vinícius.
            </p>
          </div>
        </div>
      </footer>
    </div>);

};

export default Landing;