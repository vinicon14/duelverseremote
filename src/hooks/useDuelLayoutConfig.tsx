import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ElementPosition {
  x: number;
  y: number;
}

interface LayoutConfig {
  calculator_desktop: ElementPosition;
  calculator_mobile: ElementPosition;
  deck_viewer_desktop: ElementPosition;
  deck_viewer_mobile: ElementPosition;
  opponent_viewer_desktop: ElementPosition;
  opponent_viewer_mobile: ElementPosition;
  hide_button_desktop: ElementPosition;
  hide_button_mobile: ElementPosition;
  record_button_desktop: ElementPosition;
  record_button_mobile: ElementPosition;
}

const DEFAULT_CONFIG: LayoutConfig = {
  calculator_desktop: { x: 20, y: 100 },
  calculator_mobile: { x: 10, y: 80 },
  deck_viewer_desktop: { x: 8, y: 80 },
  deck_viewer_mobile: { x: 8, y: 80 },
  opponent_viewer_desktop: { x: 8, y: 80 },
  opponent_viewer_mobile: { x: 8, y: 80 },
  hide_button_desktop: { x: 0, y: 0 },
  hide_button_mobile: { x: 0, y: 0 },
  record_button_desktop: { x: 0, y: 0 },
  record_button_mobile: { x: 0, y: 0 },
};

export const useDuelLayoutConfig = () => {
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "duelroom_layout_config")
          .maybeSingle();

        if (data?.value) {
          const parsed = JSON.parse(data.value);
          setConfig({ ...DEFAULT_CONFIG, ...parsed });
        }
      } catch {
        // use defaults
      }
    };
    fetch();
  }, []);

  const getPosition = (element: "calculator" | "deck_viewer" | "opponent_viewer" | "hide_button" | "record_button"): ElementPosition => {
    const isMobile = window.innerWidth < 768;
    const key = `${element}_${isMobile ? "mobile" : "desktop"}` as keyof LayoutConfig;
    return config[key];
  };

  return { config, getPosition };
};
