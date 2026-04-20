/**
 * DuelVerse - Home Pro
 * Desenvolvido por Vinícius
 * 
 * Dashboard para usuários Pro (assinantes Premium).
 * Exibe funcionalidades exclusivas para assinantes.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProNavbar } from "@/components/ProNavbar";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";
import { Zap, Swords, Trophy, Crown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function ProHome() {
  const navigate = useNavigate();

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen bg-background flex w-full">
        <ProNavbar />
        
        <main className="flex-1 container mx-auto px-4 pt-20 sm:pt-24 pb-8">
          {/* PRO Header */}
          <div className="flex items-center gap-3 mb-6">
            <Crown className="w-8 h-8 text-yellow-500" />
            <div className="text-3xl font-bold text-gradient-pro bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600">
              DuelVerse PRO
            </div>
            <Crown className="w-6 h-6 text-yellow-500" />
            <div className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-sm font-medium border border-yellow-500/30 ml-2">
              Zero Anúncios
            </div>
          </div>

          {/* Saldo de DuelCoins */}
          <div className="mb-6">
            <DuelCoinsBalance />
          </div>

          {/* Cards de Acesso Rápido */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="card-mystic hover:border-primary/60 transition-all cursor-pointer" onClick={() => navigate('/pro/matchmaking')}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="w-5 h-5 text-primary" />
                  Fila Rápida
                </CardTitle>
                <CardDescription>Encontre um oponente agora</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full btn-mystic">
                  <Zap className="w-4 h-4 mr-2" />
                  Buscar Partida
                </Button>
              </CardContent>
            </Card>

            <Card className="card-mystic hover:border-primary/60 transition-all cursor-pointer" onClick={() => navigate('/pro/duels')}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Swords className="w-5 h-5 text-primary" />
                  Duelos
                </CardTitle>
                <CardDescription>Crie ou entre em salas</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <Swords className="w-4 h-4 mr-2" />
                  Ver Salas
                </Button>
              </CardContent>
            </Card>

            <Card className="card-mystic hover:border-primary/60 transition-all cursor-pointer" onClick={() => navigate('/pro/tournaments')}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="w-5 h-5 text-primary" />
                  Torneios
                </CardTitle>
                <CardDescription>Competições oficiais</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <Trophy className="w-4 h-4 mr-2" />
                  Ver Torneios
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* PRO Benefits Section */}
          <Card className="card-mystic border-yellow-500/30">
            <CardHeader>
              <CardTitle className="text-gradient-pro bg-gradient-to-r from-yellow-400 to-yellow-600">
                Benefícios PRO
              </CardTitle>
              <CardDescription>
                Aproveite todos os recursos premium do DuelVerse
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <span className="text-yellow-500">🚫</span>
                  </div>
                  <span>Zero Anúncios</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <span className="text-yellow-500">🎨</span>
                  </div>
                  <span>Temas Exclusivos</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <span className="text-yellow-500">💎</span>
                  </div>
                  <span>Recompensas VIP</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </SidebarProvider>
  );
}
