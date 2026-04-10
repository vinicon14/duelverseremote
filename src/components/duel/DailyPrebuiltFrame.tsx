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

    if (frameRef.current) {
      frameRef.current.destroy();
      frameRef.current = null;
      container.innerHTML = "";
    }

    const frame = DailyIframe.createFrame(container, {
      url: roomUrl,
      activeSpeakerMode: false,
      showLeaveButton: true,
      showFullscreenButton: true,
      iframeStyle: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        border: "0",
      },
    });

    frameRef.current = frame;

    frame.on("joined-meeting", () => {
      console.log("[DailyPrebuiltFrame] forcing grid view");
      frame.setActiveSpeakerMode(false);
    });

    frame.on("error", (event: unknown) => {
      console.error("[DailyPrebuiltFrame] Daily error", event);
    });

    return () => {
      frame.destroy();
      frameRef.current = null;
      container.innerHTML = "";
    };
  }, [roomUrl]);

  return <div ref={containerRef} className={className} />;
};
