import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

// Extend ServiceWorkerRegistration to include pushManager
declare global {
  interface ServiceWorkerRegistration {
    pushManager: PushManager;
  }
}

const VAPID_PUBLIC_KEY = 'BMgF3CUWdNP_hMz0ldYv8oZeizrF0ACi1INwaADHe7ZogDDbHnkFnWsSljsus2NZ3nA4Hj3xDwSEAtmthAmxdzI';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const usePushNotifications = (userId: string | undefined) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported && userId) {
      checkExistingSubscription();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (err) {
      console.error('[Push] Error checking subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({
          title: "Permissão negada",
          description: "Você precisa permitir notificações para recebê-las",
          variant: "destructive",
        });
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      
      // Check for existing subscription first
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }

      const subscriptionJson = subscription.toJSON();
      
      // Save to database
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint: subscriptionJson.endpoint!,
          p256dh: subscriptionJson.keys!.p256dh!,
          auth: subscriptionJson.keys!.auth!,
          user_agent: navigator.userAgent,
        }, {
          onConflict: 'user_id,endpoint',
        });

      if (error) {
        console.error('[Push] Error saving subscription:', error);
        toast({
          title: "Erro",
          description: "Não foi possível salvar a inscrição de notificações",
          variant: "destructive",
        });
        return false;
      }

      setIsSubscribed(true);
      toast({
        title: "Notificações ativadas! 🔔",
        description: "Você receberá notificações mesmo com o site fechado",
      });
      return true;
    } catch (err) {
      console.error('[Push] Error subscribing:', err);
      toast({
        title: "Erro",
        description: "Não foi possível ativar as notificações push",
        variant: "destructive",
      });
      return false;
    }
  }, [isSupported, userId, toast]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint);
      }

      setIsSubscribed(false);
      toast({
        title: "Notificações desativadas",
        description: "Você não receberá mais notificações push",
      });
    } catch (err) {
      console.error('[Push] Error unsubscribing:', err);
    }
  }, [userId, toast]);

  return {
    isSupported,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
  };
};
