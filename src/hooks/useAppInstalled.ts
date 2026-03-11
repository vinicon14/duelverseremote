import { useState, useEffect } from 'react';

/**
 * Detect whether the PWA has already been installed (standalone mode) or
 * the `appinstalled` event has fired.  Useful to hide "install" buttons or
 * show alternate UI once the user has installed the app.
 */
export const useAppInstalled = () => {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }

    const handler = () => {
      setInstalled(true);
    };

    window.addEventListener('appinstalled', handler);
    return () => {
      window.removeEventListener('appinstalled', handler);
    };
  }, []);

  return installed;
};
