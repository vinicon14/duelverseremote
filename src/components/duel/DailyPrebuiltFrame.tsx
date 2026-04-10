import { useEffect, useRef } from "react";
import DailyIframe from "@daily-co/daily-js";

interface DailyPrebuiltFrameProps {
  roomUrl: string;
  className?: string;
}

type DailyFrameInstance = ReturnType<typeof DailyIframe.createFrame>;

let activeFrame: DailyFrameInstance | null = null;
let activeFrameCleanup: Promise<void> = Promise.resolve();

const destroyFrame = async (
  frame: DailyFrameInstance | null | undefined,
  container?: HTMLDivElement | null,
) => {
  if (!frame) {
    container?.replaceChildren();
    return;
  }

  try {
    if (!frame.isDestroyed()) {
      await frame.destroy();
    }
  } catch (error) {
    console.warn("[DailyPrebuiltFrame] destroy error:", error);
  } finally {
    if (activeFrame === frame) {
      activeFrame = null;
    }

    if (container?.isConnected) {
      container.replaceChildren();
    }
  }
};

export const DailyPrebuiltFrame = ({ roomUrl, className }: DailyPrebuiltFrameProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<DailyFrameInstance | null>(null);

  useEffect(() => {
    if (!roomUrl || !containerRef.current) return;

    const container = containerRef.current;
    let disposed = false;

    const init = async () => {
      await activeFrameCleanup;

      const existingFrame = activeFrame ?? DailyIframe.getCallInstance();
      if (existingFrame && !existingFrame.isDestroyed()) {
        activeFrameCleanup = destroyFrame(existingFrame, container);
        await activeFrameCleanup;
      }

      if (disposed || !container.isConnected) return;

      const frame = DailyIframe.createFrame(container, {
        url: roomUrl,
        activeSpeakerMode: false,
        allowMultipleCallInstances: true,
        showLeaveButton: true,
        showFullscreenButton: true,
        iframeStyle: {
          position: "absolute",
          inset: "0px",
          width: "100%",
          height: "100%",
          border: "0",
        },
      });

      if (disposed) {
        await destroyFrame(frame, container);
        return;
      }

      activeFrame = frame;
      frameRef.current = frame;

      frame.on("joined-meeting", () => {
        frame.setActiveSpeakerMode(false);
      });

      frame.on("error", (event: unknown) => {
        console.error("[DailyPrebuiltFrame] Daily error", event);
      });
    };

    void init();

    return () => {
      disposed = true;

      const currentFrame = frameRef.current;
      frameRef.current = null;

      if (currentFrame) {
        activeFrameCleanup = destroyFrame(currentFrame, container);
      } else {
        container.replaceChildren();
      }
    };
  }, [roomUrl]);

  return <div ref={containerRef} className={className} />;
};
