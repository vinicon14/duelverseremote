/**
 * DuelVerse - Hook de Notificações do Navegador
 * Desenvolvido por Vinícius
 * 
 * Gerencia permissões e envio de notificações nativas do navegador.
 */
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export const useBrowserNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const checkSupport = () => {
      const supported = 'Notification' in window;
      setIsSupported(supported);
      
      if (supported) {
        setHasPermission(Notification.permission === 'granted');
      }
      
      setLoading(false);
    };

    checkSupport();
  }, []);

  const requestPermission = async () => {
    if (!isSupported) {
      toast({
        title: "Não suportado",
        description: "Seu navegador não suporta notificações",
        variant: "destructive",
      });
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      setHasPermission(granted);
      
      if (granted) {
        toast({
          title: "Notificações ativadas!",
          description: "Você receberá notificações enquanto o app estiver aberto",
        });
      } else {
        toast({
          title: "Permissão negada",
          description: "Você precisa permitir notificações para recebê-las",
          variant: "destructive",
        });
      }
      
      return granted;
    } catch (error) {
      console.error('Error requesting permission:', error);
      toast({
        title: "Erro",
        description: "Não foi possível solicitar permissão",
        variant: "destructive",
      });
      return false;
    }
  };

  const showNotification = async (title: string, options?: NotificationOptions) => {
    console.log('📱 showNotification called:', { title, isSupported, hasPermission });
    
    if (!isSupported) {
      console.warn('⚠️ Notifications not supported');
      return;
    }
    
    if (!hasPermission) {
      console.warn('⚠️ No notification permission');
      return;
    }
    
    try {
      // Try to use Service Worker notification (for PWA)
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          icon: '/favicon.png',
          badge: '/favicon.png',
          ...options,
        });
        console.log('✅ Service Worker notification shown');
        return;
      }
      
      // Fallback to regular notification
      const notification = new Notification(title, {
        icon: '/favicon.png',
        badge: '/favicon.png',
        ...options,
      });
      console.log('✅ Regular notification created:', notification);
    } catch (error) {
      console.error('❌ Error showing notification:', error);
    }
  };

  return {
    isSupported,
    hasPermission,
    loading,
    requestPermission,
    showNotification,
  };
};
