import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureIceServers, buildPcConfig, getIceServers } from "@/utils/iceServers";
import { queueRemoteCandidate, flushRemoteCandidates } from "@/utils/webrtcCandidates";
import {
  SIGNAL_PROTOCOL_VERSION,
  newSignalId,
  decideOffer,
  decideAnswer,
  decideCandidate,
  remoteInstanceChanged,
  pushDeferred,
  takeDeferredFor,
  createCandidateBatcher,
  createIceRecovery,
  sampleInbound,
  assessMediaHealth,
  applyVideoBitrateCap,
  OPPONENT_VIDEO_MAX_BITRATE,
  SPECTATOR_VIDEO_MAX_BITRATE,
  type DeferredCandidate,
  type InboundSample,
  type MediaHealth,
} from "@/utils/webrtcSession";
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




interface DuelSignal {
  type: "ready" | "request-offer" | "leave" | "offer" | "answer" | "ice-candidate";
  senderId: string;
  targetId?: string;
  isSpectator?: boolean;
  rebuild?: boolean;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  /** v2: several candidates batched in a single broadcast. */
  candidates?: RTCIceCandidateInit[];
  /** v2: ask the offerer for an ICE restart instead of a full rebuild. */
  iceRestart?: boolean;
  /** Signalling protocol version of the sender (absent = legacy client). */
  v?: number;
  /** Sender's mount id (changes on reload / re-entry). */
  inst?: string;
  /** Sender's RTCPeerConnection id for this pair. */
  pcId?: string;
  /** Receiver's RTCPeerConnection id the message is meant for. */
  toPc?: string;
}

