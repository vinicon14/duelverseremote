import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Smartphone, Camera, AlertCircle } from "lucide-react";

/**
 * Mobile-only page. Scans QR (or receives ?s=&t= directly) and
 * redirects to the fullscreen camera mode.
 */
const PhoneConnect = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = params.get("s");
  const t = params.get("t");

  // If URL already carries s+t (opened from QR link) → jump straight into camera mode
  useEffect(() => {
    if (s && t) {
      navigate(`/phone-camera?s=${encodeURIComponent(s)}&t=${encodeURIComponent(t)}`, { replace: true });
    }
  }, [s, t, navigate]);

  const startScan = async () => {
    setError(null);
    setScanning(true);
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          try {
            const url = new URL(decoded);
            const ns = url.searchParams.get("s");
            const nt = url.searchParams.get("t");
            if (ns && nt) {
              scanner.stop().catch(() => {});
              navigate(`/phone-camera?s=${encodeURIComponent(ns)}&t=${encodeURIComponent(nt)}`, {
                replace: true,
              });
            }
          } catch {
            /* not a URL */
          }
        },
        () => {},
      );
    } catch (e: any) {
      setError(e?.message ?? "Falha ao iniciar câmera");
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, []);

  return (
    <div className="h-[100dvh] overflow-hidden bg-background flex flex-col items-center p-3 overscroll-none">
      <div className="w-full max-w-md h-full min-h-0 flex flex-col gap-3">
        <div className="shrink-0 text-center space-y-1">
          <div className="flex justify-center">
            <Smartphone className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Conectar ao Computador</h1>
          <p className="text-sm text-muted-foreground">
            No PC, abra <b>Conectar celular</b> e escaneie o QR Code.
          </p>
        </div>

        {!scanning && (
          <Button onClick={startScan} size="lg" className="w-full shrink-0">
            <Camera className="h-5 w-5 mr-2" />
            Iniciar leitor de QR
          </Button>
        )}

        <div
          id="qr-reader"
          className="w-full min-h-0 flex-1 max-h-[min(68dvh,420px)] rounded-lg overflow-hidden bg-black border"
        />

        {error && (
          <div className="shrink-0 flex items-start gap-2 text-xs text-destructive p-2 border border-destructive/30 rounded-md bg-destructive/5">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="shrink-0 text-xs text-muted-foreground text-center">
          <p>Requer permissão de câmera para leitura do QR.</p>
        </div>
      </div>
    </div>
  );
};

export default PhoneConnect;
