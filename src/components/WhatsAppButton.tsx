import { MessageCircle } from "lucide-react";

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/G85qXVsxb56D3nhqyxbEKH";

export const WhatsAppButton = () => {
  return (
    <a
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Entrar no grupo do WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full border border-green-500/50 bg-background/80 backdrop-blur-md text-green-500 hover:bg-green-500/10 hover:border-green-500 transition-all duration-300 shadow-lg hover:shadow-green-500/20"
    >
      <MessageCircle className="w-5 h-5" />
      <span className="text-sm font-medium hidden sm:inline">Grupo WhatsApp</span>
    </a>
  );
};
