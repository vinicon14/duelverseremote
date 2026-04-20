import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Send } from "lucide-react";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useToast } from "@/components/ui/use-toast";
import { useTranslation } from "react-i18next";

export const BrowserNotificationTest = () => {
  const { isSupported, hasPermission, loading, requestPermission } = useBrowserNotifications();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleTestNotification = async () => {
    console.log('🧪 Test notification button clicked');

    if (!('Notification' in window)) {
      toast({
        title: t('browserNotif.notSupportedToast'),
        description: t('browserNotif.notSupportedToastDesc'),
        variant: "destructive",
      });
      return;
    }

    if (Notification.permission !== 'granted') {
      toast({
        title: t('browserNotif.noPermission'),
        description: t('browserNotif.noPermissionDesc'),
        variant: "destructive",
      });
      return;
    }

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(t('browserNotif.testTitle'), {
          body: t('browserNotif.testBody'),
          icon: '/favicon.png',
          tag: 'test-notification',
        });
      } else {
        new Notification(t('browserNotif.testTitle'), {
          body: t('browserNotif.testBody'),
          icon: '/favicon.png',
          tag: 'test-notification',
        });
      }

      toast({
        title: t('browserNotif.sentToast'),
        description: t('browserNotif.sentToastDesc'),
      });
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      toast({
        title: t('browserNotif.errorToast'),
        description: error instanceof Error ? error.message : t('browserNotif.unknownError'),
        variant: "destructive",
      });
    }
  };

  if (loading) return null;

  if (!isSupported) {
    return (
      <Card className="card-mystic mb-6 border-yellow-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-yellow-500" />
            <span className="text-gradient-mystic">{t('browserNotif.title')}</span>
          </CardTitle>
          <CardDescription className="text-yellow-600 dark:text-yellow-400">
            ⚠️ {t('browserNotif.notSupported')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="card-mystic mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <span className="text-gradient-mystic">{t('browserNotif.title')}</span>
        </CardTitle>
        <CardDescription>
          {hasPermission
            ? `✅ ${t('browserNotif.activeDesc')}`
            : `⚠️ ${t('browserNotif.inactiveDesc')}`}
          {hasPermission && (
            <div className="mt-2 text-xs text-muted-foreground">
              ⚠️ {t('browserNotif.mobileWarning')}
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-2">
        {hasPermission ? (
          <Button onClick={handleTestNotification} className="flex-1">
            <Send className="mr-2 h-4 w-4" />
            {t('browserNotif.testButton')}
          </Button>
        ) : (
          <Button onClick={requestPermission} className="w-full">
            <Bell className="mr-2 h-4 w-4" />
            {t('browserNotif.enableButton')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
