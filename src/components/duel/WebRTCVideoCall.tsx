import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, MicOff, Video, VideoOff, Loader2, LayoutGrid, PictureInPicture2, ZoomIn, ZoomOut, Settings, Smartphone, Volume2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePhoneStream } from "@/contexts/PhoneStreamContext";
import { registerRemoteStream, unregisterRemoteStream, clearRemoteStreams } from "@/utils/remoteAudioRegistry";
import { CameraZoomPipeline, applyNativeZoom, applyNativeZoomSmooth, getNativeZoomRange } from "@/utils/cameraZoom";

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
  /** Spectator LP overlay: labels & values for local panel and remote panels */
  spectatorLpOverlay?: {
    localLabel: string;
    localLp: number;
    remotePlayers: { label: string; lp: number }[];
  };
  /** When true, user is a spectator: receive-only, no local media, no controls */
  isSpectator?: boolean;
  /** Spectator variant: judge spectator that ALSO transmits microphone audio to players
   *  (still no local camera, still receives players' video). */
  audioBroadcastOnly?: boolean;
  /** Creator user ID - used by spectators to correctly order peers (creator on left) */
  creatorId?: string;
  /** Official duel player IDs. Spectators only accept media from these peers. */
  playerIds?: string[];
  /** Compact mobile arena: opponent field above, own field below, no internal scrollbars. */
  mobileArenaMode?: boolean;
}

// Baseline STUN servers. TURN relays (needed on 4G / symmetric NAT / VPN, where
// the opponent camera never arrives on a direct path) are fetched at runtime
// from the backend so credentials can be rotated without a deploy.
const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

// Best-effort public relay used only until the backend list arrives. It is NOT
// considered a verified relay: forcing `iceTransportPolicy: "relay"` on a dead
// TURN server blocks even the peers that would connect directly.
const FALLBACK_TURN: RTCIceServer[] = [
  {
    urls: [
      "turn:global.relay.metered.ca:80",
      "turn:global.relay.metered.ca:443",
      "turn:global.relay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

let runtimeIceServers: RTCIceServer[] = [...STUN_SERVERS, ...FALLBACK_TURN];
// True only when the backend confirmed real (configured) TURN credentials.
let verifiedTurn = false;
let iceServersPromise: Promise<void> | null = null;

const hasTurnIn = (servers: RTCIceServer[]) =>
  servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === "string" && u.startsWith("turn"));
  });

/** Fetch TURN credentials once per page load (cached module-wide).
 *  Never blocks the handshake for more than 3s: a slow/failed backend must not
 *  delay (or prevent) the peer connections. */
const ensureIceServers = () => {
  if (iceServersPromise) return iceServersPromise;
  const load = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-ice-servers");
      const servers = (data as any)?.iceServers;
      if (!error && Array.isArray(servers) && servers.length > 0) {
        const list = servers as RTCIceServer[];
        // Always keep a relay path available.
        runtimeIceServers = hasTurnIn(list) ? list : [...list, ...FALLBACK_TURN];
        verifiedTurn = Boolean((data as any)?.hasTurn);
        console.log(
          "[WebRTC] ICE servers loaded:",
          runtimeIceServers.length,
          "verifiedTurn:",
          verifiedTurn,
        );
      }
    } catch (err) {
      console.warn("[WebRTC] Falling back to default ICE servers:", err);
    }
  })();
  iceServersPromise = Promise.race([
    load,
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
  return iceServersPromise;
};


const basePcConfig = (): RTCConfiguration => ({
  iceServers: runtimeIceServers,
  iceCandidatePoolSize: 4,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
});

/** Peers whose direct (host/srflx) path already failed: force TURN relay only.
 *  The normal connection already exhausted direct candidates, so rebuilding it
 *  with relay-only avoids repeating the same failed route indefinitely. */
const buildPcConfig = (forceRelay: boolean): RTCConfiguration => {
  const config = basePcConfig();
  return forceRelay ? { ...config, iceTransportPolicy: "relay" } : config;
};

const isVirtualCamera = (label?: string) => /droidcam|obs virtual|virtual camera|iriun|epoccam/i.test(label ?? "");

/** Virtual cameras often expose formats that Chromium renders as a green frame
 * when 16:9/HD is forced. Keep their native 4:3-compatible capture profile. */
const stabilizeVideoTrack = async (track?: MediaStreamTrack) => {
  if (!track) return;
  track.contentHint = "motion";
  if (!isVirtualCamera(track.label)) return;
  try {
    await track.applyConstraints({
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24, max: 30 },
    });
    console.log("[WebRTC] Virtual camera compatibility mode enabled:", track.label);
  } catch (err) {
    console.warn("[WebRTC] Could not apply virtual camera compatibility mode:", err);
  }
};




