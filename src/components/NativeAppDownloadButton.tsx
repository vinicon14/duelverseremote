import { Button } from "@/components/ui/button";
import { Download, Smartphone, Monitor, Apple } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";

interface NativeAppDownloadButtonProps {
  variant?: "button" | "card";
  className?: string;
}

export function NativeAppDownloadButton({ variant = "button", className = "" }: NativeAppDownloadButtonProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("android");
  const { toast } = useToast();

  useEffect(() => {
    // Detect user platform
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Check for Android
    if (userAgent.includes("android")) {
      setPlatform("android");
      setDownloadUrl(import.meta.env.VITE_ANDROID_APK_URL || null);
    }
    // Check for iOS
    else if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform("ios");
      setDownloadUrl(import.meta.env.VITE_IOS_APP_URL || null);
    }
    // Check for Windows
    else if (userAgent.includes("win")) {
      setPlatform("windows");
      setDownloadUrl(import.meta.env.VITE_WINDOWS_EXE_URL || null);
    }
    // Default to Android
    else {
      setPlatform("android");
      setDownloadUrl(import.meta.env.VITE_ANDROID_APK_URL || null);
    }
  }, []);

  const handleDownload = () => {
    if (!downloadUrl) {
      toast({
        title: "Download não disponível",
        description: "O aplicativo nativo ainda não está disponível para esta plataforma. Use a versão PWA!",
        variant: "destructive",
      });
      return;
    }

    // Open download in new tab
    window.open(downloadUrl, "_blank");
    
    toast({
      title: "Download iniciado",
      description: "O download do app começou. Verifique sua pasta de downloads.",
    });
  };

  const getButtonContent = () => {
    switch (platform) {
      case "ios":
        return (
          <>
            <Apple className="mr-2 h-5 w-5" />
            Baixar para iOS
          </>
        );
      case "windows":
        return (
          <>
            <Monitor className="mr-2 h-5 w-5" />
            Baixar para Windows
          </>
        );
      default:
        return (
          <>
            <Download className="mr-2 h-5 w-5" />
            Baixar App
          </>
        );
    }
  };

  const getAllDownloadOptions = () => {
    const options = [];
    
    // Use env vars or fallback to duelverse.site
    const androidUrl = import.meta.env.VITE_ANDROID_APK_URL || "https://duelverse.site/downloads/duelverse-app.apk";
    const iosUrl = import.meta.env.VITE_IOS_APP_URL || "";
    const windowsUrl = import.meta.env.VITE_WINDOWS_EXE_URL || "https://duelverse.site/downloads/Duelverse.exe";
    
    if (androidUrl) {
      options.push({
        platform: "Android",
        icon: <Smartphone className="h-5 w-5" />,
        url: androidUrl,
      });
    }
    
    if (iosUrl) {
      options.push({
        platform: "iOS",
        icon: <Apple className="h-5 w-5" />,
        url: iosUrl,
      });
    }
    
    if (windowsUrl) {
      options.push({
        platform: "Windows",
        icon: <Monitor className="h-5 w-5" />,
        url: windowsUrl,
      });
    }
    
    return options;
  };

  // Card variant shows all download options
  if (variant === "card") {
    const options = getAllDownloadOptions();
    
    if (options.length === 0) {
      return (
        <div className={`text-center p-4 text-muted-foreground ${className}`}>
          <p>O aplicativo nativo Em breve!</p>
          <p className="text-sm mt-1">Enquanto isso, use a versão PWA</p>
        </div>
      );
    }
    
    return (
      <div className={`space-y-3 ${className}`}>
        <p className="text-sm font-medium">Baixar App Nativo</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {options.map((option) => (
            <Button
              key={option.platform}
              variant="outline"
              size="sm"
              onClick={() => window.open(option.url, "_blank")}
              className="flex items-center justify-center gap-2"
            >
              {option.icon}
              <span>{option.platform}</span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Button variant shows platform-specific download
  // If no platform-specific URL, show card variant with all options
  if (!downloadUrl) {
    const allOptions = getAllDownloadOptions();
    if (allOptions.length === 0) {
      return (
        <Button
          onClick={handleDownload}
          variant="secondary"
          size="lg"
          className={className}
          disabled
        >
          <Download className="mr-2 h-5 w-5" />
          Em breve
        </Button>
      );
    }
    // Show dropdown or all options
    return (
      <div className={`flex gap-2 ${className}`}>
        {allOptions.map((option) => (
          <Button
            key={option.platform}
            onClick={() => window.open(option.url, "_blank")}
            variant="secondary"
            size="lg"
            className="flex items-center gap-2"
          >
            {option.icon}
            {option.platform}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <Button
      onClick={handleDownload}
      variant="secondary"
      size="lg"
      className={className}
    >
      {getButtonContent()}
    </Button>
  );
}

export default NativeAppDownloadButton;
