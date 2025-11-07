import { supabase } from "@/integrations/supabase/client";

interface SendNotificationParams {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export const sendPushNotification = async ({
  userId,
  title,
  body,
  data,
}: SendNotificationParams) => {
  try {
    const { data: result, error } = await supabase.functions.invoke(
      'send-push-notification',
      {
        body: {
          userId,
          title,
          body,
          data,
        },
      }
    );

    if (error) {
      console.error('Error sending push notification:', error);
      return false;
    }

    console.log('Push notification sent:', result);
    return true;
  } catch (error) {
    console.error('Error invoking push notification function:', error);
    return false;
  }
};

// Helper functions for specific notification types
export const notifyNewMessage = async (userId: string, senderName: string) => {
  return sendPushNotification({
    userId,
    title: 'Nova Mensagem',
    body: `${senderName} enviou uma mensagem`,
    data: {
      type: 'message',
      url: '/friends',
    },
  });
};

export const notifyNewDuelInvite = async (userId: string, inviterName: string) => {
  return sendPushNotification({
    userId,
    title: 'Convite para Duelo',
    body: `${inviterName} convidou você para um duelo!`,
    data: {
      type: 'duel_invite',
      url: '/duels',
    },
  });
};

export const notifyNewNews = async (userId: string, newsTitle: string) => {
  return sendPushNotification({
    userId,
    title: 'Nova Notícia',
    body: newsTitle,
    data: {
      type: 'news',
      url: '/news',
    },
  });
};

export const notifyTournamentStart = async (userId: string, tournamentName: string) => {
  return sendPushNotification({
    userId,
    title: 'Torneio Começando',
    body: `O torneio "${tournamentName}" está começando!`,
    data: {
      type: 'tournament_start',
      url: '/tournaments',
    },
  });
};

export const notifyTournamentMessage = async (
  userId: string,
  senderName: string,
  tournamentName: string
) => {
  return sendPushNotification({
    userId,
    title: `Chat do Torneio`,
    body: `${senderName} enviou uma mensagem no torneio "${tournamentName}"`,
    data: {
      type: 'tournament_message',
      url: '/tournaments',
    },
  });
};