interface PeerState {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  createdAt: number;
  lastVideoTrackAt: number | null;
  pendingCandidates: RTCIceCandidateInit[];
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
  spectatorLpOverlay,
  isSpectator = false,
  audioBroadcastOnly = false,
  creatorId,
  playerIds = [],
  mobileArenaMode = false,
}, ref) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  // Dedicated audio elements per peer: guarantee we always hear every player,
  // even when their <video> is hidden (deck overlay) or unmounted (PiP swap).
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remotePeerIds, setRemotePeerIds] = useState<string[]>([]);
  // Peers that announced themselves as spectators. Their connections are kept for
  // audio (judge spectators broadcast mic) but must NEVER occupy a video slot,
  // otherwise another spectator steals the slot meant for player 2.
  const spectatorPeersRef = useRef<Set<string>>(new Set());
  const [spectatorPeerIds, setSpectatorPeerIds] = useState<string[]>([]);
  // When a remote video track goes "muted" (frozen feed) we remember since when,
  // so a long freeze can trigger a peer rebuild.
  const frozenVideoSinceRef = useRef<Map<string, number>>(new Map());

  const playerIdsRef = useRef(new Set(playerIds.filter(Boolean)));
  // Peers whose direct path failed at least once -> retry through TURN only.
  const relayOnlyPeersRef = useRef<Set<string>>(new Set());

  const [pipSwapped, setPipSwapped] = useState(false);

  useEffect(() => {
    playerIdsRef.current = new Set(playerIds.filter(Boolean));
  }, [playerIds]);


  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const MAX_ZOOM = 4;
  const MIN_ZOOM = 0.7;
  const ZOOM_STEP = 0.15;
  // Real camera zoom (native track zoom when supported, canvas pipeline otherwise)
  const zoomPipelineRef = useRef<CameraZoomPipeline | null>(null);
  const zoomLevelRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const nativeZoomActiveRef = useRef(false);

  // Device selection
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
    } catch (err) {
      console.warn("[WebRTC] Failed to enumerate devices:", err);
    }
  }, []);

  useEffect(() => {
    // Spectators don't need device enumeration
    if (isSpectator) return;
    enumerateDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', enumerateDevices);
    };
  }, [enumerateDevices, isSpectator]);

  // Switch device: acquire new stream with chosen device, replace tracks in all peers
  const switchDevice = useCallback(async (audioId?: string, videoId?: string) => {
    // Em mobile, priorizar câmera traseira ('environment') quando nenhum deviceId específico for informado
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const defaultFacing = isMobile ? 'environment' : 'user';
    const selectedVideo = videoDevices.find((device) => device.deviceId === videoId);
    const virtualCameraSelected = isVirtualCamera(selectedVideo?.label);
    const constraints: MediaStreamConstraints = {
      audio: audioId ? { deviceId: { exact: audioId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: videoId
        ? virtualCameraSelected
          ? { deviceId: { exact: videoId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }
          : { deviceId: { exact: videoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: defaultFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      await stabilizeVideoTrack(newStream.getVideoTracks()[0]);

      const previousStream = localStreamRef.current;
      localStreamRef.current = newStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
        localVideoRef.current.play?.().catch(() => {});
      }

      // Replace tracks in all peer connections
      const trackReplacements: Promise<void>[] = [];
      peersRef.current.forEach((peerState) => {
        const senders = peerState.pc.getSenders();
        newStream.getTracks().forEach(newTrack => {
          const sender = senders.find(s => s.track?.kind === newTrack.kind);
          if (sender) {
            trackReplacements.push(sender.replaceTrack(newTrack));
          } else {
            peerState.pc.addTrack(newTrack, newStream);
          }
        });
      });

      // Stop the former capture only after every sender points at the new tracks.
      // Stopping first can leave Chromium/Android encoders on a green frame.
      await Promise.allSettled(trackReplacements);
      previousStream?.getTracks().forEach((track) => track.stop());

      // Re-enumerate to get labels (available after permission grant)
      await enumerateDevices();

      // Update selected IDs
      const newAudioTrack = newStream.getAudioTracks()[0];
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newAudioTrack) setSelectedAudioId(newAudioTrack.getSettings().deviceId || "");
      if (newVideoTrack) setSelectedVideoId(newVideoTrack.getSettings().deviceId || "");

      // Restore mute/video-off state
      if (isMuted && newAudioTrack) newAudioTrack.enabled = false;
      if (isVideoOff && newVideoTrack) newVideoTrack.enabled = false;

      console.log("[WebRTC] Device switched successfully");
    } catch (err) {
      console.error("[WebRTC] Failed to switch device:", err);
    }
  }, [isMuted, isVideoOff, enumerateDevices, videoDevices]);

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

  // ==== Phone camera override ====
  // When a phone is paired, its video (and audio if provided) takes priority over
  // the PC camera. On disconnect we restore the original getUserMedia tracks.
  const { phoneStream } = usePhoneStream();
  const phoneStreamRef = useRef<MediaStream | null>(null);
  const isMutedRef = useRef(isMuted);
  const isVideoOffRef = useRef(isVideoOff);

  useEffect(() => {
    phoneStreamRef.current = phoneStream;
    isMutedRef.current = isMuted;
    isVideoOffRef.current = isVideoOff;
  }, [phoneStream, isMuted, isVideoOff]);

  const getActiveOutboundStream = useCallback(() => {
    const original = localStreamRef.current;
    const activePhoneStream = phoneStreamRef.current;
    const phoneVideo = activePhoneStream?.getVideoTracks()[0];
    const pcVideo = original?.getVideoTracks()[0];
    // A disconnected phone can leave an ended track in context. Never let that
    // stale track keep overriding the working PC camera.
    const phoneVideoUsable = phoneVideo?.readyState === "live";
    const pcVideoUsable = pcVideo?.readyState === "live";
    const rawVideo = phoneVideoUsable ? phoneVideo : pcVideoUsable ? pcVideo : null;

    // Audio fallback: if phone mic is off, ended, muted, or missing, use PC mic
    const phoneAudio = activePhoneStream?.getAudioTracks()[0];
    const pcAudio = original?.getAudioTracks()[0];
    const phoneAudioUsable = phoneAudio && phoneAudio.readyState === "live" && phoneAudio.enabled;
    const activeAudio = phoneAudioUsable ? phoneAudio : pcAudio ?? null;

    if (rawVideo) rawVideo.enabled = !isVideoOffRef.current;
    if (activeAudio) activeAudio.enabled = !isMutedRef.current;

    // If a software zoom pipeline is running on top of this exact source, send
    // the processed (zoomed) track so remote peers also see the zoom.
    const pipeline = zoomPipelineRef.current;
    let activeVideo = rawVideo;
    if (rawVideo && pipeline && pipeline.sourceTrack === rawVideo && pipeline.outputTrack) {
      pipeline.syncEnabled();
      activeVideo = pipeline.outputTrack;
    }

    const stream = new MediaStream();
    if (activeVideo) stream.addTrack(activeVideo);
    if (activeAudio) stream.addTrack(activeAudio);
    return stream.getTracks().length > 0 ? stream : null;
  }, []);

  /** Push the current outbound stream (already zoom-processed) to every peer. */
  const republishOutbound = useCallback(() => {
    const outboundStream = getActiveOutboundStream();
    const activeVideo = outboundStream?.getVideoTracks()[0] ?? null;
    const activeAudio = outboundStream?.getAudioTracks()[0] ?? null;

    // Replace tracks on all peer senders
    peersRef.current.forEach(({ pc }) => {
      const senders = pc.getSenders();
      const vs = senders.find((s) => s.track?.kind === "video");
      if (vs) {
        vs.replaceTrack(activeVideo).catch(() => {});
      } else if (activeVideo && outboundStream) {
        pc.addTrack(activeVideo, outboundStream);
      }

      const as = senders.find((s) => s.track?.kind === "audio");
      if (as) {
        as.replaceTrack(activeAudio).catch(() => {});
      } else if (activeAudio && outboundStream) {
        pc.addTrack(activeAudio, outboundStream);
      }
    });

    // Update local preview
    if (localVideoRef.current && outboundStream) {
      localVideoRef.current.srcObject = outboundStream;
      localVideoRef.current.play?.().catch(() => {});
    }
  }, [getActiveOutboundStream]);

  useEffect(() => {
    if (isSpectator) return;
    republishOutbound();
  }, [phoneStream, isSpectator, republishOutbound]);

  // ==== Real camera zoom ====
  // Applies the zoom to the captured video itself (native track zoom when the
  // device supports it, canvas crop/shrink pipeline otherwise), so the opponent
  // and spectators see exactly the same zoom in / zoom out.
  useEffect(() => {
    if (isSpectator) return;
    zoomLevelRef.current = zoomLevel;
    panOffsetRef.current = panOffset;

    let cancelled = false;
    const apply = async () => {
      const phoneVideo = phoneStreamRef.current?.getVideoTracks()[0];
      const source =
        (phoneVideo?.readyState === "live" ? phoneVideo : localStreamRef.current?.getVideoTracks()[0]) ?? null;
      if (!source || source.readyState !== "live") return;

      const range = getNativeZoomRange(source);

      // 1) Native optical/digital zoom of the device (phones, some webcams)
      if (range && zoomLevel >= 1) {
        const ok = await applyNativeZoomSmooth(source, zoomLevel, {
          shouldCancel: () => cancelled,
        });
        if (ok && !cancelled) {
          nativeZoomActiveRef.current = true;
          if (zoomPipelineRef.current) {
            zoomPipelineRef.current.stop();
            zoomPipelineRef.current = null;
          }
          republishOutbound();
          return;
        }
      }


      // Reset any native zoom before falling back to the software pipeline
      if (nativeZoomActiveRef.current && range) {
        await applyNativeZoom(source, range.min);
        nativeZoomActiveRef.current = false;
      }

      // 2) Software pipeline (crop for zoom in, shrink for zoom out)
      if (zoomLevel === 1) {
        if (zoomPipelineRef.current) {
          zoomPipelineRef.current.stop();
          zoomPipelineRef.current = null;
          if (!cancelled) republishOutbound();
        }
        return;
      }

      if (!zoomPipelineRef.current) zoomPipelineRef.current = new CameraZoomPipeline();
      const pipeline = zoomPipelineRef.current;
      pipeline.setZoom(zoomLevel, panOffset);
      const hadOutput = pipeline.sourceTrack === source && !!pipeline.outputTrack;
      let processed: MediaStreamTrack | null = null;
      try {
        processed = await pipeline.attach(source);
      } catch {
        processed = null;
      }
      if (cancelled) return;
      if (!processed) {
        // Pipeline failed (no frames, virtual camera, canvas unsupported):
        // drop it and keep streaming the raw camera track instead of a
        // black/green canvas.
        pipeline.stop();
        zoomPipelineRef.current = null;
        republishOutbound();
        return;
      }
      pipeline.setZoom(zoomLevel, panOffset);
      if (!hadOutput) republishOutbound();
    };


    apply();
    return () => {
      cancelled = true;
    };
  }, [zoomLevel, panOffset, phoneStream, isSpectator, republishOutbound]);

  useEffect(() => () => {
    zoomPipelineRef.current?.stop();
    zoomPipelineRef.current = null;
  }, []);



  // Remove a disconnected peer from state so UI reverts to "Aguardando jogador"
  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(peerId);
    }
    remoteVideoRefs.current.delete(peerId);
    unregisterRemoteStream(peerId);
    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    setRemotePeerIds(prev => prev.filter(id => id !== peerId));
    spectatorPeersRef.current.delete(peerId);
    setSpectatorPeerIds(prev => prev.filter(id => id !== peerId));

    console.log("[WebRTC] Peer removed:", peerId);
  }, []);

  // Exactly one side must initiate player-to-player negotiation. Letting both
  // duelists create offers at the same time causes repeated glare/rollback on
  // Chromium-based browsers and can leave both remote panels without media.
  // Players always initiate toward spectators; between players the stable UUID
  // ordering elects a single offerer.
  const canInitiateOffer = useCallback((remotePeerId: string) => {
    if (isSpectator) return false;
    if (spectatorPeersRef.current.has(remotePeerId)) return true;
    return userId < remotePeerId;
  }, [isSpectator, userId]);

  const createPeerConnection = useCallback((remotePeerId: string) => {
    const existing = peersRef.current.get(remotePeerId);
    if (existing) {
      // Detach callbacks before closing. Otherwise the old connection's delayed
      // "closed" event can remove the brand-new replacement from the map.
      existing.pc.oniceconnectionstatechange = null;
      existing.pc.onconnectionstatechange = null;
      existing.pc.ontrack = null;
      existing.pc.onnegotiationneeded = null;
      existing.pc.close();
      unregisterRemoteStream(remotePeerId);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(remotePeerId);
        return next;
      });
      setRemotePeerIds((prev) => prev.filter((id) => id !== remotePeerId));
    }

    const forceRelay = relayOnlyPeersRef.current.has(remotePeerId);
    if (forceRelay) console.warn("[WebRTC] Using relay-only path for:", remotePeerId);
    const pc = new RTCPeerConnection(buildPcConfig(forceRelay));

    const peerState: PeerState = {
      pc,
      stream: null,
      makingOffer: false,
      ignoreOffer: false,
      createdAt: Date.now(),
      lastVideoTrackAt: null,
      pendingCandidates: [],
    };
    peersRef.current.set(remotePeerId, peerState);

    // Add local tracks (or recvonly transceivers for spectators)
    const localStream = getActiveOutboundStream();
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
      // Judge spectator (audio-only broadcaster) still needs a recvonly video
      // transceiver so the SDP includes a video m-line to receive players' video.
      if (isSpectator && audioBroadcastOnly) {
        try {
          pc.addTransceiver("video", { direction: "recvonly" });
        } catch (err) {
          console.error("[WebRTC] Failed to add recvonly video transceiver:", err);
        }
      }
    } else {
      // No local media yet (spectator, or camera/mic denied/not ready).
      // ALWAYS create recvonly m-lines so the opponent's audio+video can arrive.
      try {
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.addTransceiver("video", { direction: "recvonly" });
        console.log("[WebRTC] recvonly transceivers added for:", remotePeerId);
      } catch (err) {
        console.error("[WebRTC] Failed to add recvonly transceivers:", err);
      }
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

    // Monitor ICE connection and auto-recover or remove disconnected peer
    const attemptIceRestart = () => {
      if (!canInitiateOffer(remotePeerId) || peerState.makingOffer) return;
      try {
        pc.restartIce();
        if (pc.signalingState === "stable") {
          peerState.makingOffer = true;
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
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
            })
            .catch((err) => console.warn("[WebRTC] ICE restart offer failed:", err))
            .finally(() => {
              peerState.makingOffer = false;
            });
        }
      } catch (err) {
        peerState.makingOffer = false;
        console.warn("[WebRTC] restartIce failed:", err);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE state ${remotePeerId}: ${state}`);

      if (state === 'failed' || state === 'disconnected') {
        // Opera/Brave and VPN setups often fail the first ICE pass; always try a
        // restart (relay candidates included) before dropping the peer.
        console.warn(`[WebRTC] ICE ${state}, attempting restart for:`, remotePeerId);
        if (state === 'failed') relayOnlyPeersRef.current.add(remotePeerId);
        attemptIceRestart();
        setTimeout(() => {
          if (pc.iceConnectionState === 'failed') {
            console.warn("[WebRTC] Second restart attempt for:", remotePeerId);
            relayOnlyPeersRef.current.add(remotePeerId);
            attemptIceRestart();
          }
        }, 5000);
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            // Drop it: the reconnection heartbeat rebuilds the peer, this time
            // pinned to TURN relay so symmetric NAT / carrier networks work.
            console.warn("[WebRTC] Peer lost after restart attempts:", remotePeerId);
            relayOnlyPeersRef.current.add(remotePeerId);
            removePeer(remotePeerId);
          }
        }, 15000);
      } else if (state === 'connected' || state === 'completed') {
        // Keep the relay pin for this session only if it was actually needed.
      } else if (state === 'closed') {

        removePeer(remotePeerId);
      }
    };


    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state ${remotePeerId}: ${pc.connectionState}`);
    };

    pc.ontrack = (event) => {
      // Some senders (or track replacement after phone pairing) deliver a track
      // without an associated stream. Keep a per-peer stream and accumulate tracks
      // so the opponent's camera always ends up in the same MediaStream.
      const incoming = event.streams[0];
      let stream = peerState.stream;
      if (incoming) {
        stream = incoming;
      } else {
        if (!stream) stream = new MediaStream();
        // Drop a previous track of the same kind (replaced track)
        stream.getTracks()
          .filter((t) => t.kind === event.track.kind && t.id !== event.track.id)
          .forEach((t) => stream!.removeTrack(t));
        stream.addTrack(event.track);
      }
      peerState.stream = stream;
      if (event.track.kind === "video") {
        peerState.lastVideoTrackAt = Date.now();
      }

      const nextStream = stream;
      registerRemoteStream(remotePeerId, nextStream);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(remotePeerId, nextStream);
        return next;
      });
      setRemotePeerIds((prev) => (prev.includes(remotePeerId) ? prev : [...prev, remotePeerId]));

      // Detect remote track ended/mute/unmute for A/V sync awareness
      event.track.onended = () => {
        console.warn(`[WebRTC] Remote ${event.track.kind} track ended from ${remotePeerId}`);
      };
      event.track.onmute = () => {
        console.log(`[WebRTC] Remote ${event.track.kind} muted by ${remotePeerId}`);
      };
      event.track.onunmute = () => {
        console.log(`[WebRTC] Remote ${event.track.kind} unmuted by ${remotePeerId}`);
        // Force a re-attach/play when frames start flowing again
        const el = remoteVideoRefs.current.get(remotePeerId);
        el?.play?.().catch(() => {});
      };
    };


    pc.onnegotiationneeded = async () => {
      if (!canInitiateOffer(remotePeerId)) return;
      try {
        peerState.makingOffer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
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
  }, [userId, isSpectator, audioBroadcastOnly, getActiveOutboundStream, canInitiateOffer, removePeer]);

  // Player-side: build/refresh a connection toward a peer and send an offer.
  // Only peers that actually have media (the duelists) create offers — this
  // removes the glare that was leaving spectators with one frozen panel.
  const sendOfferTo = useCallback(async (remotePeerId: string, forceRebuild = false) => {
    if (!canInitiateOffer(remotePeerId)) return;
    if (remotePeerId === userId) return;

    let peer = peersRef.current.get(remotePeerId);
    const isDead =
      !!peer && ["failed", "closed", "disconnected"].includes(peer.pc.connectionState);
    const isStuck =
      !!peer &&
      peer.pc.signalingState !== "stable" &&
      peer.pc.connectionState !== "connected" &&
      Date.now() - peer.createdAt > 8000;

    if (!peer || isDead || isStuck || forceRebuild) {
      createPeerConnection(remotePeerId);
      peer = peersRef.current.get(remotePeerId);
    }
    if (!peer || peer.makingOffer || peer.pc.signalingState !== "stable") return;

    try {
      peer.makingOffer = true;
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      await channelRef.current?.send({
        type: "broadcast",
        event: "webrtc-signal",
        payload: {
          type: "offer",
          sdp: peer.pc.localDescription,
          senderId: userId,
          targetId: remotePeerId,
          isSpectator,
        },
      });
      console.log("[WebRTC] Offer sent to:", remotePeerId);
    } catch (err) {
      console.warn("[WebRTC] Offer failed:", remotePeerId, err);
    } finally {
      peer.makingOffer = false;
    }
  }, [userId, isSpectator, createPeerConnection, canInitiateOffer]);

  // Spectator-side: never offer (receive-only). Ask the player to (re)offer until
  // BOTH audio and video are flowing, so spectators always see AND hear everyone.
  const createSpectatorOffer = useCallback(async (playerId: string) => {
    if (!isSpectator || playerId === userId) return;

    const peer = peersRef.current.get(playerId);
    const videoTracks = peer?.stream?.getVideoTracks() ?? [];
    const liveVideo = videoTracks.some((t) => t.readyState === "live");
    const connected = peer?.pc.connectionState === "connected";

    // A track can stay "live" while the browser reports it as muted (sender
    // suspended, network stall). The panel freezes with no state change, which is
    // exactly the "spectator stopped working out of nowhere" symptom. Track how
    // long it has been muted and rebuild after a grace period.
    const frozen = liveVideo && videoTracks.every((t) => t.muted);
    const now = Date.now();
    if (frozen) {
      if (!frozenVideoSinceRef.current.has(playerId)) {
        frozenVideoSinceRef.current.set(playerId, now);
      }
    } else {
      frozenVideoSinceRef.current.delete(playerId);
    }
    const frozenSince = frozenVideoSinceRef.current.get(playerId);
    const frozenTooLong = !!frozenSince && now - frozenSince > 8000;

    if (connected && liveVideo && !frozenTooLong) return;

    // Never destroy a healthy video connection just because that player has no
    // microphone track (permission denied, no mic, or video-only fallback). The
    // previous check rebuilt that peer every 10 seconds, making duelists who were
    // spectating each other alternate between video and an infinite loader.
    const stalled =
      (!!peer && now - peer.createdAt > 10000 && (!connected || !liveVideo)) || frozenTooLong;
    if (stalled) {
      console.warn("[WebRTC] Spectator handshake stalled, resetting peer:", playerId);
      frozenVideoSinceRef.current.delete(playerId);
      removePeer(playerId);
    }


    channelRef.current?.send({
      type: "broadcast",
      event: "webrtc-signal",
      payload: {
        type: "request-offer",
        senderId: userId,
        targetId: playerId,
        isSpectator: true,
        // A returning spectator has the same user id, so the player's previous
        // PeerConnection may still look connected for several seconds after the
        // old tab/route was closed. Force a fresh player-side connection whenever
        // this mount has no peer yet instead of negotiating against that stale PC.
        rebuild: !peer || stalled,
      },
    });
  }, [isSpectator, userId, removePeer]);


  const handleSignal = useCallback(
    async (payload: any) => {
      if (payload.senderId === userId) return;
      // If signal has a targetId and it's not for us, ignore
      if (payload.targetId && payload.targetId !== userId) return;

      const remotePeerId = payload.senderId;

      // Offers/candidates also carry the role. Mark it before constructing the
      // peer so the player's negotiationneeded handler cannot race the
      // spectator's authoritative recvonly offer.
      if (payload.isSpectator && !spectatorPeersRef.current.has(remotePeerId)) {
        spectatorPeersRef.current.add(remotePeerId);
        setSpectatorPeerIds((prev) => (prev.includes(remotePeerId) ? prev : [...prev, remotePeerId]));
      }

      // A spectator asked us (a player) to (re)send our offer.
      if (payload.type === "request-offer") {
        if (isSpectator && !audioBroadcastOnly) return;
        void sendOfferTo(remotePeerId, !!payload.rebuild);
        return;
      }

      // Remove the departed session immediately. Without this, a player can keep
      // the spectator's old PeerConnection alive and reuse it when the same user
      // returns, preventing the fresh receive-only connection from negotiating.
      if (payload.type === "leave") {
        removePeer(remotePeerId);
        return;
      }

      if (payload.type === "ready") {

        // Remember whether this peer is a spectator so it never takes a video slot.
        if (payload.isSpectator) {
          if (!spectatorPeersRef.current.has(remotePeerId)) {
            spectatorPeersRef.current.add(remotePeerId);
            setSpectatorPeerIds((prev) => (prev.includes(remotePeerId) ? prev : [...prev, remotePeerId]));
          }
          // Spectator <-> spectator connections are useless (neither sends video)
          // and only waste slots/bandwidth. Skip them entirely.
          if (isSpectator && !audioBroadcastOnly) return;
        } else if (spectatorPeersRef.current.has(remotePeerId)) {
          spectatorPeersRef.current.delete(remotePeerId);
          setSpectatorPeerIds((prev) => prev.filter((id) => id !== remotePeerId));
        }

        // Recreate the connection when it is missing OR stuck in a dead state.
        // Re-announcements (heartbeat below) then heal peers whose handshake was
        // lost, which was leaving spectators with only one of the two players.
        const existingPeer = peersRef.current.get(remotePeerId);
        const hasLiveVideo = existingPeer?.stream
          ?.getVideoTracks()
          .some((track) => track.readyState === "live") ?? false;
        const spectatorMissingVideo =
          isSpectator &&
          !payload.isSpectator &&
          !!existingPeer &&
          Date.now() - existingPeer.createdAt > 30000 &&
          !hasLiveVideo;
        const isDead =
          !!existingPeer &&
          ["failed", "closed", "disconnected"].includes(existingPeer.pc.connectionState);
        if (!existingPeer || isDead || spectatorMissingVideo) {
          if (spectatorMissingVideo) {
            console.warn("[WebRTC] Spectator is missing player video; rebuilding peer:", remotePeerId);
          }
          createPeerConnection(remotePeerId);
        }
        const peer = peersRef.current.get(remotePeerId);
        if (!peer) return;

        // Player side: proactively offer to whoever announced itself, so a
        // spectator never waits on a negotiationneeded event that may not fire.
        if (!isSpectator || audioBroadcastOnly) {
          void sendOfferTo(remotePeerId);
        }


        // Handshake symmetry: whenever we receive a broadcast "ready" (no targetId),
        // we reply with a targeted "ready" back so the other side ALSO creates its
        // PeerConnection. Without this, whichever peer subscribed first misses the
        // other peer's initial broadcast ready and never negotiates, so audio/video
        // never arrive. Targeted replies do NOT trigger further replies (guarded by
        // payload.targetId below), avoiding an infinite ping-pong loop.
        if (!payload.targetId) {
          channelRef.current?.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: {
              type: "ready",
              senderId: userId,
              targetId: remotePeerId,
              isSpectator,
            },
          });
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
      // Receive-only spectators must always accept the player's authoritative
      // offer instead of deciding politeness from arbitrary UUID ordering.
      const polite = isSpectator || userId < remotePeerId;

      try {
        if (payload.type === "offer" || payload.type === "answer") {
          const description = new RTCSessionDescription(payload.sdp);
          const offerCollision =
            payload.type === "offer" &&
            (peer.makingOffer || pc.signalingState !== "stable");

          peer.ignoreOffer = !polite && offerCollision;
          if (peer.ignoreOffer) return;

          await pc.setRemoteDescription(description);

          if (peer.pendingCandidates.length > 0) {
            const queuedCandidates = peer.pendingCandidates.splice(0);
            for (const candidate of queuedCandidates) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
          }

          if (payload.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
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
          if (!pc.remoteDescription) {
            peer.pendingCandidates.push(payload.candidate);
            return;
          }
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
    [userId, createPeerConnection, isSpectator, audioBroadcastOnly, sendOfferTo, removePeer]
  );

  useEffect(() => {
    let disposed = false;
    let ownedChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelRetry: (() => void) | null = null;
    const peerMap = peersRef.current;

    const spectatorPeerSet = spectatorPeersRef.current;
    const relayOnlyPeerSet = relayOnlyPeersRef.current;
    const videoElementMap = remoteVideoRefs.current;
    const audioElementMap = remoteAudioRefs.current;

    const acquireMedia = async (): Promise<MediaStream | null> => {
      // Audio-broadcast spectator (judge): mic only, no camera
      if (isSpectator && audioBroadcastOnly) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          console.log("[WebRTC] Judge spectator audio-only stream acquired");
          return stream;
        } catch (err) {
          console.error("[WebRTC] Judge mic acquisition failed:", err);
          return null;
        }
      }
      // Spectators don't need local media - receive only
      if (isSpectator) return null;

      // Em mobile, priorizar câmera traseira ('environment'); em desktop usa frontal ('user')
      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const primaryFacing = isMobile ? 'environment' : 'user';
      const fallbackFacing = isMobile ? 'user' : 'environment';
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      const mobileConstraints: MediaStreamConstraints[] = [
        // Start with a broadly supported capture size. Some Android/Chromium
        // hardware encoders expose a green preview at forced 720p.
        { video: { facingMode: { ideal: primaryFacing }, width: { ideal: 960 }, height: { ideal: 540 } }, audio: audioConstraints },
        { video: { facingMode: { ideal: primaryFacing } }, audio: audioConstraints },
        { video: { facingMode: { ideal: fallbackFacing }, width: { ideal: 960 }, height: { ideal: 540 } }, audio: audioConstraints },
        { video: { facingMode: { ideal: fallbackFacing } }, audio: audioConstraints },
        { video: true, audio: audioConstraints },
        { video: true, audio: false },
      ];
      // Desktop virtual cameras such as DroidCam must start in their native
      // format. Requesting 16:9 before reading the device label can produce a
      // permanent green frame even if constraints are relaxed afterwards.
      const desktopConstraints: MediaStreamConstraints[] = [
        { video: true, audio: audioConstraints },
        { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }, audio: audioConstraints },
        { video: true, audio: false },
      ];
      const constraints = isMobile ? mobileConstraints : desktopConstraints;

      for (const constraint of constraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraint);
          await stabilizeVideoTrack(stream.getVideoTracks()[0]);
          console.log("[WebRTC] Media acquired with:", JSON.stringify(constraint));
          return stream;
        } catch (err) {
          console.warn("[WebRTC] Failed constraint:", JSON.stringify(constraint), err);
        }
      }
      return null;
    };

    const init = async () => {
      // Load TURN credentials before any PeerConnection is created, otherwise
      // the first handshake gathers STUN-only candidates and the opponent's
      // camera never arrives on restrictive networks (4G, VPN, symmetric NAT).
      await ensureIceServers();
      const stream = await acquireMedia();
      if (disposed) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream) {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play?.().catch(() => {});
        }
        // Track initial device IDs
        const aTrack = stream.getAudioTracks()[0];
        const vTrack = stream.getVideoTracks()[0];
        if (aTrack) setSelectedAudioId(aTrack.getSettings().deviceId || "");
        if (vTrack) setSelectedVideoId(vTrack.getSettings().deviceId || "");

        // Detect when local tracks end (camera unplugged, mic disconnected, etc.)
        stream.getTracks().forEach((track) => {
          track.enabled = track.kind === "video" ? !isVideoOffRef.current : !isMutedRef.current;
          track.onended = () => {
            console.warn(`[WebRTC] Local ${track.kind} track ended:`, track.label);
            if (track.kind === 'video') {
              setIsVideoOff(true);
            } else if (track.kind === 'audio') {
              setIsMuted(true);
            }
          };
        });

        // Re-enumerate to get labels
        enumerateDevices();
        // If peer connections were already created before media was ready,
        // attach tracks to all existing peers now. Peers created without media
        // already have recvonly transceivers (senders with a null track), so we
        // must replaceTrack on them instead of only checking for zero senders.
        peersRef.current.forEach((peerState, peerId) => {
          const outboundStream = getActiveOutboundStream() ?? stream;
          outboundStream.getTracks().forEach((track) => {
            const transceiver = peerState.pc.getTransceivers().find((t) => {
              const kind = t.receiver?.track?.kind ?? t.sender?.track?.kind;
              return kind === track.kind && !t.sender.track;
            });
            if (transceiver) {
              console.log("[WebRTC] Replacing late track on peer:", peerId, track.kind);
              transceiver.sender.replaceTrack(track).catch(() => {});
              if (transceiver.direction === "recvonly") transceiver.direction = "sendrecv";
            } else if (!peerState.pc.getSenders().some((s) => s.track?.kind === track.kind)) {
              console.log("[WebRTC] Adding late track to peer:", peerId, track.kind);
              peerState.pc.addTrack(track, outboundStream);
            }
          });
          // Changing a recvonly transceiver to sendrecv requires a fresh SDP.
          void sendOfferTo(peerId);
        });


      } else if (!isSpectator) {
        console.error("[WebRTC] Could not acquire any media stream");
      }

      // Realtime signalling channel. A dropped websocket (sleep, network blip,
      // long session) used to leave channelRef pointing at a dead channel: every
      // heartbeat/offer was silently discarded and spectating "stopped working
      // out of nowhere". Resubscribe with backoff and re-announce on recovery.
      let retryTimer: number | null = null;
      let retryAttempt = 0;

      const openChannel = () => {
        if (disposed) return;

        const channel = supabase.channel(`webrtc-signal-${duelId}`, {
          config: { broadcast: { self: false } },
        });
        ownedChannel = channel;

        // Publish the reference before subscribing. A fast targeted response can
        // arrive immediately after SUBSCRIBED; assigning this afterwards caused
        // answers/ICE candidates to be silently dropped on intermittent joins.
        channelRef.current = channel;

        const scheduleReconnect = () => {
          if (disposed || channelRef.current !== channel) return;
          if (retryTimer) return;
          const delay = Math.min(1000 * 2 ** retryAttempt, 10000);
          retryAttempt += 1;
          console.warn("[WebRTC] Signalling channel lost; reconnecting in", delay, "ms");
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            if (disposed || channelRef.current !== channel) return;
            channelRef.current = null;
            void supabase.removeChannel(channel);
            openChannel();
          }, delay);
        };

        channel
          .on("broadcast", { event: "webrtc-signal" }, ({ payload }) => {
            handleSignal(payload);
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              retryAttempt = 0;
              // Announce ourselves
              channel.send({
                type: "broadcast",
                event: "webrtc-signal",
                payload: { type: "ready", senderId: userId, isSpectator },
              });
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              scheduleReconnect();
            }
          });
      };

      openChannel();

      cancelRetry = () => {
        if (retryTimer) {
          window.clearTimeout(retryTimer);
          retryTimer = null;
        }
      };
    };


    init();

    return () => {
      disposed = true;
      cancelRetry?.();

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      // Detach every delayed callback before closing. Otherwise a late "closed"
      // event from the previous visit can call removePeer after re-entry and
      // delete the newly-created connection for the same player id.
      peerMap.forEach((peer) => {
        peer.pc.onicecandidate = null;
        peer.pc.oniceconnectionstatechange = null;
        peer.pc.onconnectionstatechange = null;
        peer.pc.ontrack = null;
        peer.pc.onnegotiationneeded = null;
        peer.stream?.getTracks().forEach((track) => {
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;
        });
        peer.pc.close();
      });
      peerMap.clear();
      spectatorPeerSet.clear();
      relayOnlyPeerSet.clear();
      videoElementMap.forEach((element) => {
        element.srcObject = null;
      });
      audioElementMap.forEach((element) => {
        element.srcObject = null;
      });
      setRemoteStreams(new Map());
      setRemotePeerIds([]);
      setSpectatorPeerIds([]);
      clearRemoteStreams();
      // Remove only the channel owned by this effect run. An older cleanup must
      // never unsubscribe the replacement channel created during quick re-entry.
      if (ownedChannel && channelRef.current === ownedChannel) {
        channelRef.current = null;
      }
      if (ownedChannel) {
        const channelToRemove = ownedChannel;
        // Best-effort departure notice lets players discard this visit's peer
        // before a later visit with the same user id starts negotiating.
        void channelToRemove.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: { type: "leave", senderId: userId },
        }).finally(() => {
          void supabase.removeChannel(channelToRemove);
        });
      }
    };
  }, [duelId, userId, handleSignal, isSpectator, audioBroadcastOnly, getActiveOutboundStream, sendOfferTo]);

  // Handshake heartbeat: while we still expect more player streams than we have,
  // re-announce ourselves periodically. A single "ready" at subscribe time can be
  // missed (peer not subscribed yet, tab throttled, reconnect), which left
  // spectators seeing only one of the two players.
  useEffect(() => {
    const expectedPlayers = isSpectator ? maxPlayers : maxPlayers - 1;
    const announceReady = () => {
      const channel = channelRef.current;
      if (!channel) return;

      channel.send({
        type: "broadcast",
        event: "webrtc-signal",
        payload: { type: "ready", senderId: userId, isSpectator },
      });

      // A spectator must request each official player directly. Relying only on
      // one room-wide broadcast is fragile when a player's tab is throttled or
      // reconnecting and could leave both reserved panels without streams.
      if (isSpectator) {
        playerIdsRef.current.forEach((playerId) => {
          if (playerId === userId) return;
          channel.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: {
              type: "ready",
              senderId: userId,
              targetId: playerId,
              isSpectator: true,
            },
          });
          void createSpectatorOffer(playerId);
        });
      }
    };

    const interval = setInterval(() => {
      const connectedPlayerVideos = Array.from(peersRef.current.entries()).filter(([peerId, peer]) => {
        if (spectatorPeersRef.current.has(peerId)) return false;
        if (isSpectator && playerIdsRef.current.size > 0 && !playerIdsRef.current.has(peerId)) return false;
        const liveVideo = peer.stream?.getVideoTracks().some((t) => t.readyState === "live") ?? false;
        if (!isSpectator) return liveVideo;
        // Video is the authoritative signal that this player is watchable. A
        // missing microphone must not keep forcing SDP renegotiations forever.
        return liveVideo;
      }).length;

      if (connectedPlayerVideos >= expectedPlayers) return;
      announceReady();
    }, 4000);

    // Do not wait four seconds on mount/player-roster updates.
    const initialAnnouncement = window.setTimeout(announceReady, 250);
    return () => {
      clearInterval(interval);
      window.clearTimeout(initialAnnouncement);
    };
  }, [userId, isSpectator, maxPlayers, remotePeerIds, createSpectatorOffer]);

  // A live MediaStreamTrack may end after a successful handshake without moving
  // RTCPeerConnection to "failed" (camera replacement, mobile backgrounding,
  // browser suspension). Re-negotiate that specific official player instead of
  // waiting forever behind a loading panel.
  useEffect(() => {
    if (!isSpectator) return;

    const recoverMissingVideo = () => {
      playerIdsRef.current.forEach((playerId) => {
        if (playerId === userId) return;
        // createSpectatorOffer self-guards: it only re-requests when video OR
        // audio from that player is missing.
        void createSpectatorOffer(playerId);
      });
    };


    const interval = window.setInterval(recoverMissingVideo, 6000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") recoverMissingVideo();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isSpectator, userId, createSpectatorOffer]);



  // Attach remote streams to video elements (video is always muted — audio is
  // played by the dedicated <audio> elements below).
  useEffect(() => {
    remoteStreams.forEach((stream, peerId) => {
      const el = remoteVideoRefs.current.get(peerId);
      if (!el) return;
      el.muted = true;
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play?.().catch(() => {});
    });
  }, [remoteStreams, remotePeerIds]);

  // Attach remote AUDIO tracks to dedicated audio elements
  useEffect(() => {
    remoteStreams.forEach((stream, peerId) => {
      const el = remoteAudioRefs.current.get(peerId);
      if (!el) return;
      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) return;
      const current = el.srcObject as MediaStream | null;
      const sameTracks =
        current &&
        current.getAudioTracks().length === tracks.length &&
        current.getAudioTracks().every((t, i) => t.id === tracks[i].id);
      if (!sameTracks) {
        el.srcObject = new MediaStream(tracks);
      }
      el.muted = false;
      el.volume = 1;
      el.play?.()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    });
  }, [remoteStreams, remotePeerIds]);

  const enableRemoteAudio = useCallback(() => {
    remoteAudioRefs.current.forEach((el) => {
      el.muted = false;
      el.volume = 1;
      el.play?.().catch(() => {});
    });
    setAudioBlocked(false);
  }, []);

  const setRemoteAudioRef = useCallback((peerId: string, el: HTMLAudioElement | null) => {
    if (!el) {
      remoteAudioRefs.current.delete(peerId);
      return;
    }
    remoteAudioRefs.current.set(peerId, el);
    const stream = remoteStreams.get(peerId);
    const tracks = stream?.getAudioTracks() ?? [];
    if (tracks.length > 0) {
      el.srcObject = new MediaStream(tracks);
      el.muted = false;
      el.play?.()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    }
  }, [remoteStreams]);



  const toggleMute = () => {
    const stream = phoneStream || localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    const stream = phoneStream || localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      zoomPipelineRef.current?.syncEnabled();
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
      el.muted = true;
      const stream = remoteStreams.get(peerId);
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
      }
      if (stream) {
        el.play?.().catch(() => {});
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
  // For spectators: the "local panel" slot is reserved for the creator (player 1),
  // and remaining slots are for the other (non-creator) peers in the order they connected.
  // IMPORTANT: we must look up the creator peer explicitly — not by array position —
  // because remotePeerIds only contains peers whose stream has actually arrived,
  // so the order is non-deterministic and the creator may not be first (or may not
  // be present yet). Using array order made player 2 occupy the player 1 slot when
  // they connected first, leaving the player 2 slot empty.
  // Only real players may occupy video slots — spectator peers (including judge
  // spectators that broadcast audio) are excluded so they never hide player 2.
  const officialPlayerIds = Array.from(new Set(playerIds.filter(Boolean)));
  const connectedVideoPeerIds = Array.from(new Set(remotePeerIds)).filter((pid) =>
    !spectatorPeerIds.includes(pid) &&
    (remoteStreams.get(pid)?.getVideoTracks().some((track) => track.readyState !== "ended") ?? false)
  );
  // Keep the official roster order, but never hide a live player stream just
  // because the room row has not caught up yet. Signalling and the duel roster
  // arrive through different realtime channels, so a spectator can receive
  // player 2's video before opponent_id is visible locally.
  const videoPeerIds = isSpectator && officialPlayerIds.length > 0
    ? [
        ...officialPlayerIds.filter((pid) => connectedVideoPeerIds.includes(pid)),
        ...connectedVideoPeerIds.filter((pid) => !officialPlayerIds.includes(pid)),
      ]
    : connectedVideoPeerIds;
  const creatorPeerId = isSpectator && creatorId && videoPeerIds.includes(creatorId)
    ? creatorId
    : null;
  // When creatorId is known, the player-1 panel is reserved for the creator only —
  // never fall back to another player, or the same peer would render in two slots.
  const player1PeerIdForSpectator = creatorId ? creatorPeerId : videoPeerIds[0] || null;
  const nonCreatorPeerIds = isSpectator
    ? videoPeerIds.filter((pid) => pid !== creatorId && pid !== player1PeerIdForSpectator)
    : videoPeerIds;
  const remoteSlots: (string | null)[] = [];
  if (isSpectator) {
    // Non-creator peers fill the remote slots, regardless of how many slots exist.
    for (let i = 0; i < totalSlots - 1; i++) {
      remoteSlots.push(nonCreatorPeerIds[i] || null);
    }
  } else {
    for (let i = 0; i < totalSlots - 1; i++) {
      remoteSlots.push(videoPeerIds[i] || null);
    }
  }


  const localVideoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    (localVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    const outboundStream = getActiveOutboundStream();
    if (el && outboundStream && el.srcObject !== outboundStream) {
      el.srcObject = outboundStream;
      el.play?.().catch(() => {});
    }
  }, [getActiveOutboundStream]);

  const renderLocalPanel = () => {
    // For spectators: show the first remote stream as "Player 1" panel instead of local camera
    if (isSpectator) {
      // Spectator's "local panel" actually shows player 1 (creator) stream
      const player1PeerId = player1PeerIdForSpectator;
      return (
        <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
          {player1PeerId ? (
            <video
              ref={(el) => setRemoteVideoRef(player1PeerId, el)}
              autoPlay
              playsInline
              className={`w-full h-full object-contain rounded-2xl ${localDeckOpen ? 'hidden' : ''}`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center space-y-2">
                <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-primary animate-spin" />
                <p className="text-[10px] sm:text-xs text-muted-foreground">Aguardando jogador...</p>
              </div>
            </div>
          )}
          {localDeckContent && (
            <div className={
              localDeckOpen
                ? (mobileArenaMode ? "absolute inset-0 overflow-hidden bg-background touch-none" : "absolute inset-0 overflow-auto bg-background touch-pan-y")
                : "hidden"
            }>
              {localDeckContent}
            </div>
          )}
          {spectatorLpOverlay && (
            <div className="absolute top-1 left-1 sm:top-2 sm:left-2 px-2 py-1 rounded bg-black/70 backdrop-blur-sm text-white z-20 flex items-center gap-1.5">
              <span className="text-[10px] sm:text-xs font-medium truncate max-w-[80px]">{spectatorLpOverlay.localLabel}</span>
              <span className="text-xs sm:text-sm font-bold text-green-400">{spectatorLpOverlay.localLp}</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
        {/* Always keep video in DOM so srcObject persists */}
        <video
          ref={localVideoCallbackRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain rounded-2xl ${localDeckOpen ? 'hidden' : ''} ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{ transform: 'scaleX(-1)' }}
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
        />
        {localDeckContent && (
          <div className={
            localDeckOpen
              ? (mobileArenaMode ? "absolute inset-0 overflow-hidden bg-background touch-none" : "absolute inset-0 overflow-auto bg-background touch-pan-y")
              : "hidden"
          }>
            {localDeckContent}
          </div>
        )}
        {!localDeckOpen && (
          <>
            {isVideoOff && (
              <div className="absolute inset-0 bg-muted flex items-center justify-center">
                <VideoOff className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 absolute bottom-4">Câmera desligada</p>
              </div>
            )}
          </>
        )}
        {spectatorLpOverlay && (
          <div className="absolute top-1 left-1 sm:top-2 sm:left-2 px-2 py-1 rounded bg-black/70 backdrop-blur-sm text-white z-20 flex items-center gap-1.5">
            <span className="text-[10px] sm:text-xs font-medium truncate max-w-[80px]">{spectatorLpOverlay.localLabel}</span>
            <span className="text-xs sm:text-sm font-bold text-green-400">{spectatorLpOverlay.localLp}</span>
          </div>
        )}
        {!spectatorLpOverlay && (
          <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] sm:text-xs text-white z-10">
            Você
          </div>
        )}
      </div>
    );
  };

  const renderRemotePanel = (peerId: string | null, index: number) => {
    // Determine if deck overlay should be shown for this slot
    const perSlotOpen = remoteDeckOpenSlots?.[index];
    const singleSlotOpen = remoteDeckOpen && index === 0 && !remoteDeckOpenSlots;
    const isDeckOpenForSlot = perSlotOpen || singleSlotOpen;

    const hasPerSlotContent = remoteDeckContents?.[index];
    const hasSingleContent = remoteDeckContent && index === 0 && !remoteDeckContents;
    const deckContentForSlot = hasPerSlotContent || (hasSingleContent ? remoteDeckContent : null);

    // The remote panel is exclusive: digital arena when open, otherwise camera.
    const showDeckOverlay = isDeckOpenForSlot && deckContentForSlot;

    return (
      <div key={peerId || `waiting-${index}`} className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
        {/* Always keep video mounted so stream persists */}
        {peerId && (
          <video
            ref={(el) => setRemoteVideoRef(peerId, el)}
            autoPlay
            playsInline
            className={`w-full h-full object-contain rounded-2xl ${showDeckOverlay ? 'hidden' : ''}`}
          />
        )}
        {showDeckOverlay ? (
          <div className={mobileArenaMode ? "w-full h-full overflow-hidden bg-background touch-none" : "w-full h-full overflow-auto bg-background touch-pan-y"}>
            {deckContentForSlot}
          </div>
        ) : !peerId ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center space-y-2">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-primary animate-spin" />
              <p className="text-[10px] sm:text-xs text-muted-foreground">Aguardando jogador...</p>
            </div>
          </div>
        ) : null}
        {spectatorLpOverlay?.remotePlayers?.[index] && (
          <div className="absolute top-1 left-1 sm:top-2 sm:left-2 px-2 py-1 rounded bg-black/70 backdrop-blur-sm text-white z-20 flex items-center gap-1.5">
            <span className="text-[10px] sm:text-xs font-medium truncate max-w-[80px]">{spectatorLpOverlay.remotePlayers[index].label}</span>
            <span className="text-xs sm:text-sm font-bold text-green-400">{spectatorLpOverlay.remotePlayers[index].lp}</span>
          </div>
        )}
        {!spectatorLpOverlay && (
          <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] sm:text-xs text-white z-10">
            {peerId ? `Oponente ${remoteSlots.length > 1 ? index + 1 : ''}` : `Jogador ${index + 2}`}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`relative ${className || ""}`}>
      {is4Player ? (
        /* ===== 4-PLAYER GRID (2x2 quadrants) ===== */
        <div 
          className={`grid grid-cols-2 grid-rows-2 w-full h-full transition-transform duration-200 origin-center ${zoomLevel < 1 ? 'rounded-2xl border-2 border-purple-500' : ''}`}
        >
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
        <div 
          className={`${mobileArenaMode ? 'flex flex-col-reverse' : 'flex flex-col sm:flex-row'} w-full h-full transition-transform duration-200 origin-center ${zoomLevel < 1 ? 'rounded-2xl border-2 border-purple-500 overflow-hidden' : ''}`}
        >
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
          {/* Big panel — always show deck viewers here regardless of swap */}
          <div 
            className={`w-full h-full transition-transform duration-200 origin-center ${zoomLevel < 1 ? 'rounded-2xl border-2 border-purple-500 overflow-hidden' : ''}`}
            >
            {pipSwapped ? (
              /* Local is big — show local deck or local video */
              renderLocalPanel()
            ) : (
              /* Remote is big — show remote deck overlay or remote video */
              renderRemotePanel(remoteSlots[0], 0)
            )}
          </div>
          {/* Small PiP panel — click to swap */}
          <div
            className="absolute bottom-14 right-3 w-[120px] sm:w-[160px] aspect-[4/3] rounded-lg overflow-hidden border-2 border-primary/40 shadow-lg bg-black z-20 cursor-pointer"
            onClick={() => setPipSwapped(prev => !prev)}
            title="Clique para alternar"
          >
            {pipSwapped ? (
              /* Show remote in small — just video, no deck overlay */
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
              isSpectator ? (
                player1PeerIdForSpectator ? (
                  <video
                    ref={(el) => setRemoteVideoRef(player1PeerIdForSpectator, el)}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-black/80">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                )
              ) : localDeckOpen && localDeckContent ? (
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
                    style={{ transform: 'scaleX(-1)' }}
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

      {/* Dedicated audio playback for every remote peer (spectators hear all players) */}
      {remotePeerIds.map((pid) => (
        <audio
          key={`audio-${pid}`}
          ref={(el) => setRemoteAudioRef(pid, el)}
          autoPlay
          playsInline
          className="hidden"
        />
      ))}

      {audioBlocked && remotePeerIds.length > 0 && (
        <Button
          type="button"
          size="sm"
          onClick={enableRemoteAudio}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-30 rounded-full gap-1.5 shadow-lg"
        >
          <Volume2 className="w-3.5 h-3.5" /> Ativar áudio
        </Button>
      )}

      {/* Controls bar — hidden for pure receive-only spectators */}
      {(!isSpectator || audioBroadcastOnly) && (
        <div className="absolute bottom-1.5 sm:bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 sm:gap-2 z-20">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleMute}
            className={`rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm ${isMuted ? "bg-destructive/80 text-destructive-foreground" : "bg-card/80"}`}
            title={isMuted ? "Ativar microfone" : "Silenciar microfone"}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          </Button>
          {!isSpectator && (
          <>
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
          {/* Device selector */}
          <Popover open={showDeviceMenu} onOpenChange={setShowDeviceMenu}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm bg-card/80"
                title="Configurar câmera e microfone"
              >
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-72 p-3 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Video className="w-3 h-3" /> Câmera
                </label>
                <Select
                  value={selectedVideoId}
                  onValueChange={(val) => {
                    setSelectedVideoId(val);
                    switchDevice(selectedAudioId || undefined, val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar câmera" />
                  </SelectTrigger>
                  <SelectContent>
                    {videoDevices.map((d, i) => (
                      <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                        {d.label || `Câmera ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Mic className="w-3 h-3" /> Microfone
                </label>
                <Select
                  value={selectedAudioId}
                  onValueChange={(val) => {
                    setSelectedAudioId(val);
                    switchDevice(val, selectedVideoId || undefined);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar microfone" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices.map((d, i) => (
                      <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                        {d.label || `Microfone ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
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
          </>
          )}
        </div>
      )}
    </div>
  );
});

WebRTCVideoCall.displayName = "WebRTCVideoCall";
