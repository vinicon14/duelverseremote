import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/G85qXVsxb56D3nhqyxbEKH";
const DISMISS_KEY = "dv_whatsapp_dismissed";
const POS_KEY = "dv_whatsapp_pos";

const hideOnRoutes = ["/duel/"];

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
  } catch {}
}

export const WhatsAppButton = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const isMobile = useIsMobile();
  const btnRef = useRef<HTMLAnchorElement>(null);
  const dragState = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    didMove: false,
  });

  const [dismissed, setDismissed] = useState(loadDismissed);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => loadPosition());

  const isHidden = hideOnRoutes.some((p) => location.pathname.startsWith(p));

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dismiss();
    },
    [dismiss]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragState.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) + Math.abs(dy) > 5) d.didMove = true;
      if (!d.didMove) return;
      const el = btnRef.current;
      if (!el) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newLeft = Math.max(0, Math.min(d.startLeft + dx, vw - 48));
      const newTop = Math.max(0, Math.min(d.startTop + dy, vh - 48));
      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    };

    const onUp = () => {
      const d = dragState.current;
      if (!d.active) return;
      d.active = false;
      if (d.didMove) {
        const el = btnRef.current;
        if (el) {
          const x = Math.round(el.getBoundingClientRect().left);
          const y = Math.round(el.getBoundingClientRect().top);
          setPos({ x, y });
          savePosition(x, y);
        }
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      didMove: false,
    };
  }, []);

  if (isHidden || dismissed) return null;

  const style: React.CSSProperties = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px`, right: "auto", bottom: "auto" }
    : isMobile
    ? { left: 16, bottom: 80, right: "auto" }
    : { right: 24, bottom: 24 };

  return (
    <a
      ref={btnRef}
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("whatsappGroup.label")}
      title={t("whatsappGroup.dismissHint")}
      style={style}
      className="fixed z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-green-500/50 bg-background/80 backdrop-blur-md text-green-500 shadow-lg transition-colors hover:bg-green-500/10 hover:border-green-500 hover:shadow-green-500/20 select-none"
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        if (dragState.current.didMove) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <MessageCircle className="h-5 w-5" />
    </a>
  );
};
