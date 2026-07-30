import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { GlobalChat } from "@/components/GlobalChat";

interface Props {
  children: ReactNode;
  featureName?: string;
  mobileGlobalChat?: boolean;
}

/**
 * Blocks the child route on mobile devices.
 * Full duel/deck features live exclusively on Desktop.
 * On mobile shows a friendly explanation + link to the pairing flow.
 */
export const RequireDesktop = ({ children, featureName = "Esta funcionalidade", mobileGlobalChat = false }: Props) => {
  const isMobile = useIsMobile();
  if (!isMobile) return <>{children}</>;

  return (
    <div className={`min-h-screen flex ${mobileGlobalChat ? "items-start justify-center" : "items-center justify-center"} p-4 bg-background`}>
      <div className="max-w-md w-full text-center space-y-5">
        <div className="flex justify-center gap-3 text-primary">
          <Monitor className="h-14 w-14" />
        </div>
        <h1 className="text-2xl font-bold">Disponível apenas no Desktop</h1>
        <p className="text-muted-foreground">
          {featureName} agora é exclusiva da versão Desktop (PC/Notebook) do Duelverse.
          No celular, você pode usar o app como câmera auxiliar do seu computador.
        </p>
        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link to="/phone-connect">
              <Smartphone className="h-5 w-5 mr-2" />
              Conectar ao Computador
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
        {mobileGlobalChat && (
          <div className="h-[min(58dvh,560px)] min-h-[360px] text-left">
            <GlobalChat />
          </div>
        )}
      </div>
    </div>
  );
};

export default RequireDesktop;
