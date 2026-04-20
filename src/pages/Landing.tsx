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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead tKey="home" path="/" />
      {/* TCG Styles */}
      <style>{`
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
        @keyframes card-fall-0 {
          0% { transform: translateY(-10%) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(110%) translateX(30px) rotate(15deg); opacity: 0; }
        }
        @keyframes card-fall-1 {
          0% { transform: translateY(-10%) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(110%) translateX(-40px) rotate(-12deg); opacity: 0; }
        }
        @keyframes card-fall-2 {
          0% { transform: translateY(-10%) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(110%) translateX(20px) rotate(8deg); opacity: 0; }
        }
        @keyframes card-fall-3 {
          0% { transform: translateY(-10%) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(110%) translateX(-25px) rotate(-10deg); opacity: 0; }
        }
        .custom-cursor {
          position: fixed;
          width: 20px;
          height: 20px;
          border: 2px solid hsl(270 80% 60%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          transition: transform 0.15s ease-out, border-color 0.3s;
          mix-blend-mode: screen;
        }
        .custom-cursor::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 4px;
          height: 4px;
          background: hsl(270 80% 65%);
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }
        .card-energy {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px;
          color: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
      `}</style>
      
      {/* TCG Card Rain - Cards caindo/flutuando pela tela */}
      <div className="fixed inset-0 pointer-events-none z-10 overflow-hidden">
        {[...Array(15)].map((_, i) => {
          const colors = [
            'hsl(270 80% 55% / 0.12)',
            'hsl(45 95% 55% / 0.12)', 
            'hsl(210 80% 55% / 0.1)',
            'hsl(280 80% 55% / 0.1)',
            'hsl(35 90% 50% / 0.1)'
          ];
          const colorIndex = i % 5;
          const width = 50 + Math.random() * 40;
          const height = width * 1.4;
          const left = Math.random() * 90;
          const delay = Math.random() * 15;
          const duration = 12 + Math.random() * 8;
          
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${left}%`,
                top: '-10%',
                width: `${width}px`,
                height: `${height}px`,
                background: `linear-gradient(135deg, ${colors[colorIndex]}, ${colors[(colorIndex + 1) % 5]})`,
                border: `1px solid ${colors[colorIndex].replace('/ 0.12)', '/ 0.25)').replace('/ 0.1)', '/ 0.2)')}`,
                borderRadius: '8px',
                animation: `card-fall-${i % 4} ${duration}s linear infinite`,
                animationDelay: `-${delay}s`,
                boxShadow: `0 4px 20px ${colors[colorIndex]}`
              }}
            />
          );
        })}
      </div>
      
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ 
        background: 'radial-gradient(ellipse at center, hsl(222 47% 11% / 0.97) 0%, hsl(222 47% 8% / 0.99) 50%, hsl(240 40% 5% / 1) 100%)'
      }} />
      
      {/* Navbar simples */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/20 to-secondary/20">
              <Swords className="w-5 h-5 text-primary" />
            </div>
            <span className="text-base sm:text-xl font-bold tcg-text-animate truncate">DUELVERSE</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="tcg-border-animate hover:text-foreground px-2 sm:px-4 text-xs sm:text-sm h-9">
                {t('landing.navLogin')}
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="tcg-btn-animate text-primary-foreground px-2.5 sm:px-4 text-xs sm:text-sm h-9">
                {t('landing.navSignup')}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
        <div className="absolute top-20 left-10 w-48 sm:w-72 h-48 sm:h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-10 right-10 w-64 sm:w-96 h-64 sm:h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        
        <div className="container mx-auto relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border text-xs sm:text-sm tcg-border-animate animate-fade-in-up">
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>{t('landing.heroBadge')}</span>
            </div>
            
            <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold leading-tight animate-fade-in-up delay-100">
              <span className="tcg-text-animate">{t('landing.heroTitle1')}</span>
              <br />
              <span className="text-foreground">{t('landing.heroTitle2')}</span>
            </h1>
            
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2 animate-fade-in-up delay-200">
              {t('landing.heroDesc')}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-2 animate-fade-in-up delay-300">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="tcg-btn-animate text-primary-foreground text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6 rounded-xl w-full sm:w-auto">
                  <Zap className="mr-2 h-5 w-5 shrink-0" />
                  {t('landing.ctaPrimary')}
                </Button>
              </Link>
              {videoUrl &&
              <a href="#video" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="tcg-border-animate text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-xl w-full sm:w-auto">
                    <Play className="mr-2 h-5 w-5 shrink-0" />
                    {t('landing.ctaVideo')}
                  </Button>
                </a>
              }
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-8 max-w-xl mx-auto mt-10 sm:mt-16">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold tcg-text-animate mb-1">1000+</div>
                <div className="text-xs sm:text-sm text-muted-foreground">{t('landing.statsActive')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold tcg-text-animate mb-1">500+</div>
                <div className="text-xs sm:text-sm text-muted-foreground">{t('landing.statsDaily')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold tcg-text-animate mb-1">50+</div>
                <div className="text-xs sm:text-sm text-muted-foreground">{t('landing.statsTournaments')}</div>
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
                <span className="tcg-text-animate">{t('landing.videoTitle')}</span>
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
              <span className="tcg-text-animate">{t('landing.featuresTitle')}</span>
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
      <section className="py-20 px-4 bg-card/50">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="tcg-text-animate">{t('landing.howTitle')}</span>
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
              <Crown className="w-12 h-12 text-secondary mx-auto" />
              <h2 className="text-3xl md:text-4xl font-bold">
                <span className="tcg-text-animate">{t('landing.proTitle')}</span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                {t('landing.proDesc')}
              </p>
              <Link to="/auth">
                <Button size="lg" className="tcg-btn-animate text-primary-foreground text-lg px-10 py-6 rounded-xl">
                  <Crown className="mr-2 h-5 w-5" />
                  {t('landing.proCta')}
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 sm:py-24 px-4">
        <div className="container mx-auto text-center space-y-6 sm:space-y-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold">
            <span className="tcg-text-animate">{t('landing.ctaTitle')}</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto px-2">
            {t('landing.ctaDesc')}
          </p>
          <Link to="/auth">
            <Button size="lg" className="tcg-btn-animate text-primary-foreground text-lg sm:text-xl px-10 sm:px-14 py-6 sm:py-7 rounded-xl">
              <Swords className="mr-2 h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
              {t('landing.ctaButton')}
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
                {t('landing.footerTagline')}
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">{t('landing.footerDownload')}</h4>
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
              <h4 className="font-semibold text-foreground">{t('landing.footerLinks')}</h4>
              <div className="space-y-2">
                <Link to="/auth" className="block text-sm text-muted-foreground hover:text-primary transition-colors">{t('landing.footerSignIn')}</Link>
                <Link to="/install-app" className="block text-sm text-muted-foreground hover:text-primary transition-colors">{t('landing.footerPwa')}</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} DuelVerse. {t('landing.footerRights')}
            </p>
          </div>
        </div>
      </footer>
    </div>);

};

export default Landing;
