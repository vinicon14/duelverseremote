/**
 * DuelVerse - Botão para adicionar o oponente como amigo dentro da Duel Room
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { UserPlus, Check, Clock, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AddOpponentFriendButtonProps {
  currentUserId?: string | null;
  opponentId?: string | null;
  opponentUsername?: string | null;
}

type FriendState = "none" | "pending" | "friends" | "loading";

export const AddOpponentFriendButton = ({
  currentUserId,
  opponentId,
  opponentUsername,
}: AddOpponentFriendButtonProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [state, setState] = useState<FriendState>("loading");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!currentUserId || !opponentId || currentUserId === opponentId) return;
      setState("loading");
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id, status, sender_id, receiver_id")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${opponentId}),and(sender_id.eq.${opponentId},receiver_id.eq.${currentUserId})`
        )
        .limit(1);

      if (cancelled) return;
      if (error) {
        setState("none");
        return;
      }
      const row = data?.[0];
      if (!row) setState("none");
      else if (row.status === "accepted") setState("friends");
      else if (row.status === "pending") setState("pending");
      else setState("none");
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, opponentId]);

  const sendRequest = async () => {
    if (!currentUserId || !opponentId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("friend_requests").insert({
        sender_id: currentUserId,
        receiver_id: opponentId,
        status: "pending",
      });
      if (error) throw error;
      setState("pending");
      toast({
        title: t("friends.requestSentTitle", "Pedido enviado"),
        description: opponentUsername
          ? t("friends.requestSentDesc", "Aguarde a resposta de {{name}}", { name: opponentUsername })
          : t("friends.requestSentDesc", "Aguarde a resposta"),
      });
    } catch (error: any) {
      toast({
        title: t("friends.errorSend", "Erro ao enviar pedido"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (!currentUserId || !opponentId || currentUserId === opponentId) return null;

  const disabled = state !== "none" || sending;

  return (
    <Button
      onClick={sendRequest}
      disabled={disabled}
      variant="outline"
      size="sm"
      className="bg-emerald-600/95 hover:bg-emerald-700 text-white backdrop-blur-sm text-xs sm:text-sm disabled:opacity-70"
      title={
        state === "friends"
          ? t("friends.alreadyFriend", "Já são amigos")
          : state === "pending"
          ? t("friends.requestSent", "Pedido enviado")
          : t("friends.add", "Adicionar amigo")
      }
    >
      {state === "loading" || sending ? (
        <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
      ) : state === "friends" ? (
        <Check className="w-3 h-3 sm:w-4 sm:h-4" />
      ) : state === "pending" ? (
        <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
      ) : (
        <UserPlus className="w-3 h-3 sm:w-4 sm:h-4" />
      )}
    </Button>
  );
};

export default AddOpponentFriendButton;
