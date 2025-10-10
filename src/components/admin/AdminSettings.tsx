import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export const AdminSettings = () => {
  const [supportEmail, setSupportEmail] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');
      
      if (error) throw error;
      
      if (data) {
        const emailSetting = data.find(s => s.key === 'support_email');
        const pixSetting = data.find(s => s.key === 'pix_key');
        
        if (emailSetting) setSupportEmail(emailSetting.value || '');
        if (pixSetting) setPixKey(pixSetting.value || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      // Atualizar support_email
      const { error: emailError } = await supabase
        .from('system_settings')
        .update({ value: supportEmail, updated_at: new Date().toISOString() })
        .eq('key', 'support_email');
      
      if (emailError) throw emailError;

      // Atualizar pix_key
      const { error: pixError } = await supabase
        .from('system_settings')
        .update({ value: pixKey, updated_at: new Date().toISOString() })
        .eq('key', 'pix_key');
      
      if (pixError) throw pixError;

      toast({ 
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso!"
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({ 
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar as configurações",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Configurações do Sistema</h2>

      <Card>
        <CardHeader>
          <CardTitle>Configurações de Pagamento PRO</CardTitle>
          <CardDescription>
            Configure as informações para upgrade de conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support-email">Email de Suporte</Label>
            <Input
              id="support-email"
              type="email"
              placeholder="suporte@exemplo.com"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Email para onde os usuários devem enviar comprovante de pagamento
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pix-key">Chave PIX (Cópia e Cola)</Label>
            <Input
              id="pix-key"
              placeholder="00020126580014br.gov.bcb.pix..."
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Chave PIX no formato cópia e cola para pagamentos
            </p>
          </div>

          <Button 
            onClick={saveSettings} 
            disabled={loading}
            className="w-full"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
