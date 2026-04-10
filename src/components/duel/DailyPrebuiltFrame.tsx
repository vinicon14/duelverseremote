import { useEffect, useRef } from "react";
import DailyIframe from "@daily-co/daily-js";

interface DailyPrebuiltFrameProps {
  roomUrl: string;
  className?: string;
}

export const DailyPrebuiltFrame = ({ roomUrl, className }: DailyPrebuiltFrameProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);

  useEffect(() => {
    if (!roomUrl || !containerRef.current) return;

    const container = containerRef.current;
    let cancelled = false;

    const init = async () => {
      // Destroy any existing instance first
      if (frameRef.current) {
        try {
          await frameRef.current.destroy();
        } catch (e) {
          console.warn("[DailyPrebuiltFrame] destroy error:", e);
        }
        frameRef.current = null;
        container.innerHTML = "";
      }

      // Also check for any global orphaned instance
      try {
        const existing = DailyIframe.getCallInstance();
        if (existing) {
          await existing.destroy();
        }
      } catch {
        // no existing instance, that's fine
      }

      if (cancelled) return;

      try {
        const frame = DailyIframe.createFrame(container, {
          url: roomUrl,
          activeSpeakerMode: false,
          showLeaveButton: true,
          showFullscreenButton: true,
          iframeStyle: {
            position: "absolute",
            top: "0px",
            left: "0px",
            width: "100%",
            height: "100%",
            border: "0",
          },
        });

        if (cancelled) {
          frame.destroy();
          return;
        }

        frameRef.current = frame;

        frame.on("joined-meeting", () => {
          console.log("[DailyPrebuiltFrame] forcing grid view");
          frame.setActiveSpeakerMode(false);
        });

        frame.on("error", (event: unknown) => {
          console.error("[DailyPrebuiltFrame] Daily error", event);
        });
      } catch (e) {
        console.error("[DailyPrebuiltFrame] createFrame error:", e);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (frameRef.current) {
        frameRef.current.destroy().catch(() => {});
        frameRef.current = null;
      }
      container.innerHTML = "";
    };
  }, [roomUrl]);

  return <div ref={containerRef} className={className} />;
};
