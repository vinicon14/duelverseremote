import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, X, Download } from "lucide-react";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const NotificationPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const { isSupported, hasPermission, loading, requestPermission } = useBrowserNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    // Check authentication status
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    // Check if app is already installed (multiple methods)
    const checkInstalled = () => {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
      const isInStandaloneMode = (window.navigator as any).standalone === true;
      const hasInstalledFlag = localStorage.getItem('app-installed') === 'true';
      
      if (isStandalone || isInStandaloneMode || hasInstalledFlag) {
        setIsInstalled(true);
      }
    };

    checkInstalled();

    // Listen for standalone mode changes
    window.matchMedia("(display-mode: standalone)").addEventListener('change', checkInstalled);

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Check if user has already been prompted
    const hasBeenPrompted = localStorage.getItem('notification-prompted');
    
    // Check if app is already installed
    const installed = window.matchMedia("(display-mode: standalone)").matches;
    setIsInstalled(installed);
    
    // Show prompt if:
    // - Notifications are supported
    // - User is authenticated
    // - User doesn't have permission
    // - User hasn't been prompted before
    if (isSupported && isAuthenticated && !hasPermission && !hasBeenPrompted && !loading) {
      // Show prompt after 2 seconds (faster)
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isSupported, isAuthenticated, hasPermission, loading]);

  const handleSubscribe = async () => {
    const success = await requestPermission();
    if (success) {
      localStorage.setItem('notification-prompted', 'true');
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('notification-prompted', 'true');
    setShowPrompt(false);
  };

  const handleInstall = () => {
    // Mark as installed in localStorage
    localStorage.setItem('app-installed', 'true');
    setIsInstalled(true);
    navigate('/install');
    handleDismiss();
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-slide-up">
      <Card className="shadow-lg border-primary/20">
        <CardHeader className="relative pb-3">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Notificações e App</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardDescription>
            {isInstalled 
              ? "Receba notificações mesmo com o app fechado!" 
              : "Receba notificações mesmo com o app fechado! Instale o Duelverse na sua tela inicial."}
          </CardDescription>
          <div className="flex flex-col gap-2">
            {!isInstalled && (
              <Button onClick={handleInstall} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Instalar App
              </Button>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSubscribe} variant="outline" className="flex-1">
                {isInstalled ? "Ativar Notificações" : "Só notificações"}
              </Button>
              <Button variant="ghost" onClick={handleDismiss} size="sm">
                Depois
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
