/**
 * DuelVerse - Utilitário de Notificações Push
 * Desenvolvido por Vinícius
 * 
 * Funções para enviar notificações push para usuários.
 */
import { supabase } from "@/integrations/supabase/client";

interface SendNotificationParams {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export const sendNotification = async ({
  userId,
  title,
  body,
  data,
}: SendNotificationParams) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: data?.type || 'general',
        title,
        message: body,
        data,
      });

    if (error) {
      console.error('Error saving notification:', error);
      return false;
    }

    console.log('Notification saved:', { userId, title });
    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
};

// Helper functions for specific notification types
export const notifyNewMessage = async (userId: string, senderName: string) => {
  return sendNotification({
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
  return sendNotification({
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
  return sendNotification({
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
  return sendNotification({
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
  return sendNotification({
    userId,
    title: `Chat do Torneio`,
    body: `${senderName} enviou uma mensagem no torneio "${tournamentName}"`,
    data: {
      type: 'tournament_message',
      url: '/tournaments',
    },
  });
};
