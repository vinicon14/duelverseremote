export const detectPlatform = () => {
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  const isAndroid = /android/i.test(userAgent);
  const isMobile = isIOS || isAndroid || /Mobile/.test(userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                      (window.navigator as any).standalone === true;
  
  return {
    isIOS,
    isAndroid,
    isMobile,
    isStandalone,
    supportsWebPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  };
};

export const canUsePushNotifications = () => {
  const platform = detectPlatform();
  
  // Android sempre suporta
  if (platform.isAndroid) {
    return { supported: true, reason: null };
  }
  
  // iOS precisa estar instalado como PWA
  if (platform.isIOS) {
    if (!platform.isStandalone) {
      return { 
        supported: false, 
        reason: 'iOS requer que o app esteja instalado na tela inicial. Toque em "Compartilhar" e depois "Adicionar à Tela de Início".' 
      };
    }
    
    // iOS 16.4+ suporta push notifications
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const match = userAgent.match(/OS (\d+)_/);
    const version = match ? parseInt(match[1]) : 0;
    
    if (version < 16) {
      return { 
        supported: false, 
        reason: 'Notificações push requerem iOS 16.4 ou superior.' 
      };
    }
    
    return { supported: true, reason: null };
  }
  
  // Desktop e outros dispositivos
  return { 
    supported: platform.supportsWebPush, 
    reason: platform.supportsWebPush ? null : 'Seu navegador não suporta notificações push.' 
  };
};
