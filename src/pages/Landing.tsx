/**
 * DuelVerse - Landing Page
 * Desenvolvido por Vinícius
 * 
 * Página inicial pública com informações sobre a plataforma.
 * Exibe funcionalidades, vídeo promocional e call-to-action para login/cadastro.
 */
import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Swords, Trophy, Users, Video, Zap, Shield,
  Play, Star, TrendingUp, Gamepad2, Crown, ChevronDown,
  Download, Monitor, Smartphone, Bell } from
"lucide-react";
import { SEOHead } from "@/components/SEOHead";

const Landing = () => {
  const { t } = useTranslation();
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'landing_video_url')
        .maybeSingle();
      if (data?.value) setVideoUrl(String(data.value));
    })();
  }, []);

  return (
    <div className="min-h-screen text-foreground">
      <SEOHead tKey="home" path="/" />
      
      {/* Navbar simples */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
            <div className="text-xl font-black text-primary tracking-[0.2em] flex items-center gap-2">
              <div className="w-2 h-6 bg-primary rounded-sm" />
              DUELVERSE
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="text-foreground hover:text-primary hover:bg-white/5 px-2 sm:px-4 text-xs sm:text-sm h-9">
                {t('landing.navLogin')}
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="btn-mystic text-primary-foreground px-2.5 sm:px-4 text-xs sm:text-sm h-9">
                {t('landing.navSignup')}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden bg-transparent">
        {/* Fundo sólido para visual estável */}
        <div className="absolute top-20 left-10 w-48 sm:w-72 h-48 sm:h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-10 right-10 w-64 sm:w-96 h-64 sm:h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        
        <div className="container mx-auto relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-6 sm:space-y-8">
            
            <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold leading-tight animate-fade-in-up delay-100">
              <span className="text-primary">{t('landing.heroTitle1')}</span>
              <br />
              <span className="text-foreground">{t('landing.heroTitle2')}</span>
            </h1>
            
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2 animate-fade-in-up delay-200">
              {t('landing.heroDesc')}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-2 animate-fade-in-up delay-300">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="btn-mystic text-primary-foreground text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6 rounded-xl w-full sm:w-auto">
                  <Zap className="mr-2 h-5 w-5 shrink-0" />
                  {t('landing.ctaPrimary')}
                </Button>
              </Link>
              {videoUrl &&
              <a href="#video" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="border-primary/50 text-foreground hover:bg-primary/10 text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-xl w-full sm:w-auto">
                    <Play className="mr-2 h-5 w-5 shrink-0" />
                    {t('landing.ctaVideo')}
                  </Button>
                </a>
              }
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-8 max-w-xl mx-auto mt-10 sm:mt-16">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-1">1000+</div>
                <div className="text-xs sm:text-sm text-foreground/80">{t('landing.statsActive')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-1">500+</div>
                <div className="text-xs sm:text-sm text-foreground/80">{t('landing.statsDaily')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-1">50+</div>
                <div className="text-xs sm:text-sm text-foreground/80">{t('landing.statsTournaments')}</div>
              </div>
            </div>

            <div className="pt-6 sm:pt-8">
              <a href="#features">
                <ChevronDown className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground mx-auto animate-bounce" />
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
                <span className="text-primary">{t('landing.videoTitle')}</span>
              </h2>
              <p className="text-muted-foreground text-lg">
                {t('landing.videoDesc')}
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
              <span className="text-primary">{t('landing.featuresTitle')}</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('landing.featuresSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
            { icon: Video, title: t('landing.feat1Title'), desc: t('landing.feat1Desc') },
            { icon: Zap, title: t('landing.feat2Title'), desc: t('landing.feat2Desc') },
            { icon: Trophy, title: t('landing.feat3Title'), desc: t('landing.feat3Desc') },
            { icon: TrendingUp, title: t('landing.feat4Title'), desc: t('landing.feat4Desc') },
            { icon: Users, title: t('landing.feat5Title'), desc: t('landing.feat5Desc') },
            { icon: Gamepad2, title: t('landing.feat6Title'), desc: t('landing.feat6Desc') }].
            map((feature, i) =>
            <Card key={i} className="group p-6 bg-card border-border hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
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
      <section className="py-20 px-4 bg-transparent">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="text-primary">{t('landing.howTitle')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
            { step: "1", title: t('landing.step1Title'), desc: t('landing.step1Desc') },
            { step: "2", title: t('landing.step2Title'), desc: t('landing.step2Desc') },
            { step: "3", title: t('landing.step3Title'), desc: t('landing.step3Desc') }].
            map((item, i) =>
            <div key={i} className="text-center space-y-4 animate-fade-in-up" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto text-2xl font-bold text-primary-foreground animate-glow-pulse" style={{ animationDelay: `${i * 0.5}s` }}>
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
              <Crown className="w-12 h-12 text-secondary mx-auto animate-pulse drop-shadow-[0_0_10px_hsl(var(--secondary))]" />
              <h2 className="text-3xl md:text-4xl font-bold">
                <span className="text-primary">{t('landing.proTitle')}</span>
              </h2>
              <p className="text-foreground/80 text-lg max-w-xl mx-auto">
                {t('landing.proDesc')}
              </p>
              <Link to="/auth">
                <Button size="lg" className="btn-mystic text-primary-foreground text-lg px-10 py-6 rounded-xl shadow-[0_0_20px_-5px_hsl(var(--primary))]">
                  <Crown className="mr-2 h-5 w-5" />
                  {t('landing.proCta')}
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 sm:py-24 px-4 bg-transparent border-t border-white/5">
        <div className="container mx-auto text-center space-y-6 sm:space-y-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">
            {t('landing.ctaTitle')}
          </h2>
          <p className="text-foreground/80 text-base sm:text-lg max-w-xl mx-auto px-2 font-medium">
            {t('landing.ctaDesc')}
          </p>
          <Link to="/auth">
            <Button size="lg" className="btn-mystic text-primary-foreground text-lg sm:text-xl px-10 sm:px-14 py-6 sm:py-7 rounded-xl shadow-[0_0_20px_-5px_hsl(var(--primary))]">
              <Swords className="mr-2 h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
              {t('landing.ctaButton')}
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10 px-4 bg-black/40 backdrop-blur-md">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-6 bg-primary rounded-sm" />
                <span className="font-bold text-primary tracking-[0.2em] text-xl">DUELVERSE</span>
              </div>
              <p className="text-sm text-foreground/80 font-medium">
                {t('landing.footerTagline')}
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-white tracking-widest text-sm uppercase">{t('landing.footerDownload')}</h4>
              <div className="space-y-2">
                <Link to="/install-app" className="flex items-center gap-2 text-sm text-foreground/80 hover:text-primary hover:font-semibold transition-colors">
                  <Monitor className="w-4 h-4" /> Windows / Desktop
                </Link>
                <Link to="/install-app" className="flex items-center gap-2 text-sm text-foreground/80 hover:text-primary hover:font-semibold transition-colors">
                  <Smartphone className="w-4 h-4" /> Android / iOS
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-white tracking-widest text-sm uppercase">{t('landing.footerLinks')}</h4>
              <div className="space-y-2">
                <Link to="/auth" className="block text-sm text-foreground/80 hover:text-primary hover:font-semibold transition-colors">{t('landing.footerSignIn')}</Link>
                <Link to="/install-app" className="block text-sm text-foreground/80 hover:text-primary hover:font-semibold transition-colors">{t('landing.footerPwa')}</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 text-center">
            <p className="text-sm text-foreground/80 font-medium">
              © {new Date().getFullYear()} DuelVerse. {t('landing.footerRights')}
            </p>
          </div>
        </div>
      </footer>
    </div>);

};

export default Landing;

