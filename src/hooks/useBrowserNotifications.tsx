/**
 * DuelVerse - Hook de Notificações do Navegador + Web Push
 * Desenvolvido por Vinícius
 * 
 * Gerencia permissões, Web Push subscriptions e notificações nativas.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const useBrowserNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const vapidKeyRef = useRef<string | null>(null);
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

    // Fetch VAPID public key
    const fetchVapidKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-vapid-key');
        if (!error && data?.vapid_public_key) {
          vapidKeyRef.current = data.vapid_public_key;
          console.log('✅ VAPID key fetched');
        }
      } catch (err) {
        console.error('Failed to fetch VAPID key:', err);
      }
    };
    fetchVapidKey();
  }, []);

  // Subscribe to web push and save to DB
  const subscribeToPush = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('⚠️ Push not supported in this browser');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.log('⚠️ Not authenticated, skipping push subscription');
        return;
      }

      if (!vapidKeyRef.current) {
        console.log('⚠️ VAPID key not available yet');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      // Check existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKeyRef.current) as any,
          });
          console.log('✅ New push subscription created');
        } catch (subError) {
          console.error('❌ Failed to subscribe to push:', subError);
          return;
        }
      }

      const subJson = subscription.toJSON();
      const endpoint = subJson.endpoint!;
      const p256dh = subJson.keys!.p256dh!;
      const auth = subJson.keys!.auth!;

      // Try to save subscription - delete old ones first, then insert
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', session.user.id)
        .eq('endpoint', endpoint);
      
      const { error } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: session.user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
        });

      if (error) {
        console.error('❌ Error saving push subscription:', error);
      } else {
        console.log('✅ Push subscription saved to DB');
      }
    } catch (error) {
      console.error('❌ Error in subscribeToPush:', error);
    }
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
          description: "Você receberá notificações mesmo com o app fechado",
        });
        // Subscribe to web push after permission granted
        await subscribeToPush();
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

  // Auto-subscribe if permission already granted
  useEffect(() => {
    if (hasPermission && !loading) {
      subscribeToPush();
    }
  }, [hasPermission, loading, subscribeToPush]);

  // also attempt to subscribe whenever the authentication state changes
  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && hasPermission) {
        subscribeToPush();
      }
    });
    return () => subscription.unsubscribe();
  }, [hasPermission, subscribeToPush]);

  const showNotification = useCallback(async (title: string, options?: NotificationOptions) => {
    if (!isSupported || !hasPermission) return;
    
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          icon: '/favicon.png',
          badge: '/favicon.png',
          ...options,
        });
        return;
      }
      
      new Notification(title, {
        icon: '/favicon.png',
        badge: '/favicon.png',
        ...options,
      });
    } catch (error) {
      console.error('❌ Error showing notification:', error);
    }
  }, [isSupported, hasPermission]);

  return {
    isSupported,
    hasPermission,
    loading,
    requestPermission,
    showNotification,
  };
};
