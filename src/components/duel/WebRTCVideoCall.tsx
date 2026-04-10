import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, Loader2, LayoutGrid, PictureInPicture2, ZoomIn, ZoomOut } from "lucide-react";

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
  maxPlayers?: number;
  localDeckOpen?: boolean;
  remoteDeckOpen?: boolean;
  localDeckContent?: React.ReactNode;
  remoteDeckContent?: React.ReactNode;
  /** Per-slot remote deck content for 4-player mode (index 0-2 for each remote slot) */
  remoteDeckContents?: (React.ReactNode | undefined)[];
  /** Per-slot remote deck open flags for 4-player mode */
  remoteDeckOpenSlots?: boolean[];
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  // Free TURN servers for NAT traversal between different networks
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

interface PeerState {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
}

export const WebRTCVideoCall = forwardRef<WebRTCVideoCallHandle, WebRTCVideoCallProps>(({
  duelId,
  userId,
  isCreator,
  className,
  layout = "side-by-side",
  onLayoutChange,
  maxPlayers = 2,
  localDeckOpen = false,
  remoteDeckOpen = false,
  localDeckContent,
  remoteDeckContent,
  remoteDeckContents,
  remoteDeckOpenSlots,
}, ref) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remotePeerIds, setRemotePeerIds] = useState<string[]>([]);
  const [pipSwapped, setPipSwapped] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const MAX_ZOOM = 4;
  const MIN_ZOOM = 1;
  const ZOOM_STEP = 0.5;

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

  const createPeerConnection = useCallback((remotePeerId: string) => {
    const existing = peersRef.current.get(remotePeerId);
    if (existing) {
      existing.pc.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peerState: PeerState = {
      pc,
      stream: null,
      makingOffer: false,
      ignoreOffer: false,
    };
    peersRef.current.set(remotePeerId, peerState);

    // Add local tracks
    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    } else {
      console.warn("[WebRTC] No local stream yet for peer:", remotePeerId);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: {
            type: "ice-candidate",
            candidate: event.candidate.toJSON(),
            senderId: userId,
            targetId: remotePeerId,
          },
        });
      }
    };

    // Monitor ICE connection and auto-recover
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state ${remotePeerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn("[WebRTC] ICE failed, restarting for:", remotePeerId);
        pc.restartIce();
        channelRef.current?.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: { type: "ready", senderId: userId },
        });
      } else if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.warn("[WebRTC] Still disconnected, restarting ICE");
            pc.restartIce();
          }
        }, 5000);
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        peerState.stream = event.streams[0];
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(remotePeerId, event.streams[0]);
          return next;
        });
        setRemotePeerIds(prev => {
          if (!prev.includes(remotePeerId)) return [...prev, remotePeerId];
          return prev;
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        peerState.makingOffer = true;
        await pc.setLocalDescription();
        channelRef.current?.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: {
            type: "offer",
            sdp: pc.localDescription,
            senderId: userId,
            targetId: remotePeerId,
          },
        });
      } catch (err) {
        console.error("[WebRTC] negotiation error:", err);
      } finally {
        peerState.makingOffer = false;
      }
    };

    return pc;
  }, [userId]);

  const handleSignal = useCallback(
    async (payload: any) => {
      if (payload.senderId === userId) return;
      // If signal has a targetId and it's not for us, ignore
      if (payload.targetId && payload.targetId !== userId) return;

      const remotePeerId = payload.senderId;

      if (payload.type === "ready") {
        // New peer announced itself, create connection and send offer
        // The peer with "higher" id is polite (to break ties)
        if (!peersRef.current.has(remotePeerId)) {
          createPeerConnection(remotePeerId);
        }
        const peer = peersRef.current.get(remotePeerId);
        if (!peer) return;

        // Only one side should create the offer to avoid glare
        // Use string comparison as tiebreaker
        if (userId > remotePeerId) {
          try {
            peer.makingOffer = true;
            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            channelRef.current?.send({
              type: "broadcast",
              event: "webrtc-signal",
              payload: {
                type: "offer",
                sdp: peer.pc.localDescription,
                senderId: userId,
                targetId: remotePeerId,
              },
            });
          } catch (err) {
            console.error("[WebRTC] offer creation error:", err);
          } finally {
            peer.makingOffer = false;
          }
        }
        return;
      }

      // Ensure peer connection exists
      if (!peersRef.current.has(remotePeerId)) {
        createPeerConnection(remotePeerId);
      }
      const peer = peersRef.current.get(remotePeerId);
      if (!peer) return;
      const pc = peer.pc;
      const polite = userId < remotePeerId;

      try {
        if (payload.type === "offer" || payload.type === "answer") {
          const description = new RTCSessionDescription(payload.sdp);
          const offerCollision =
            payload.type === "offer" &&
            (peer.makingOffer || pc.signalingState !== "stable");

          peer.ignoreOffer = !polite && offerCollision;
          if (peer.ignoreOffer) return;

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
                targetId: remotePeerId,
              },
            });
          }
        } else if (payload.type === "ice-candidate") {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (err) {
            if (!peer.ignoreOffer) {
              console.error("[WebRTC] ICE candidate error:", err);
            }
          }
        }
      } catch (err) {
        console.error("[WebRTC] signal handling error:", err);
      }
    },
    [userId, createPeerConnection]
  );

  useEffect(() => {
    let disposed = false;

    const acquireMedia = async (): Promise<MediaStream | null> => {
      // Try with facingMode for mobile compatibility first
      const constraints = [
        { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true },
        { video: { facingMode: 'user' }, audio: true },
        { video: true, audio: true },
        { video: true, audio: false },
      ];

      for (const constraint of constraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraint);
          console.log("[WebRTC] Media acquired with:", JSON.stringify(constraint));
          return stream;
        } catch (err) {
          console.warn("[WebRTC] Failed constraint:", JSON.stringify(constraint), err);
        }
      }
      return null;
    };

    const init = async () => {
      const stream = await acquireMedia();
      if (disposed) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream) {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        // If peer connections were already created before media was ready,
        // add tracks to all existing peers now
        peersRef.current.forEach((peerState, peerId) => {
          const senders = peerState.pc.getSenders();
          if (senders.length === 0) {
            console.log("[WebRTC] Adding late tracks to peer:", peerId);
            stream.getTracks().forEach((track) => {
              peerState.pc.addTrack(track, stream);
            });
          }
        });
      } else {
        console.error("[WebRTC] Could not acquire any media stream");
      }

      const channel = supabase.channel(`webrtc-signal-${duelId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on("broadcast", { event: "webrtc-signal" }, ({ payload }) => {
          handleSignal(payload);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Announce ourselves
            channel.send({
              type: "broadcast",
              event: "webrtc-signal",
              payload: { type: "ready", senderId: userId },
            });
          }
        });

      channelRef.current = channel;
    };

    init();

    return () => {
      disposed = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      peersRef.current.forEach((peer) => peer.pc.close());
      peersRef.current.clear();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [duelId, userId, handleSignal]);

  // Attach remote streams to video elements
  useEffect(() => {
    remoteStreams.forEach((stream, peerId) => {
      const el = remoteVideoRefs.current.get(peerId);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    });
  }, [remoteStreams, remotePeerIds]);

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

  const zoomIn = () => setZoomLevel(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  const zoomOut = () => {
    setZoomLevel(prev => {
      const next = Math.max(prev - ZOOM_STEP, MIN_ZOOM);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  // Drag handlers for panning zoomed video
  const handlePanStart = (e: React.PointerEvent) => {
    if (zoomLevel <= 1) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePanMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    // Negate dx because scaleX(-1) mirrors the X axis
    setPanOffset({ x: dragStartRef.current.ox - dx, y: dragStartRef.current.oy + dy });
  };

  const handlePanEnd = () => {
    isDraggingRef.current = false;
  };

  const setRemoteVideoRef = useCallback((peerId: string, el: HTMLVideoElement | null) => {
    if (el) {
      remoteVideoRefs.current.set(peerId, el);
      const stream = remoteStreams.get(peerId);
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    } else {
      remoteVideoRefs.current.delete(peerId);
    }
  }, [remoteStreams]);

  const hasRemotePeers = remotePeerIds.length > 0;
  const totalSlots = maxPlayers;
  const is4Player = totalSlots >= 4;
  const isSideBySide = layout === "side-by-side";

  // Build remote slots: fill with connected peers, pad with waiting slots
  const remoteSlots: (string | null)[] = [];
  for (let i = 0; i < totalSlots - 1; i++) {
    remoteSlots.push(remotePeerIds[i] || null);
  }

  const localVideoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    (localVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
      el.srcObject = localStreamRef.current;
    }
  }, []);

  const renderLocalPanel = () => (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Always keep video in DOM so srcObject persists */}
      <video
        ref={localVideoCallbackRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-contain ${localDeckOpen ? 'hidden' : ''} ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{
          transform: `scaleX(-1) scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
        }}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
      />
      {localDeckOpen && localDeckContent ? (
        <div className="w-full h-full overflow-auto bg-background touch-pan-y">
          {localDeckContent}
        </div>
      ) : (
        <>
          {isVideoOff && (
            <div className="absolute inset-0 bg-muted flex items-center justify-center">
              <VideoOff className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
              <p className="text-xs sm:text-sm text-muted-foreground mt-2 absolute bottom-4">Câmera desligada</p>
            </div>
          )}
        </>
      )}
      <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] sm:text-xs text-white z-10">
        Você
      </div>
    </div>
  );

  const renderRemotePanel = (peerId: string | null, index: number) => (
    <div key={peerId || `waiting-${index}`} className="relative w-full h-full overflow-hidden bg-black">
      {peerId && (
        // Check per-slot content first (4-player), then fallback to single remoteDeckContent
        (remoteDeckContents?.[index] && (remoteDeckOpenSlots?.[index] ?? false)) ||
        (remoteDeckOpen && remoteDeckContent && index === 0 && !remoteDeckContents)
      ) ? (
        <div className="w-full h-full overflow-auto bg-background touch-pan-y">
          {remoteDeckContents?.[index] || remoteDeckContent}
        </div>
      ) : peerId ? (
        <video
          ref={(el) => setRemoteVideoRef(peerId, el)}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-2">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-primary animate-spin" />
            <p className="text-[10px] sm:text-xs text-muted-foreground">Aguardando jogador...</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] sm:text-xs text-white z-10">
        {peerId ? `Oponente ${remoteSlots.length > 1 ? index + 1 : ''}` : `Jogador ${index + 2}`}
      </div>
    </div>
  );

  return (
    <div className={`relative ${className || ""}`}>
      {is4Player ? (
        /* ===== 4-PLAYER GRID (2x2 quadrants) ===== */
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
          {/* Top-left: Local (you) */}
          <div className="relative overflow-hidden">
            {renderLocalPanel()}
          </div>
          {/* Top-right: Remote 1 */}
          <div className="relative overflow-hidden">
            {renderRemotePanel(remoteSlots[0], 0)}
          </div>
          {/* Bottom-left: Remote 2 */}
          <div className="relative overflow-hidden">
            {renderRemotePanel(remoteSlots[1], 1)}
          </div>
          {/* Bottom-right: Remote 3 */}
          <div className="relative overflow-hidden">
            {renderRemotePanel(remoteSlots[2], 2)}
          </div>
        </div>
      ) : isSideBySide ? (
        /* ===== SIDE-BY-SIDE (desktop) / STACKED (mobile) ===== */
        <div className="flex flex-col sm:flex-row w-full h-full">
          <div className="relative flex-1 min-h-0">
            {renderLocalPanel()}
          </div>
          <div className="relative flex-1 min-h-0">
            {renderRemotePanel(remoteSlots[0], 0)}
          </div>
        </div>
      ) : (
        /* ===== PIP LAYOUT (2 players) — click small to swap ===== */
        <>
          {/* Big panel */}
          <div className="w-full h-full">
            {pipSwapped ? renderLocalPanel() : renderRemotePanel(remoteSlots[0], 0)}
          </div>
          {/* Small PiP panel — click to swap */}
          <div
            className="absolute bottom-14 right-3 w-[120px] sm:w-[160px] aspect-[4/3] rounded-lg overflow-hidden border-2 border-primary/40 shadow-lg bg-black z-20 cursor-pointer"
            onClick={() => setPipSwapped(prev => !prev)}
            title="Clique para alternar"
          >
            {pipSwapped ? (
              /* Show remote in small */
              remoteSlots[0] ? (
                <video
                  ref={(el) => setRemoteVideoRef(remoteSlots[0]!, el)}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/80">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
              )
            ) : (
              /* Show local in small */
              localDeckOpen && localDeckContent ? (
                <div className="w-full h-full overflow-hidden bg-background flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">Deck aberto</span>
                </div>
              ) : (
                <>
                  <video
                    ref={localVideoCallbackRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    style={{
                      transform: `scaleX(-1) scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                    }}
                    onPointerDown={handlePanStart}
                    onPointerMove={handlePanMove}
                    onPointerUp={handlePanEnd}
                    onPointerCancel={handlePanEnd}
                  />
                  {isVideoOff && (
                    <div className="absolute inset-0 bg-muted flex items-center justify-center">
                      <VideoOff className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </>
      )}

      {/* Controls bar */}
      <div className="absolute bottom-1.5 sm:bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 sm:gap-2 z-20">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleMute}
          className={`rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm ${isMuted ? "bg-destructive/80 text-destructive-foreground" : "bg-card/80"}`}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleVideo}
          className={`rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm ${isVideoOff ? "bg-destructive/80 text-destructive-foreground" : "bg-card/80"}`}
        >
          {isVideoOff ? <VideoOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </Button>
        {/* Zoom controls */}
        <Button
          variant="outline"
          size="icon"
          onClick={zoomOut}
          disabled={zoomLevel <= MIN_ZOOM}
          className="rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm bg-card/80"
          title="Diminuir zoom"
        >
          <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={zoomIn}
          disabled={zoomLevel >= MAX_ZOOM}
          className="rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm bg-card/80"
          title="Aumentar zoom"
        >
          <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Button>
        {/* Layout toggle (only for 2 players) */}
        {!is4Player && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => onLayoutChange?.(isSideBySide ? "pip" : "side-by-side")}
            className="rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm bg-card/80"
            title={isSideBySide ? "Modo PiP" : "Modo lado a lado"}
          >
            {isSideBySide ? <PictureInPicture2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          </Button>
        )}
      </div>
    </div>
  );
});

WebRTCVideoCall.displayName = "WebRTCVideoCall";
