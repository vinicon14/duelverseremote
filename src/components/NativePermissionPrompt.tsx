import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Bell } from "lucide-react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = 'native-permissions-prompted';

/**
 * NativePermissionPrompt - Solicita permissões de câmera/microfone e notificações
 * Aparece apenas no APK (User Agent contém DuelVerseApp) 
 * Agora: só dispara quando o usuário entra em uma DuelRoom (sob demanda)
 */
export const NativePermissionPrompt = ({ userId }: { userId?: string }) => {
  const [step, setStep] = useState<'camera' | 'notification' | null>(null);
  const isNativeApp = /DuelVerseApp/i.test(navigator.userAgent);
  const location = useLocation();

  useEffect(() => {
    if (!isNativeApp || !userId) return;
    
    const alreadyPrompted = localStorage.getItem(STORAGE_KEY);
    if (alreadyPrompted) return;

    // Only prompt when entering a duel room (on-demand)
    if (!location.pathname.startsWith('/duel/')) return;

    const timer = setTimeout(() => setStep('camera'), 1000);
    return () => clearTimeout(timer);
  }, [isNativeApp, userId, location.pathname]);

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      console.log('Camera permission denied or unavailable');
    }
    setStep('notification');
  };

  const requestNotification = async () => {
    try {
      if ('Notification' in window) {
        await Notification.requestPermission();
      }
    } catch (e) {
      console.log('Notification permission denied');
    }
    localStorage.setItem(STORAGE_KEY, 'true');
    setStep(null);
  };

  const skip = () => {
    if (step === 'camera') {
      setStep('notification');
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
      setStep(null);
    }
  };

  if (!step) return null;

  return (
    <Dialog open={!!step} onOpenChange={() => skip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'camera' ? (
              <><Camera className="h-5 w-5 text-primary" /> Câmera e Microfone</>
            ) : (
              <><Bell className="h-5 w-5 text-primary" /> Notificações</>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === 'camera'
              ? 'Para duelos com vídeo ao vivo, precisamos de acesso à câmera e microfone do seu dispositivo.'
              : 'Ative as notificações para receber alertas de convites de duelo, mensagens e torneios.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={skip}>Pular</Button>
          <Button onClick={step === 'camera' ? requestCamera : requestNotification}>
            Permitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
