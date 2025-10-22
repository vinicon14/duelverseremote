import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { useAdmin } from "@/hooks/useAdmin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminNews } from "@/components/admin/AdminNews";
import { AdminAds } from "@/components/admin/AdminAds";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminTournaments } from "@/components/admin/AdminTournaments";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { AdminDuels } from "@/components/admin/AdminDuels";
import { AdminDuelCoins } from "@/components/admin/AdminDuelCoins";
import { AdminJudges } from "@/components/admin/AdminJudges";
import { AdminLives } from "@/components/admin/AdminLives";
import { Shield, Loader2 } from "lucide-react";

export default function Admin() {
  const { isAdmin, loading } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-gradient-mystic">Painel Administrativo</h1>
          </div>
          <p className="text-muted-foreground">
            Gerencie notícias, anúncios e usuários da plataforma
          </p>
        </div>

        <Tabs defaultValue="news" className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="news">Notícias</TabsTrigger>
            <TabsTrigger value="ads">Anúncios</TabsTrigger>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="duels">Salas</TabsTrigger>
            <TabsTrigger value="tournaments">Torneios</TabsTrigger>
            <TabsTrigger value="duelcoins">DuelCoins</TabsTrigger>
            <TabsTrigger value="judges">Juízes</TabsTrigger>
            <TabsTrigger value="lives">Transmissões</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>
          
          <TabsContent value="news" className="mt-6">
            <AdminNews />
          </TabsContent>
          
          <TabsContent value="ads" className="mt-6">
            <AdminAds />
          </TabsContent>
          
          <TabsContent value="users" className="mt-6">
            <AdminUsers />
          </TabsContent>
          
          <TabsContent value="duels" className="mt-6">
            <AdminDuels />
          </TabsContent>
          
          <TabsContent value="tournaments" className="mt-6">
            <AdminTournaments />
          </TabsContent>
          
          <TabsContent value="duelcoins" className="mt-6">
            <AdminDuelCoins />
          </TabsContent>
          
          <TabsContent value="judges" className="mt-6">
            <AdminJudges />
          </TabsContent>
          
          <TabsContent value="lives" className="mt-6">
            <AdminLives />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <AdminSettings />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
