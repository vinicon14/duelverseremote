import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, X, Clock } from "lucide-react";
import { useAccountType } from "@/hooks/useAccountType";

interface Ad {
  id: string;
  title: string;
  content: string;
  image_url?: string;
  link_url?: string;
}

interface AdPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  title: string;
  description: string;
}

export const AdPopup = ({ isOpen, onClose, onComplete, title, description }: AdPopupProps) => {
  const [ad, setAd] = useState<Ad | null>(null);
  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [canSkip, setCanSkip] = useState(false);
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    if (!isOpen) {
      setOpen(false);
      setCountdown(5);
      setCanSkip(false);
      return;
    }

    const fetchAd = async () => {
      // Não mostrar para usuários pro
      if (loading) return;
      if (isPro) {
        onComplete();
        return;
      }

      const { data, error } = await supabase
        .from('advertisements')
        .select('*')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .limit(10);

      if (error || !data || data.length === 0) {
        onComplete();
        return;
      }

      // Selecionar um anúncio aleatório
      const randomAd = data[Math.floor(Math.random() * data.length)];
      setAd(randomAd);
      setOpen(true);
      
      // Iniciar countdown
      setCountdown(5);
      setCanSkip(false);
      
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setCanSkip(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    };

    fetchAd();
  }, [isOpen, isPro, loading, onClose, onComplete]);

  const handleClose = () => {
    setOpen(false);
    onClose();
  };

  const handleComplete = () => {
    setOpen(false);
    onComplete();
  };

  const handleAdClick = () => {
    if (ad?.link_url) {
      window.open(ad.link_url, '_blank');
    }
  };

  if (!isOpen || !ad) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div>
              <span className="block text-lg">{title}</span>
              <span className="block text-sm font-normal text-muted-foreground">{description}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-muted p-3 rounded-lg mb-4">
          <p className="text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            {canSkip 
              ? "Você pode fechar o anúncio agora"
              : `Aguarde ${countdown} segundos para continuar...`
            }
          </p>
        </div>
        
        <div 
          className={`space-y-4 ${ad.link_url ? 'cursor-pointer' : ''}`}
          onClick={handleAdClick}
        >
          {ad.image_url && (
            <img 
              src={ad.image_url} 
              alt={ad.title}
              className="w-full h-48 object-cover rounded-lg"
            />
          )}
          
          <div className="space-y-2">
            <h3 className="font-bold text-lg flex items-center gap-2">
              {ad.title}
              {ad.link_url && <ExternalLink className="w-4 h-4 text-primary" />}
            </h3>
            <p className="text-sm text-muted-foreground">{ad.content}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button 
            onClick={handleComplete} 
            variant="default"
            disabled={!canSkip}
          >
            {canSkip ? 'Continuar' : `Aguarde ${countdown}s...`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdPopup;
