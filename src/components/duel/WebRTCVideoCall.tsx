import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, Loader2, LayoutGrid, PictureInPicture2 } from "lucide-react";

export type VideoLayout = "side-by-side" | "pip";

export interface WebRTCVideoCallHandle {
  setVideoEnabled: (enabled: boolean) => void;
  isVideoOff: boolean;
}

interface WebRTCVideoCallProps {
  duelId: string;
  userId: string;
  isCreator: boolean;
  className?: string;
  layout?: VideoLayout;
  onLayoutChange?: (layout: VideoLayout) => void;
  /** When true, local video is replaced by a deck overlay (managed by parent) */
  localDeckOpen?: boolean;
  /** When true, remote video is replaced by opponent deck overlay (managed by parent) */
  remoteDeckOpen?: boolean;
  /** Render prop for local deck overlay content */
  localDeckContent?: React.ReactNode;
  /** Render prop for remote deck overlay content */
  remoteDeckContent?: React.ReactNode;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export const WebRTCVideoCall = forwardRef<WebRTCVideoCallHandle, WebRTCVideoCallProps>(({
  duelId,
  userId,
  isCreator,
  className,
  layout = "side-by-side",
  onLayoutChange,
  localDeckOpen = false,
  remoteDeckOpen = false,
  localDeckContent,
  remoteDeckContent,
}, ref) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const politeRef = useRef(isCreator);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
  const [hasRemoteStream, setHasRemoteStream] = useState(false);

  // Expose video control to parent
  useImperativeHandle(ref, () => ({
    setVideoEnabled: (enabled: boolean) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = enabled;
        setIsVideoOff(!enabled);
      }
    },
    isVideoOff,
  }), [isVideoOff]);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: {
            type: "ice-candidate",
            candidate: event.candidate.toJSON(),
            senderId: userId,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setHasRemoteStream(true);
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        channelRef.current?.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: {
            type: "offer",
            sdp: pc.localDescription,
            senderId: userId,
          },
        });
      } catch (err) {
        console.error("[WebRTC] negotiation error:", err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    return pc;
  }, [userId]);

  const handleSignal = useCallback(
    async (payload: any) => {
      if (payload.senderId === userId) return;
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (payload.type === "offer" || payload.type === "answer") {
          const description = new RTCSessionDescription(payload.sdp);
          const offerCollision =
            payload.type === "offer" &&
            (makingOfferRef.current || pc.signalingState !== "stable");

          ignoreOfferRef.current = !politeRef.current && offerCollision;
          if (ignoreOfferRef.current) return;

          await pc.setRemoteDescription(description);

          if (payload.type === "offer") {
            await pc.setLocalDescription();
            channelRef.current?.send({
              type: "broadcast",
              event: "webrtc-signal",
              payload: {
                type: "answer",
                sdp: pc.localDescription,
                senderId: userId,
              },
            });
          }
        } else if (payload.type === "ice-candidate") {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (err) {
            if (!ignoreOfferRef.current) {
              console.error("[WebRTC] ICE candidate error:", err);
            }
          }
        } else if (payload.type === "ready") {
          if (isCreator && pc.signalingState === "stable" && !makingOfferRef.current) {
            try {
              makingOfferRef.current = true;
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              channelRef.current?.send({
                type: "broadcast",
                event: "webrtc-signal",
                payload: {
                  type: "offer",
                  sdp: pc.localDescription,
                  senderId: userId,
                },
              });
            } catch (err) {
              console.error("[WebRTC] offer creation error:", err);
            } finally {
              makingOfferRef.current = false;
            }
          }
        }
      } catch (err) {
        console.error("[WebRTC] signal handling error:", err);
      }
    },
    [userId, isCreator]
  );

  useEffect(() => {
    let disposed = false;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = createPeerConnection();
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        const channel = supabase.channel(`webrtc-signal-${duelId}`, {
          config: { broadcast: { self: false } },
        });

        channel
          .on("broadcast", { event: "webrtc-signal" }, ({ payload }) => {
            handleSignal(payload);
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              channel.send({
                type: "broadcast",
                event: "webrtc-signal",
                payload: { type: "ready", senderId: userId },
              });
            }
          });

        channelRef.current = channel;
      } catch (err) {
        console.error("[WebRTC] Failed to get media:", err);
        createPeerConnection();

        const channel = supabase.channel(`webrtc-signal-${duelId}`, {
          config: { broadcast: { self: false } },
        });
        channel
          .on("broadcast", { event: "webrtc-signal" }, ({ payload }) => {
            handleSignal(payload);
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              channel.send({
                type: "broadcast",
                event: "webrtc-signal",
                payload: { type: "ready", senderId: userId },
              });
            }
          });
        channelRef.current = channel;
      }
    };

    init();

    return () => {
      disposed = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [duelId, userId, createPeerConnection, handleSignal]);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  const isConnecting = connectionState === "new" || connectionState === "connecting";
  const isConnected = connectionState === "connected";
  const isFailed = connectionState === "failed" || connectionState === "disconnected";

  const isSideBySide = layout === "side-by-side";

  return (
    <div className={`relative ${className || ""}`}>
      {isSideBySide ? (
        /* ===== SIDE-BY-SIDE LAYOUT (Discord-style) ===== */
        <div className="flex w-full h-full gap-1">
          {/* Left panel — LOCAL (my camera / my deck) */}
          <div className="relative flex-1 rounded-lg overflow-hidden bg-black">
            {localDeckOpen && localDeckContent ? (
              <div className="w-full h-full overflow-auto bg-background">
                {localDeckContent}
              </div>
            ) : (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                {isVideoOff && (
                  <div className="absolute inset-0 bg-muted flex items-center justify-center">
                    <VideoOff className="w-10 h-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2 absolute bottom-4">Câmera desligada</p>
                  </div>
                )}
              </>
            )}
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-xs text-white z-10">
              Você
            </div>
          </div>

          {/* Right panel — REMOTE (opponent camera / opponent deck) */}
          <div className="relative flex-1 rounded-lg overflow-hidden bg-black">
            {remoteDeckOpen && remoteDeckContent ? (
              <div className="w-full h-full overflow-auto bg-background">
                {remoteDeckContent}
              </div>
            ) : (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!hasRemoteStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="text-center space-y-3">
                      {isConnecting && (
                        <>
                          <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" />
                          <p className="text-xs text-muted-foreground">Aguardando oponente...</p>
                        </>
                      )}
                      {isFailed && (
                        <p className="text-xs text-destructive">Conexão perdida</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-xs text-white z-10">
              Oponente
            </div>
          </div>
        </div>
      ) : (
        /* ===== PIP LAYOUT (original) ===== */
        <>
          {/* Remote video (full size) */}
          {remoteDeckOpen && remoteDeckContent ? (
            <div className="w-full h-full overflow-auto bg-background">
              {remoteDeckContent}
            </div>
          ) : (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover bg-black"
              />
              {!hasRemoteStream && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="text-center space-y-3">
                    {isConnecting && (
                      <>
                        <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
                        <p className="text-sm text-muted-foreground">Aguardando oponente...</p>
                      </>
                    )}
                    {isFailed && (
                      <p className="text-sm text-destructive">Conexão perdida. Tente recarregar a página.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Local video (picture-in-picture) */}
          <div className="absolute bottom-14 right-3 w-[120px] sm:w-[160px] aspect-[4/3] rounded-lg overflow-hidden border-2 border-primary/40 shadow-lg bg-black z-20">
            {localDeckOpen && localDeckContent ? (
              <div className="w-full h-full overflow-hidden bg-background flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground">Deck aberto</span>
              </div>
            ) : (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                {isVideoOff && (
                  <div className="absolute inset-0 bg-muted flex items-center justify-center">
                    <VideoOff className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Controls bar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleMute}
          className={`rounded-full w-10 h-10 backdrop-blur-sm ${isMuted ? "bg-destructive/80 text-destructive-foreground" : "bg-card/80"}`}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleVideo}
          className={`rounded-full w-10 h-10 backdrop-blur-sm ${isVideoOff ? "bg-destructive/80 text-destructive-foreground" : "bg-card/80"}`}
        >
          {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </Button>
        {/* Layout toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onLayoutChange?.(isSideBySide ? "pip" : "side-by-side")}
          className="rounded-full w-10 h-10 backdrop-blur-sm bg-card/80"
          title={isSideBySide ? "Modo PiP" : "Modo lado a lado"}
        >
          {isSideBySide ? <PictureInPicture2 className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </Button>
      </div>

      {/* Connection status indicator */}
      {isConnected && (
        <div className="absolute top-3 left-3 z-20">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" title="Conectado" />
        </div>
      )}
    </div>
  );
});

WebRTCVideoCall.displayName = "WebRTCVideoCall";
