import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Store as StoreIcon, ExternalLink } from "lucide-react";

export default function Store() {
  const [storeUrl, setStoreUrl] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['support_email', 'store_url']);
      
      if (error) throw error;
      
      if (data) {
        const emailSetting = data.find(s => s.key === 'support_email');
        const urlSetting = data.find(s => s.key === 'store_url');
        
        setSupportEmail(emailSetting?.value || 'suporte@duelverseonline.vercel.app');
        setStoreUrl(urlSetting?.value || 'https://loja.duelverseonline.vercel.app');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setSupportEmail('suporte@duelverseonline.vercel.app');
      setStoreUrl('https://loja.duelverseonline.vercel.app');
    }
  };

  const handleStoreAccess = () => {
    if (storeUrl) {
      window.open(storeUrl, '_blank');
    } else {
      toast({
        title: "Link não configurado",
        description: "O administrador ainda não configurou o link da loja.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-primary to-primary/70 mb-4">
              <StoreIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold gradient-text">
              Loja Duelverse
            </h1>
            <p className="text-xl text-muted-foreground">
              Acesse nossa loja oficial e confira produtos exclusivos
            </p>
          </div>

          {/* Store Access Card */}
          <Card className="card-mystic border-primary/50">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <StoreIcon className="w-6 h-6 text-primary" />
                Acesso à Loja
              </CardTitle>
              <CardDescription>
                Visite nossa loja oficial para produtos, cards e acessórios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  na nossa loja você encontra planos personalizados moedas do game e muito mais
                </p>
                
                <Button 
                  onClick={handleStoreAccess}
                  className="w-full btn-mystic"
                  size="lg"
                >
                  <StoreIcon className="w-5 h-5 mr-2" />
                  Acessar Loja Duelverse
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Support Card */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">
                Precisa de ajuda? Entre em contato com nosso suporte através do email{" "}
                {supportEmail && (
                  <a 
                    href={`mailto:${supportEmail}`} 
                    className="text-primary hover:underline font-medium"
                  >
                    {supportEmail}
                  </a>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