interface PeerState {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  createdAt: number;
  lastVideoTrackAt: number | null;
  pendingCandidates: RTCIceCandidateInit[];
  /** Ids that tie offers/answers/candidates to one PC generation on each side. */
  localPcId: string;
  remotePcId: string | null;
  remoteInst: string | null;
  /** Candidates of a remote PC whose description has not arrived yet. */
  deferred: DeferredCandidate[];
  /** A negotiation was requested while another was in flight. */
  pendingNegotiation: boolean;
  pendingIceRestart: boolean;
  offerSentAt: number;
  recovery: ReturnType<typeof createIceRecovery>;
  batcher: ReturnType<typeof createCandidateBatcher> | null;
  restartIce: () => void;
  lastSample: InboundSample | null;
  health: MediaHealth;
  transportStalls: number;
  audioRequests: number;
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
  // Peers whose audio playback is currently blocked by autoplay policy.
  const blockedAudioRef = useRef<Set<string>>(new Set());

  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Identifies this mount. A reload/re-entry gets a new id, which lets the other
  // side discard its stale RTCPeerConnection instead of negotiating against it.
  const instanceIdRef = useRef<string>(newSignalId());
  // Remote peers' signalling protocol version (absent = legacy client).
  const peerProtocolRef = useRef<Map<string, number>>(new Map());
  const sendSignal = useCallback((payload: Omit<DuelSignal, "senderId" | "v" | "inst">) => {
    return channelRef.current?.send({
      type: "broadcast",
      event: "webrtc-signal",
      payload: { ...payload, senderId: userId, v: SIGNAL_PROTOCOL_VERSION, inst: instanceIdRef.current },
    });
  }, [userId]);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraAcquiring, setCameraAcquiring] = useState(false);
  const captureBusyRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const videoActionRef = useRef<(enabled: boolean) => Promise<void>>(async () => {});
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
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
  const republishRef = useRef<() => Promise<void>>(async () => {});
  const sendOfferRef = useRef<(peerId: string) => Promise<void>>(async () => {});

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
      const newVideo = newStream.getVideoTracks()[0];
      if (newVideo) {
        isVideoOffRef.current = false;
        setIsVideoOff(false);
        newVideo.onended = () => { isVideoOffRef.current = true; setIsVideoOff(true); };
      }

      // Publish to every peer (handles zoom/phone overrides and renegotiates
      // when the peer was not receiving video yet), then stop the old capture.
      await republishRef.current();
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
    setVideoEnabled: (enabled: boolean) => { void videoActionRef.current(enabled); },
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
  const republishOutbound = useCallback(async () => {
    const outboundStream = getActiveOutboundStream();
    const activeVideo = outboundStream?.getVideoTracks()[0] ?? null;
    const activeAudio = outboundStream?.getAudioTracks()[0] ?? null;

    await Promise.all(Array.from(peersRef.current.entries()).map(async ([peerId, { pc }]) => {
      let needsNegotiation = false;
      for (const [kind, track] of [["video", activeVideo], ["audio", activeAudio]] as const) {
        const all = pc.getTransceivers().filter(
          (t) => t.receiver.track.kind === kind && t.currentDirection !== "stopped",
        );
        // Prefer the transceiver actually negotiated with the peer (has a mid).
        // Transceivers created via addTransceiver before the remote offer are
        // never associated, and replacing a track there sends nothing — the
        // opponent kept seeing a black/waiting panel after a camera change.
        const transceiver = all.find((t) => t.mid !== null) ?? all[0];
        if (transceiver) {
          const hadTrack = !!transceiver.sender.track;
          await transceiver.sender.replaceTrack(track);
          if (track && (transceiver.direction === "recvonly" || transceiver.direction === "inactive")) {
            transceiver.direction = "sendrecv";
            needsNegotiation = true;
          }
          if (track && (!hadTrack || transceiver.mid === null)) needsNegotiation = true;
        } else if (track && outboundStream) {
          pc.addTrack(track, outboundStream);
          needsNegotiation = true;
        }
      }
      if (!needsNegotiation) return;
      const iAmOfferer = spectatorPeersRef.current.has(peerId) || userId < peerId;
      if (iAmOfferer) {
        void sendOfferRef.current(peerId);
      } else {
        void sendSignal({ type: "request-offer", targetId: peerId });
      }
    })).catch(error => {
      console.warn("[WebRTC] Track publication failed", error);
      setCameraError("Não foi possível transmitir a câmera. Tente ligá-la novamente.");
    });

    // Update local preview
    if (localVideoRef.current && outboundStream) {
      localVideoRef.current.srcObject = outboundStream;
      localVideoRef.current.play?.().catch(() => {});
    }
  }, [getActiveOutboundStream, userId, sendSignal]);
  republishRef.current = republishOutbound;

  useEffect(() => {
    if (isSpectator) return;
    republishOutbound();
  }, [phoneStream, isSpectator, republishOutbound]);

  // When the OS/browser suspends the camera (sleep, driver reset, another app),
  // the track ends and the opponent sees black. Reopen it automatically unless
  // the player turned the camera off on purpose.
  const setCameraEnabledRef = useRef<((enabled: boolean) => Promise<void>) | null>(null);
  const autoRecoverCamera = () => {
    if (isVideoOffRef.current) return;
    isVideoOffRef.current = true;
    setIsVideoOff(true);
    window.setTimeout(() => { void setCameraEnabledRef.current?.(true); }, 1000);
  };

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    if (isSpectator || captureBusyRef.current) return;
    const active = getActiveOutboundStream()?.getVideoTracks()[0];
    if (!enabled || active?.readyState === "live") {
      if (active) active.enabled = enabled;
      const source = phoneStreamRef.current?.getVideoTracks()[0] ?? localStreamRef.current?.getVideoTracks()[0];
      if (source) source.enabled = enabled;
      isVideoOffRef.current = !enabled;
      setIsVideoOff(!enabled);
      zoomPipelineRef.current?.syncEnabled();
      return;
    }
    captureBusyRef.current = true;
    setCameraAcquiring(true);
    setCameraError(null);
    const generation = captureGenerationRef.current;
    try {
      let fresh: MediaStream;
      try {
        fresh = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true,
          audio: false,
        });
      } catch (error) {
        if (!selectedVideoId) throw error;
        fresh = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (generation !== captureGenerationRef.current) {
        fresh.getTracks().forEach(t => t.stop());
        return;
      }
      const track = fresh.getVideoTracks()[0];
      if (!track) throw new Error("A câmera não forneceu vídeo");
      await stabilizeVideoTrack(track);
      if (generation !== captureGenerationRef.current) {
        fresh.getTracks().forEach(t => t.stop());
        return;
      }
      const previous = localStreamRef.current;
      localStreamRef.current = new MediaStream([
        ...(previous?.getAudioTracks().filter(t => t.readyState === "live") ?? []), track,
      ]);
      track.onended = () => autoRecoverCamera();
      isVideoOffRef.current = false;
      setIsVideoOff(false);
      setSelectedVideoId(track.getSettings().deviceId ?? "");
      await republishOutbound();
      previous?.getVideoTracks().forEach(t => t.stop());
      await enumerateDevices();
    } catch (error) {
      if (generation === captureGenerationRef.current) {
        isVideoOffRef.current = true;
        setIsVideoOff(true);
        setCameraError("Não foi possível abrir a câmera. Verifique a conexão e a permissão e tente novamente.");
        console.warn("[WebRTC] Camera recovery failed", error);
      }
    } finally {
      if (generation === captureGenerationRef.current) {
        captureBusyRef.current = false;
        setCameraAcquiring(false);
      }
    }
  }, [isSpectator, getActiveOutboundStream, selectedVideoId, republishOutbound, enumerateDevices]);
  setCameraEnabledRef.current = setCameraEnabled;
  videoActionRef.current = setCameraEnabled;

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

      // 1) Native optical/digital zoom of the device (phones, some webcams).
      // Only applies when the user actually zoomed in (zoomLevel > 1). At the
      // neutral zoomLevel = 1 we must not touch the track, otherwise cameras
      // with a native zoom capability auto-frame/zoom on their own.
      if (range && zoomLevel > 1) {
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
        // A câmera nunca deve começar "dada zoom". Se o dispositivo tiver zoom
        // nativo e estiver fora do mínimo (auto-framing), traz de volta ao
        // enquadramento original para que o usuário não veja zoom automático.
        if (range && !cancelled && !nativeZoomActiveRef.current) {
          const currentNative = Number((source.getSettings?.() as MediaTrackSettings & { zoom?: number })?.zoom ?? range.min);
          if (currentNative !== range.min) {
            await applyNativeZoom(source, range.min);
            republishOutbound();
          }
        }
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
      peer.recovery.dispose();
      peer.batcher?.cancel();
      peer.pc.onicecandidate = null;
      peer.pc.oniceconnectionstatechange = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.ontrack = null;
      peer.pc.onnegotiationneeded = null;
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

  /** Apply the uplink cap for this pair (spectators get a lower one). */
  const capPeerBitrate = useCallback((remotePeerId: string, peer: PeerState) => {
    void applyVideoBitrateCap(
      peer.pc,
      spectatorPeersRef.current.has(remotePeerId) ? SPECTATOR_VIDEO_MAX_BITRATE : OPPONENT_VIDEO_MAX_BITRATE,
    );
  }, []);

  // Single entry point for creating offers (initial, renegotiation, ICE restart).
  // A request that arrives while another offer is in flight is remembered and
  // replayed once the answer lands, instead of being silently dropped (that
  // left the opponent on a black panel after a camera change).
  const negotiate = useCallback(async (
    remotePeerId: string,
    peer: PeerState,
    opts: { iceRestart?: boolean; fromBrowser?: boolean } = {},
  ) => {
    if (peersRef.current.get(remotePeerId) !== peer) return;
    const { pc } = peer;
    if (pc.signalingState === "closed") return;
    if (peer.makingOffer || pc.signalingState !== "stable") {
      // The browser re-fires negotiationneeded by itself once signalling is
      // stable again (if still needed); only explicit requests are queued.
      if (opts.fromBrowser && !opts.iceRestart) return;
      peer.pendingNegotiation = true;
      if (opts.iceRestart) peer.pendingIceRestart = true;
      return;
    }
    const iceRestart = !!opts.iceRestart || peer.pendingIceRestart;
    peer.pendingNegotiation = false;
    peer.pendingIceRestart = false;
    try {
      peer.makingOffer = true;
      pc.setConfiguration({ ...pc.getConfiguration(), iceServers: getIceServers(), iceTransportPolicy: "all" });
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (peersRef.current.get(remotePeerId) !== peer) return;
      await pc.setLocalDescription(offer);
      peer.offerSentAt = Date.now();
      await sendSignal({
        type: "offer",
        sdp: pc.localDescription ?? undefined,
        targetId: remotePeerId,
        isSpectator,
        pcId: peer.localPcId,
        toPc: peer.remotePcId ?? undefined,
      });
      console.log(`[WebRTC] Offer sent to: ${remotePeerId}${iceRestart ? " (ICE restart)" : ""}`);
    } catch (err) {
      console.warn("[WebRTC] Offer failed:", remotePeerId, err);
    } finally {
      peer.makingOffer = false;
    }
  }, [isSpectator, sendSignal]);

  // Full rebuild of one pair. The offerer rebuilds and offers; the other side
  // asks the offerer to do it, and keeps its current connection (and the last
  // frame) until the new offer arrives instead of tearing everything down.
  const rebuildPeerRef = useRef<(remotePeerId: string) => void>(() => {});

  const createPeerConnection = useCallback((remotePeerId: string, opts: { inst?: string | null } = {}) => {
    const existing = peersRef.current.get(remotePeerId);
    if (existing) {
      existing.recovery.dispose();
      existing.batcher?.cancel();
      // Detach callbacks before closing. Otherwise the old connection's delayed
      // "closed" event can remove the brand-new replacement from the map.
      existing.pc.oniceconnectionstatechange = null;
      existing.pc.onconnectionstatechange = null;
      existing.pc.ontrack = null;
      existing.pc.onnegotiationneeded = null;
      // Also stop the old connection from emitting candidates: they would be
      // sent to the peer and applied to the NEW connection, breaking ICE.
      existing.pc.onicecandidate = null;
      existing.pc.close();
      unregisterRemoteStream(remotePeerId);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(remotePeerId);
        return next;
      });
      setRemotePeerIds((prev) => prev.filter((id) => id !== remotePeerId));
    }

    const pc = new RTCPeerConnection(buildPcConfig());

    const restartIce = () => {
      const current = peersRef.current.get(remotePeerId);
      if (!current || current.pc !== pc) return;
      if (canInitiateOffer(remotePeerId)) {
        console.warn("[WebRTC] ICE restart (offerer) for:", remotePeerId);
        void ensureIceServers({ background: true }).then(() => negotiate(remotePeerId, current, { iceRestart: true }));
      } else {
        // Only the elected offerer may create offers (no glare). Ask it.
        console.warn("[WebRTC] Asking offerer for ICE restart:", remotePeerId);
        void sendSignal({ type: "request-offer", targetId: remotePeerId, isSpectator, iceRestart: true });
      }
    };

    const peerState: PeerState = {
      pc,
      stream: null,
      makingOffer: false,
      ignoreOffer: false,
      createdAt: Date.now(),
      lastVideoTrackAt: null,
      pendingCandidates: [],
      localPcId: newSignalId(),
      remotePcId: null,
      remoteInst: opts.inst ?? existing?.remoteInst ?? null,
      deferred: existing?.deferred ?? [],
      pendingNegotiation: false,
      pendingIceRestart: false,
      offerSentAt: 0,
      recovery: createIceRecovery({
        restart: () => restartIce(),
        rebuild: () => {
          if (peersRef.current.get(remotePeerId)?.pc === pc) rebuildPeerRef.current(remotePeerId);
        },
        remove: () => {
          if (peersRef.current.get(remotePeerId)?.pc === pc) {
            console.warn("[WebRTC] Peer lost after recovery attempts:", remotePeerId);
            removePeer(remotePeerId);
          }
        },
      }),
      batcher: null,
      restartIce,
      lastSample: null,
      health: "unknown",
      transportStalls: 0,
      audioRequests: 0,
    };
    peerState.batcher = createCandidateBatcher((candidates) => {
      void sendSignal({
        type: "ice-candidate",
        candidates,
        targetId: remotePeerId,
        pcId: peerState.localPcId,
        toPc: peerState.remotePcId ?? undefined,
      });
    });
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
      if (!event.candidate) {
        // End of gathering: send whatever is still buffered right away.
        peerState.batcher?.flushNow();
        return;
      }
      if (!channelRef.current) return;
      const candidate = event.candidate.toJSON();
      // Batch only toward clients that understand it; legacy clients (old PWA
      // cache) still get one candidate per message.
      if ((peerProtocolRef.current.get(remotePeerId) ?? 0) >= 2 && peerState.batcher) {
        peerState.batcher.push(candidate);
        return;
      }
      void sendSignal({
        type: "ice-candidate",
        candidate,
        targetId: remotePeerId,
        pcId: peerState.localPcId,
        toPc: peerState.remotePcId ?? undefined,
      });
    };

    // ICE recovery: grace period for short drops, then ICE restart (requested
    // from the offerer when we are not it), then a full rebuild, then removal.
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE state ${remotePeerId}: ${state}`);
      if (peersRef.current.get(remotePeerId) !== peerState) return;
      peerState.recovery.onStateChange(state);
      if (state === "connected" || state === "completed") {
        capPeerBitrate(remotePeerId, peerState);
      } else if (state === "closed") {
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


    pc.onnegotiationneeded = () => {
      if (!canInitiateOffer(remotePeerId)) return;
      void negotiate(remotePeerId, peerState, { fromBrowser: true });
    };

    return pc;
  }, [isSpectator, audioBroadcastOnly, getActiveOutboundStream, canInitiateOffer, removePeer, negotiate, sendSignal, capPeerBitrate]);

  // Player-side: build/refresh a connection toward a peer and send an offer.
  // Only peers that actually have media (the duelists) create offers — this
  // removes the glare that was leaving spectators with one frozen panel.
  const sendOfferTo = useCallback(async (remotePeerId: string, forceRebuild = false) => {
    if (!canInitiateOffer(remotePeerId)) return;
    if (remotePeerId === userId) return;

    const channel = channelRef.current;
    if (!channel) return;
    await ensureIceServers({ background: true });
    if (channelRef.current !== channel) return;
    let peer = peersRef.current.get(remotePeerId);
    // "disconnected" is usually transient (Wi-Fi/4G handover) and ICE recovers
    // by itself or via ICE restart. Only treat it as dead after a while;
    // rebuilding on every heartbeat during a blip turned short drops into
    // multi-second black screens.
    const troubleFor = peer?.recovery.troubleFor() ?? 0;
    const isDead =
      !!peer &&
      (["failed", "closed"].includes(peer.pc.connectionState) ||
        (peer.pc.connectionState === "disconnected" && troubleFor > 8000));
    const isStuck =
      !!peer &&
      peer.pc.signalingState !== "stable" &&
      peer.pc.connectionState !== "connected" &&
      Date.now() - peer.createdAt > 8000;

    if (!peer || isDead || isStuck || forceRebuild) {
      createPeerConnection(remotePeerId);
      peer = peersRef.current.get(remotePeerId);
    }
    if (!peer) return;
    // An answer that never arrived (lost message) must not block every future
    // renegotiation of a connection that is otherwise healthy.
    if (
      peer.pc.signalingState === "have-local-offer" &&
      !peer.makingOffer &&
      peer.offerSentAt > 0 &&
      Date.now() - peer.offerSentAt > 10000
    ) {
      try {
        await peer.pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
      } catch (err) {
        console.warn("[WebRTC] rollback of unanswered offer failed:", err);
      }
    }
    await negotiate(remotePeerId, peer);
  }, [userId, createPeerConnection, canInitiateOffer, negotiate]);
  sendOfferRef.current = (peerId: string) => sendOfferTo(peerId);

  rebuildPeerRef.current = (remotePeerId: string) => {
    if (canInitiateOffer(remotePeerId)) {
      console.warn("[WebRTC] Rebuilding peer:", remotePeerId);
      void sendOfferTo(remotePeerId, true);
    } else {
      console.warn("[WebRTC] Asking offerer to rebuild peer:", remotePeerId);
      void sendSignal({ type: "request-offer", targetId: remotePeerId, isSpectator, rebuild: true });
    }
  };

  // Spectator-side: never offer (receive-only). Ask the player to (re)offer until
  // BOTH audio and video are flowing, so spectators always see AND hear everyone.
  const createSpectatorOffer = useCallback(async (playerId: string) => {
    if (!isSpectator || playerId === userId) return;

    const peer = peersRef.current.get(playerId);
    // No connection yet: the targeted "ready" heartbeat already asks the player
    // to build one. Sending a rebuild request at the same time made the player
    // create two PeerConnections back to back, and the spectator kept answering
    // the discarded one — the panel stayed on "Aguardando jogador" forever.
    if (!peer) return;
    // Give TURN/4G handshakes time to finish before interfering.
    const handshaking =
      ["new", "connecting"].includes(peer.pc.connectionState) &&
      Date.now() - peer.createdAt < 20000;
    if (handshaking) return;
    // ICE recovery (restart/rebuild) is already running for this peer.
    const recovering = (peer.recovery.troubleFor() ?? Infinity) < 20000;
    if (recovering) return;
    const videoTracks = peer?.stream?.getVideoTracks() ?? [];
    const liveVideo = videoTracks.some((t) => t.readyState === "live");
    const connected = peer?.pc.connectionState === "connected";

    // A track can stay "live" while the browser reports it as muted (sender
    // suspended, network stall). The panel freezes with no state change, which is
    // exactly the "spectator stopped working out of nowhere" symptom. Track how
    // long it has been muted and rebuild after a grace period — unless stats show
    // the network path is alive (audio/RTCP still arriving): then the player's
    // camera is the one stalled and rebuilding only interrupts the audio too.
    const frozen =
      liveVideo && videoTracks.every((t) => t.muted) && peer.health !== "video-stalled";
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

    // Audio can be missing while video is perfectly fine (the player published
    // the mic later, or the first offer had no audio m-line). In that case ask
    // for a fresh offer WITHOUT tearing down the working video connection — but
    // only a few times: a player without a microphone used to receive a
    // renegotiation request from every spectator every 6 s, forever.
    const liveAudio = (peer?.stream?.getAudioTracks() ?? []).some((t) => t.readyState === "live");
    if (connected && liveVideo && !frozenTooLong) {
      if (!liveAudio && peer.audioRequests < 3) {
        peer.audioRequests += 1;
        void sendSignal({
          type: "request-offer",
          targetId: playerId,
          isSpectator: true,
          rebuild: false,
        });
      }
      return;
    }


    // Never destroy a healthy video connection just because that player has no
    // microphone track (permission denied, no mic, or video-only fallback). The
    // previous check rebuilt that peer every 10 seconds, making duelists who were
    // spectating each other alternate between video and an infinite loader.
    const stalled =
      (!!peer && now - peer.createdAt > 20000 && (!connected || !liveVideo)) || frozenTooLong;
    if (stalled) {
      console.warn("[WebRTC] Spectator handshake stalled, resetting peer:", playerId);
      frozenVideoSinceRef.current.delete(playerId);
      removePeer(playerId);
    }


    void sendSignal({
      type: "request-offer",
      targetId: playerId,
      isSpectator: true,
      // A returning spectator has the same user id, so the player's previous
      // PeerConnection may still look connected for several seconds after the
      // old tab/route was closed. Force a fresh player-side connection whenever
      // this mount has no peer yet instead of negotiating against that stale PC.
      rebuild: !peer || stalled,
    });
  }, [isSpectator, userId, removePeer, sendSignal]);


  const handleSignal = useCallback(
    async (payload: DuelSignal) => {
      if (!payload) return;
      if (payload.senderId === userId) return;
      // If signal has a targetId and it's not for us, ignore
      if (payload.targetId && payload.targetId !== userId) return;

      const remotePeerId = payload.senderId;
      if (typeof remotePeerId !== "string") return;
      if (typeof payload.v === "number") peerProtocolRef.current.set(remotePeerId, payload.v);
      if (["ready", "offer", "request-offer"].includes(payload.type)) {
        const channel = channelRef.current;
        if (!channel) return;
        // Never make a signal wait for the edge function once ICE servers were
        // loaded at startup; a refresh happens in the background.
        await ensureIceServers({ background: true });
        if (channelRef.current !== channel) return;
      }

      // Offers/candidates also carry the role. Mark it before constructing the
      // peer so the player's negotiationneeded handler cannot race the
      // spectator's authoritative recvonly offer.
      if (payload.isSpectator && !spectatorPeersRef.current.has(remotePeerId)) {
        spectatorPeersRef.current.add(remotePeerId);
        setSpectatorPeerIds((prev) => (prev.includes(remotePeerId) ? prev : [...prev, remotePeerId]));
      }

      // A peer (spectator, or the non-offering duelist) asked us to (re)send our offer.
      if (payload.type === "request-offer") {
        if (isSpectator && !audioBroadcastOnly) return;
        const current = peersRef.current.get(remotePeerId);
        const instChanged = remoteInstanceChanged(current, payload);
        // ICE restart keeps the connection (and the picture) while new network
        // paths are probed — much cheaper than a rebuild.
        if (
          payload.iceRestart &&
          !payload.rebuild &&
          !instChanged &&
          current &&
          current.pc.remoteDescription &&
          canInitiateOffer(remotePeerId)
        ) {
          await negotiate(remotePeerId, current, { iceRestart: true });
          return;
        }
        // Ignore rebuild requests for a connection that was just created and is
        // still negotiating; rebuilding it again only restarts the handshake.
        const fresh =
          !!current &&
          !instChanged &&
          Date.now() - current.createdAt < 8000 &&
          !["failed", "closed"].includes(current.pc.connectionState);
        await sendOfferTo(remotePeerId, (!!payload.rebuild || instChanged) && !fresh);
        return;
      }

      // Remove the departed session immediately. Without this, a player can keep
      // the spectator's old PeerConnection alive and reuse it when the same user
      // returns, preventing the fresh receive-only connection from negotiating.
      if (payload.type === "leave") {
        // A late "leave" from a previous tab must not kill the new tab's connection.
        if (remoteInstanceChanged(peersRef.current.get(remotePeerId), payload)) return;
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
        const troubleFor = existingPeer?.recovery.troubleFor() ?? 0;
        const isDead =
          !!existingPeer &&
          (["failed", "closed"].includes(existingPeer.pc.connectionState) ||
            (existingPeer.pc.connectionState === "disconnected" && troubleFor > 8000));
        // The other side reloaded/re-entered: its old PC is gone even if ours
        // still looks "connected". Start over right away instead of waiting
        // ~30 s for consent-freshness to fail.
        const instChanged = remoteInstanceChanged(existingPeer, payload);
        let rebuilt = false;
        if (!existingPeer || isDead || spectatorMissingVideo || instChanged) {
          if (spectatorMissingVideo) {
            console.warn("[WebRTC] Spectator is missing player video; rebuilding peer:", remotePeerId);
          }
          if (instChanged) {
            console.warn("[WebRTC] Peer re-entered the room; rebuilding connection:", remotePeerId);
          }
          createPeerConnection(remotePeerId, { inst: payload.inst ?? null });
          rebuilt = true;
        } else if (!existingPeer.remoteInst && payload.inst) {
          existingPeer.remoteInst = payload.inst;
        }
        const peer = peersRef.current.get(remotePeerId);
        if (!peer) return;

        // A v2 peer that re-announces itself while our connection to it is
        // healthy is only heartbeating for someone else's stream. Re-offering /
        // replying to it every 4 s (×N spectators, broadcast to everyone in the
        // room) burned the project's Realtime message quota and triggered
        // "Too many messages per second" disconnects. Legacy peers keep the old
        // behaviour because they cannot tell us they reloaded.
        const healthy =
          !rebuilt &&
          !!payload.inst &&
          peer.pc.connectionState === "connected" &&
          !!peer.pc.remoteDescription;

        // Player side: proactively offer to whoever announced itself, so a
        // spectator never waits on a negotiationneeded event that may not fire.
        // Skip while a just-negotiated connection is still finishing ICE: the
        // 4s heartbeat used to re-offer mid-handshake over slow 4G/TURN links.
        const stillHandshaking =
          peer === existingPeer &&
          !!peer.pc.remoteDescription &&
          ["new", "connecting"].includes(peer.pc.connectionState) &&
          Date.now() - peer.createdAt < 15000;
        // Even for a healthy pair, allow one self-healing renegotiation every
        // 30 s while the remote keeps heartbeating (it is missing some stream).
        const recentlyOffered = Date.now() - peer.offerSentAt < 30000;
        if ((!isSpectator || audioBroadcastOnly) && !stillHandshaking && !(healthy && recentlyOffered)) {
          void sendOfferTo(remotePeerId);
        }


        // Handshake symmetry: whenever we receive a broadcast "ready" (no targetId),
        // we reply with a targeted "ready" back so the other side ALSO creates its
        // PeerConnection. Without this, whichever peer subscribed first misses the
        // other peer's initial broadcast ready and never negotiates, so audio/video
        // never arrive. Targeted replies do NOT trigger further replies (guarded by
        // payload.targetId below), avoiding an infinite ping-pong loop.
        if (!payload.targetId && !healthy) {
          void sendSignal({
            type: "ready",
            targetId: remotePeerId,
            isSpectator,
          });
        }

        return;
      }


      // Ensure peer connection exists — and that it belongs to the same remote
      // session as this message. An offer from a brand-new remote PC (reload,
      // remote rebuild) cannot be applied to our old one: ICE credentials and
      // the DTLS fingerprint differ and setRemoteDescription fails.
      let peer = peersRef.current.get(remotePeerId);
      if (payload.type === "offer" && peer && decideOffer(peer, payload) === "rebuild") {
        console.warn("[WebRTC] Offer from a new remote session; rebuilding peer:", remotePeerId);
        createPeerConnection(remotePeerId, { inst: payload.inst ?? null });
        peer = peersRef.current.get(remotePeerId);
      }
      if (!peer) {
        if (payload.type !== "offer" && payload.type !== "ice-candidate") return;
        createPeerConnection(remotePeerId, { inst: payload.inst ?? null });
        peer = peersRef.current.get(remotePeerId);
      }
      if (!peer) return;
      if (!peer.remoteInst && payload.inst) peer.remoteInst = payload.inst;
      let pc = peer.pc;
      // Receive-only spectators must always accept the player's authoritative
      // offer instead of deciding politeness from arbitrary UUID ordering.
      const polite = isSpectator || userId < remotePeerId;

      try {
        if (payload.type === "offer" || payload.type === "answer") {
          if (!payload.sdp) return;
          if (payload.type === "answer") {
            const decision = decideAnswer(peer, payload);
            if (decision === "drop") return;
            if (decision === "rebuild") {
              // The other side re-entered and answered an offer made for its
              // previous tab. Start a clean negotiation.
              if (canInitiateOffer(remotePeerId)) await sendOfferTo(remotePeerId, true);
              return;
            }
          }
          const description = new RTCSessionDescription(payload.sdp);
          const offerCollision =
            payload.type === "offer" &&
            (peer.makingOffer || pc.signalingState !== "stable");

          peer.ignoreOffer = !polite && offerCollision;
          if (peer.ignoreOffer) return;

          // Perfect Negotiation: the polite side must roll back its own pending
          // offer before accepting the remote one. Without the rollback,
          // setRemoteDescription throws in "have-local-offer" and the handshake
          // dies silently — the classic "spectator sees only one player".
          if (offerCollision) {
            try {
              await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
            } catch (err) {
              console.warn("[WebRTC] rollback failed:", err);
            }
            peer.makingOffer = false;
          }

          // An answer that arrives when we are not waiting for one is stale.
          if (payload.type === "answer" && pc.signalingState !== "have-local-offer") {
            return;
          }

          pc.setConfiguration({ ...pc.getConfiguration(), iceServers: getIceServers(), iceTransportPolicy: "all" });
          try {
            await pc.setRemoteDescription(description);
          } catch (err) {
            // Legacy remotes do not send session ids. If their offer cannot be
            // applied to our current connection it almost always comes from a
            // fresh remote PC: rebuild once and retry instead of staying stuck.
            if (payload.type !== "offer") throw err;
            console.warn("[WebRTC] Offer rejected by current connection; rebuilding and retrying:", err);
            createPeerConnection(remotePeerId, { inst: payload.inst ?? peer.remoteInst });
            const replacement = peersRef.current.get(remotePeerId);
            if (!replacement) return;
            peer = replacement;
            pc = replacement.pc;
            await pc.setRemoteDescription(description);
          }
          if (payload.pcId) peer.remotePcId = payload.pcId;

          if (peer.pendingCandidates.length > 0) {
            const queuedCandidates = peer.pendingCandidates.splice(0);
            await flushRemoteCandidates(pc, queuedCandidates);
          }
          for (const candidate of takeDeferredFor(peer.deferred, peer.remotePcId)) {
            await queueRemoteCandidate(pc, candidate, peer.pendingCandidates);
          }

          if (peersRef.current.get(remotePeerId) !== peer) return;
          if (payload.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            void sendSignal({
              type: "answer",
              sdp: pc.localDescription ?? undefined,
              targetId: remotePeerId,
              pcId: peer.localPcId,
              toPc: peer.remotePcId ?? undefined,
            });
          }
          capPeerBitrate(remotePeerId, peer);
          // Replay a negotiation requested while this one was in flight.
          if (payload.type === "answer" && peer.pendingNegotiation && canInitiateOffer(remotePeerId)) {
            void negotiate(remotePeerId, peer);
          }
        } else if (payload.type === "ice-candidate") {
          const candidates = payload.candidates ?? (payload.candidate ? [payload.candidate] : []);
          if (peer.ignoreOffer || candidates.length === 0) return;
          const decision = decideCandidate(peer, payload);
          if (decision === "drop") return;
          for (const candidate of candidates) {
            if (decision === "defer") {
              pushDeferred(peer.deferred, { pcId: payload.pcId, inst: payload.inst, candidate });
            } else {
              await queueRemoteCandidate(pc, candidate, peer.pendingCandidates);
            }
          }
        }
      } catch (err) {
        console.error("[WebRTC] signal handling error:", err);
      }
    },
    [userId, createPeerConnection, isSpectator, audioBroadcastOnly, sendOfferTo, removePeer, negotiate, sendSignal, canInitiateOffer, capPeerBitrate]
  );

  useEffect(() => {
    let disposed = false;
    let ownedChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelRetry: (() => void) | null = null;
    let removePageHide: (() => void) | null = null;
    const instanceId = instanceIdRef.current;
    const peerMap = peersRef.current;

    const spectatorPeerSet = spectatorPeersRef.current;
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
      captureBusyRef.current = true;
      setCameraAcquiring(true);
      await ensureIceServers();
      if (disposed) return;
      const stream = await acquireMedia();
      if (disposed) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      captureBusyRef.current = false;
      setCameraAcquiring(false);
      if (stream) {
        setCameraError(null);
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
              autoRecoverCamera();
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
        if (peersRef.current.size > 0) void republishRef.current();


      } else if (!isSpectator) {
        isVideoOffRef.current = true;
        setIsVideoOff(true);
        setCameraError("Câmera indisponível. Verifique a permissão e use o botão de câmera para tentar novamente.");
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

        const signalQueues = new Map<string, Promise<void>>();
        channel
          .on("broadcast", { event: "webrtc-signal" }, ({ payload }) => {
            const sender = payload?.senderId;
            if (typeof sender !== "string") return;
            const previous = signalQueues.get(sender) ?? Promise.resolve();
            const next = previous.then(async () => {
              if (!disposed && channelRef.current === channel) await handleSignal(payload as DuelSignal);
            }).catch((error) => console.warn("[WebRTC] Signal failed", error));
            signalQueues.set(sender, next);
            void next.finally(() => {
              if (signalQueues.get(sender) === next) signalQueues.delete(sender);
            });
            return next;
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              retryAttempt = 0;
              // Announce ourselves
              channel.send({
                type: "broadcast",
                event: "webrtc-signal",
                payload: { type: "ready", senderId: userId, isSpectator, v: SIGNAL_PROTOCOL_VERSION, inst: instanceId },
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

      // A reload/tab close does not run React cleanups. Tell the others right
      // away so they drop our connection instead of keeping a frozen picture.
      const onPageHide = () => {
        void channelRef.current?.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: { type: "leave", senderId: userId, v: SIGNAL_PROTOCOL_VERSION, inst: instanceId },
        });
      };
      if (typeof window.addEventListener === "function") {
        window.addEventListener("pagehide", onPageHide);
      }
      removePageHide = () => {
        if (typeof window.removeEventListener === "function") {
          window.removeEventListener("pagehide", onPageHide);
        }
      };

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
      captureGenerationRef.current += 1;
      captureBusyRef.current = false;
      cancelRetry?.();
      removePageHide?.();

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      // Detach every delayed callback before closing. Otherwise a late "closed"
      // event from the previous visit can call removePeer after re-entry and
      // delete the newly-created connection for the same player id.
      peerMap.forEach((peer) => {
        peer.recovery.dispose();
        peer.batcher?.cancel();
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
          payload: { type: "leave", senderId: userId, v: SIGNAL_PROTOCOL_VERSION, inst: instanceId },
        }).finally(() => {
          void supabase.removeChannel(channelToRemove);
        });
      }
    };
  }, [duelId, userId, handleSignal, isSpectator, audioBroadcastOnly, getActiveOutboundStream, sendOfferTo, enumerateDevices]);

  // Handshake heartbeat: while we still expect more player streams than we have,
  // re-announce ourselves periodically. A single "ready" at subscribe time can be
  // missed (peer not subscribed yet, tab throttled, reconnect), which left
  // spectators seeing only one of the two players.
  useEffect(() => {
    const expectedPlayers = isSpectator ? maxPlayers : maxPlayers - 1;
    let tick = 0;
    const hasLiveVideoFrom = (peerId: string) =>
      peersRef.current.get(peerId)?.stream?.getVideoTracks().some((t) => t.readyState === "live") ?? false;

    const announceReady = (force = false) => {
      const channel = channelRef.current;
      if (!channel) return;
      const payloadBase = { senderId: userId, isSpectator, v: SIGNAL_PROTOCOL_VERSION, inst: instanceIdRef.current };

      // Every broadcast is delivered to everybody in the room and counts toward
      // the project-wide Realtime quota. Spectators that already know the
      // official players only broadcast every third tick; the targeted requests
      // below go only to players whose video is still missing.
      const knownPlayers = Array.from(playerIdsRef.current).filter((id) => id !== userId);
      if (force || !isSpectator || knownPlayers.length === 0 || tick % 3 === 0) {
        channel.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: { type: "ready", ...payloadBase },
        });
      }

      // A spectator must request each official player directly. Relying only on
      // one room-wide broadcast is fragile when a player's tab is throttled or
      // reconnecting and could leave both reserved panels without streams.
      if (isSpectator) {
        knownPlayers.forEach((playerId) => {
          if (!force && hasLiveVideoFrom(playerId)) return;
          channel.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: { type: "ready", targetId: playerId, ...payloadBase, isSpectator: true },
          });
        });
      }
    };

    const interval = setInterval(() => {
      tick += 1;
      // Player side: an opponent feed that stays "muted" (no frames) for a long
      // time turns black while the connection still looks healthy. Rebuild it —
      // unless stats show the network path is alive (the opponent's camera is
      // what stalled, e.g. app in background); rebuilding would only cut audio.
      if (!isSpectator) {
        const now = Date.now();
        peersRef.current.forEach((peer, peerId) => {
          if (spectatorPeersRef.current.has(peerId)) return;
          const vids = peer.stream?.getVideoTracks() ?? [];
          const frozen =
            vids.length > 0 &&
            vids.every((t) => t.readyState === "live" && t.muted) &&
            peer.health !== "video-stalled";
          const key = `p:${peerId}`;
          if (!frozen) { frozenVideoSinceRef.current.delete(key); return; }
          const since = frozenVideoSinceRef.current.get(key);
          if (!since) { frozenVideoSinceRef.current.set(key, now); return; }
          if (now - since > 12000 && now - peer.createdAt > 20000) {
            console.warn("[WebRTC] Opponent video frozen, rebuilding peer:", peerId);
            frozenVideoSinceRef.current.delete(key);
            rebuildPeerRef.current(peerId);
          }
        });
      }
      const connectedPlayerVideos = Array.from(peersRef.current.entries()).filter(([peerId, peer]) => {
        if (spectatorPeersRef.current.has(peerId)) return false;
        if (isSpectator && playerIdsRef.current.size > 0 && !playerIdsRef.current.has(peerId)) return false;
        // Video is the authoritative signal that this player is watchable. A
        // missing microphone must not keep forcing SDP renegotiations forever.
        return peer.stream?.getVideoTracks().some((t) => t.readyState === "live") ?? false;
      }).length;

      if (connectedPlayerVideos >= expectedPlayers) return;
      announceReady();
    }, 4000);

    // Do not wait four seconds on mount/player-roster updates.
    const initialAnnouncement = window.setTimeout(() => announceReady(true), 250);
    return () => {
      clearInterval(interval);
      window.clearTimeout(initialAnnouncement);
    };
  }, [userId, isSpectator, maxPlayers, remotePeerIds]);

  // Media health sampling (getStats). Distinguishes "the network path is dead"
  // (→ ICE restart) from "the remote camera stopped sending" (→ do nothing; a
  // rebuild cannot fix the other side's camera and would interrupt audio).
  useEffect(() => {
    let running = false;
    const interval = window.setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await Promise.all(Array.from(peersRef.current.entries()).map(async ([peerId, peer]) => {
          if (typeof peer.pc.getStats !== "function") return;
          if (peer.pc.connectionState !== "connected") {
            peer.lastSample = null;
            peer.health = "unknown";
            peer.transportStalls = 0;
            return;
          }
          try {
            const report = await peer.pc.getStats();
            if (peersRef.current.get(peerId) !== peer) return;
            const sample = sampleInbound(report);
            peer.health = assessMediaHealth(peer.lastSample, sample);
            peer.lastSample = sample;
            peer.transportStalls = peer.health === "transport-stalled" ? peer.transportStalls + 1 : 0;
            // ~12 s with nothing at all arriving while ICE still says "connected".
            if (peer.transportStalls >= 3) {
              peer.transportStalls = 0;
              console.warn("[WebRTC] Transport stalled while connected; ICE restart:", peerId);
              peer.restartIce();
            }
          } catch {
            // getStats can fail during teardown; ignore.
          }
        }));
      } finally {
        running = false;
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);

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



  // Keep a ref mirror so watchdogs/callbacks always read the latest streams.
  useEffect(() => {
    remoteStreamsRef.current = remoteStreams;
  }, [remoteStreams]);

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
  const markAudioBlocked = useCallback((peerId: string, blocked: boolean) => {
    if (blocked) blockedAudioRef.current.add(peerId);
    else blockedAudioRef.current.delete(peerId);
    setAudioBlocked(blockedAudioRef.current.size > 0);
  }, []);

  const attachRemoteAudio = useCallback((peerId: string, el: HTMLAudioElement) => {
    const stream = remoteStreamsRef.current.get(peerId);
    const tracks = stream?.getAudioTracks().filter((t) => t.readyState === "live") ?? [];
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
      .then(() => markAudioBlocked(peerId, false))
      .catch(() => markAudioBlocked(peerId, true));
  }, [markAudioBlocked]);

  useEffect(() => {
    remoteStreams.forEach((_stream, peerId) => {
      const el = remoteAudioRefs.current.get(peerId);
      if (el) attachRemoteAudio(peerId, el);
    });
  }, [remoteStreams, remotePeerIds, attachRemoteAudio]);

  // Watchdog: re-attach and resume any audio/video element that silently stopped.
  useEffect(() => {
    const interval = window.setInterval(() => {
      remoteAudioRefs.current.forEach((el, peerId) => {
        attachRemoteAudio(peerId, el);
        if (el.paused) el.play?.().catch(() => markAudioBlocked(peerId, true));
      });
      remoteVideoRefs.current.forEach((el, peerId) => {
        const stream = remoteStreamsRef.current.get(peerId);
        if (stream && el.srcObject !== stream) el.srcObject = stream;
        el.muted = true;
        if (el.paused) el.play?.().catch(() => {});
      });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [attachRemoteAudio, markAudioBlocked]);

  const enableRemoteAudio = useCallback(() => {
    remoteAudioRefs.current.forEach((el, peerId) => {
      el.muted = false;
      el.volume = 1;
      el.play?.()
        .then(() => markAudioBlocked(peerId, false))
        .catch(() => {});
    });
    blockedAudioRef.current.clear();
    setAudioBlocked(false);
  }, [markAudioBlocked]);

  // Any user gesture in the page unlocks blocked autoplay automatically.
  useEffect(() => {
    const unlock = () => {
      if (blockedAudioRef.current.size === 0) return;
      enableRemoteAudio();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [enableRemoteAudio]);

  const setRemoteAudioRef = useCallback((peerId: string, el: HTMLAudioElement | null) => {
    if (!el) {
      remoteAudioRefs.current.delete(peerId);
      blockedAudioRef.current.delete(peerId);
      return;
    }
    remoteAudioRefs.current.set(peerId, el);
    attachRemoteAudio(peerId, el);
  }, [attachRemoteAudio]);




  const toggleMute = () => {
    const stream = phoneStream || localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = async () => {
    const track = getActiveOutboundStream()?.getVideoTracks()[0];
    await setCameraEnabled(!track || track.readyState !== "live" || !track.enabled);
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
                  className="w-full h-full object-contain"
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
                    className={`w-full h-full object-contain ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
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

      {cameraError && !isSpectator && (
        <p role="alert" className="absolute top-2 left-2 right-2 z-30 rounded bg-destructive p-2 text-sm text-destructive-foreground">{cameraError}</p>
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
            disabled={cameraAcquiring}
            title={isVideoOff ? "Ativar câmera / tentar novamente" : "Desligar câmera"}
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
