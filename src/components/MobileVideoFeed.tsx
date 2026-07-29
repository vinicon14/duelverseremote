/**
 * DuelVerse - Feed vertical estilo TikTok para gravações
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Eye, MessageCircle, Share2, Play, Volume2, VolumeX, ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Recording {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  video_url: string;
  created_at: string;
  views: number;
  is_public: boolean;
  profiles: { username: string; avatar_url: string | null };
}

interface Props {
  recordings: Recording[];
}

export const MobileVideoFeed = ({ recordings }: Props) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number((entry.target as HTMLElement).dataset.idx);
          const video = videoRefs.current[idx];
          if (!video) return;
          if (entry.isIntersecting && entry.intersectionRatio > 0.7) {
            setActiveIndex(idx);
            video.play().catch(() => {});
            // increment view once per session
            const key = `viewed-${recordings[idx]?.id}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              Promise.resolve(supabase.rpc("increment_video_views", { video_id: recordings[idx].id })).catch(() => {});
            }
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.7, 1] }
    );

    const items = containerRef.current?.querySelectorAll("[data-idx]") || [];
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [recordings]);

  const togglePlay = (idx: number) => {
    const v = videoRefs.current[idx];
    if (!v) return;
    if (v.paused) {
      v.play();
      setPaused((p) => ({ ...p, [idx]: false }));
    } else {
      v.pause();
      setPaused((p) => ({ ...p, [idx]: true }));
    }
  };

  const share = async (r: Recording) => {
    const url = `${window.location.origin}/video/${r.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: r.title, url });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] text-white bg-black">
        <Play className="w-16 h-16 opacity-40 mb-4" />
        <p className="opacity-70">Nenhuma gravação disponível</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-40">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-white font-semibold text-sm">Partidas</span>
        <Button variant="ghost" size="icon" onClick={() => setMuted((m) => !m)} className="text-white hover:bg-white/10">
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </Button>
      </div>

      <div
        ref={containerRef}
        className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {recordings.map((r, idx) => (
          <div
            key={r.id}
            data-idx={idx}
            className="relative h-[100dvh] w-full snap-start snap-always flex items-center justify-center bg-black"
            onClick={() => togglePlay(idx)}
          >
            <video
              ref={(el) => (videoRefs.current[idx] = el)}
              src={r.video_url}
              className="w-full h-full object-contain"
              playsInline
              loop
              muted={muted}
              preload={Math.abs(idx - activeIndex) <= 1 ? "auto" : "none"}
            />

            {paused[idx] && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/50 rounded-full p-6">
                  <Play className="w-12 h-12 text-white fill-white" />
                </div>
              </div>
            )}

            {/* Right actions */}
            <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/profile/${r.user_id}`);
                }}
                className="flex flex-col items-center"
              >
                <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden bg-muted">
                  {r.profiles.avatar_url ? (
                    <img src={r.profiles.avatar_url} alt={r.profiles.username} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-full h-full p-2 text-white" />
                  )}
                </div>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/video/${r.id}`);
                }}
                className="flex flex-col items-center text-white"
              >
                <Eye className="w-8 h-8 drop-shadow-lg" />
                <span className="text-xs font-semibold drop-shadow">{r.views}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/video/${r.id}#comments`);
                }}
                className="flex flex-col items-center text-white"
              >
                <MessageCircle className="w-8 h-8 drop-shadow-lg" />
                <span className="text-xs font-semibold drop-shadow">Ver</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  share(r);
                }}
                className="flex flex-col items-center text-white"
              >
                <Share2 className="w-8 h-8 drop-shadow-lg" />
                <span className="text-xs font-semibold drop-shadow">Compartilhar</span>
              </button>
            </div>

            {/* Bottom info */}
            <div className="absolute left-0 right-16 bottom-0 p-4 pb-8 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
              <p className="text-white font-bold text-base mb-1">@{r.profiles.username}</p>
              <p className="text-white text-sm mb-1 line-clamp-2">{r.title}</p>
              {r.description && (
                <p className="text-white/80 text-xs line-clamp-2">{r.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
