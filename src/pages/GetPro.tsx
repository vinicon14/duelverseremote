import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Check, Copy, Mail } from "lucide-react";

export default function GetPro() {
  const [pixKey, setPixKey] = useState("");
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
        .in('key', ['support_email', 'pix_key']);
      
      if (error) throw error;
      
      if (data) {
        const emailSetting = data.find(s => s.key === 'support_email');
        const pixSetting = data.find(s => s.key === 'pix_key');
        
        setSupportEmail(emailSetting?.value || 'suporte@exemplo.com');
        setPixKey(pixSetting?.value || '00020126580014br.gov.bcb.pix...');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Usar valores padrão em caso de erro
      setSupportEmail('suporte@exemplo.com');
      setPixKey('00020126580014br.gov.bcb.pix...');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ 
      title: `${label} copiado!`,
      description: "Colado na área de transferência"
    });
  };

  const benefits = [
    "Criar torneios personalizados",
    "Sem anúncios",
    "Badges exclusivas",
    "Acesso antecipado a novos recursos",
    "Suporte prioritário",
    "Estatísticas avançadas",
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-yellow-500 to-amber-500 mb-4">
              <Crown className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gradient-mystic">
              Upgrade para Conta PRO
            </h1>
            <p className="text-xl text-muted-foreground">
              Desbloqueie recursos exclusivos e aproveite ao máximo sua experiência
            </p>
          </div>

          {/* Benefits */}
          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="text-2xl">Benefícios da Conta PRO</CardTitle>
              <CardDescription>
                Tudo o que você ganha ao fazer upgrade
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payment Info */}
          <Card className="card-mystic border-primary/50">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Crown className="w-6 h-6 text-yellow-500" />
                Como Obter a Conta PRO
              </CardTitle>
              <CardDescription>
                Siga os passos abaixo para fazer upgrade
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Passo 1 - PIX */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    1
                  </div>
                  <span>Faça o pagamento via PIX</span>
                </div>
                <p className="text-muted-foreground ml-10">
                  Valor: <span className="font-bold text-foreground">R$ 19,90/mês</span>
                </p>
                {pixKey && (
                  <div className="ml-10 space-y-2">
                    <Label className="text-sm font-medium">Chave PIX Cópia e Cola:</Label>
                    <div className="flex gap-2">
                      <Input
                        value={pixKey}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(pixKey, "Chave PIX")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Passo 2 - Email */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    2
                  </div>
                  <span>Envie o comprovante</span>
                </div>
                <p className="text-muted-foreground ml-10">
                  Envie o comprovante de pagamento para nosso email
                </p>
                {supportEmail && (
                  <div className="ml-10 space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        className="flex-1"
                        onClick={() => window.open(`mailto:${supportEmail}`, '_blank')}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Enviar Email para {supportEmail}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(supportEmail, "Email")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Passo 3 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    3
                  </div>
                  <span>Aguarde a confirmação</span>
                </div>
                <p className="text-muted-foreground ml-10">
                  Sua conta será atualizada em até 24 horas após a confirmação do pagamento
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Info adicional */}
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
