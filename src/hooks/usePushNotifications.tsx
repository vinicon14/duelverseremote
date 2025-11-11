import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check if Notification API is supported
    const supported = 'Notification' in window;
    setIsSupported(supported);
    
    if (supported) {
      checkPermissionStatus();
    } else {
      setLoading(false);
    }
  }, []);

  const checkPermissionStatus = () => {
    const permission = Notification.permission;
    setIsSubscribed(permission === 'granted');
    setLoading(false);
  };

  const subscribe = async () => {
    if (!isSupported) {
      toast({
        title: "Não suportado",
        description: "Seu navegador não suporta notificações",
        variant: "destructive",
      });
      return false;
    }

    try {
      console.log('🔔 Solicitando permissão para notificações...');
      
      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('📋 Permissão:', permission);
      
      if (permission !== 'granted') {
        toast({
          title: "Permissão negada",
          description: "Você precisa permitir notificações para recebê-las",
          variant: "destructive",
        });
        return false;
      }

      console.log('✅ Permissão concedida!');
      setIsSubscribed(true);
      
      toast({
        title: "Notificações ativadas",
        description: "Você receberá notificações no navegador",
      });

      return true;
    } catch (error) {
      console.error('❌ Erro ao ativar notificações:', error);
      
      toast({
        title: "Erro",
        description: "Não foi possível ativar as notificações",
        variant: "destructive",
      });
      return false;
    }
  };

  const unsubscribe = async () => {
    try {
      setIsSubscribed(false);
      
      toast({
        title: "Notificações desativadas",
        description: "Você não receberá mais notificações",
      });
    } catch (error) {
      console.error('Error disabling notifications:', error);
      toast({
        title: "Erro",
        description: "Não foi possível desativar as notificações",
        variant: "destructive",
      });
    }
  };

  return {
    isSupported,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
  };
};
