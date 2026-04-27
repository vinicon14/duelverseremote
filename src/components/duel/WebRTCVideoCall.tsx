import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, MicOff, Video, VideoOff, Loader2, LayoutGrid, PictureInPicture2, ZoomIn, ZoomOut, Settings, Monitor, MonitorStop } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  /** Creator user ID - used by spectators to correctly order peers (creator on left) */
  creatorId?: string;
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
  spectatorLpOverlay,
  isSpectator = false,
  creatorId,
}, ref) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remotePeerIds, setRemotePeerIds] = useState<string[]>([]);
  const [pipSwapped, setPipSwapped] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const MAX_ZOOM = 4;
  const MIN_ZOOM = 0.7;
  const ZOOM_STEP = 0.15;

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
    const constraints: MediaStreamConstraints = {
      audio: audioId ? { deviceId: { exact: audioId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: videoId
        ? { deviceId: { exact: videoId }, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } }
        : { facingMode: { ideal: defaultFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } },
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Stop old tracks
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = newStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }

      // Replace tracks in all peer connections
      peersRef.current.forEach((peerState) => {
        const senders = peerState.pc.getSenders();
        newStream.getTracks().forEach(newTrack => {
          const sender = senders.find(s => s.track?.kind === newTrack.kind);
          if (sender) {
            sender.replaceTrack(newTrack);
          } else {
            peerState.pc.addTrack(newTrack, newStream);
          }
        });
      });

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
  }, [isMuted, isVideoOff, enumerateDevices]);

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

  // Remove a disconnected peer from state so UI reverts to "Aguardando jogador"
  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(peerId);
    }
    remoteVideoRefs.current.delete(peerId);
    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    setRemotePeerIds(prev => prev.filter(id => id !== peerId));
    console.log("[WebRTC] Peer removed:", peerId);
  }, []);

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

    // Add local tracks (or recvonly transceivers for spectators)
    // When screen sharing, use displayStreamRef instead of localStreamRef
    const localStream = isSharingScreen ? displayStreamRef.current : localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    } else if (isSpectator) {
      // Spectators: ensure SDP includes media sections to receive audio + video
      try {
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.addTransceiver("video", { direction: "recvonly" });
        console.log("[WebRTC] Spectator recvonly transceivers added for:", remotePeerId);
      } catch (err) {
        console.error("[WebRTC] Failed to add recvonly transceivers:", err);
      }
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

    // Monitor ICE connection and auto-recover or remove disconnected peer
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state ${remotePeerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn("[WebRTC] ICE failed for:", remotePeerId);
        // Remove peer so UI shows "Aguardando jogador" again
        removePeer(remotePeerId);
      } else if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.warn("[WebRTC] Peer disconnected permanently:", remotePeerId);
            removePeer(remotePeerId);
          }
        }, 5000);
      } else if (pc.iceConnectionState === 'closed') {
        removePeer(remotePeerId);
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
  }, [userId, isSpectator]);

  const handleSignal = useCallback(
    async (payload: any) => {
      if (payload.senderId === userId) return;
      // If signal has a targetId and it's not for us, ignore
      if (payload.targetId && payload.targetId !== userId) return;

      const remotePeerId = payload.senderId;

      if (payload.type === "ready") {
        const isNewPeer = !peersRef.current.has(remotePeerId);
        if (isNewPeer) {
          createPeerConnection(remotePeerId);
        }
        const peer = peersRef.current.get(remotePeerId);
        if (!peer) return;

        // Spectator handshake: if we are spectator and this is a new player peer,
        // reply with our own targeted "ready" so the player knows to create an offer.
        if (isSpectator && isNewPeer && payload.isSpectator !== true) {
          channelRef.current?.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: { type: "ready", senderId: userId, targetId: remotePeerId, isSpectator: true },
          });
        }

        // Decide who creates the offer:
        // - Spectator never creates the offer.
        // - If remote is spectator, we (player) always create it.
        // - Otherwise, glare-avoidance via id comparison.
        const remoteIsSpectator = payload.isSpectator === true;
        let shouldCreateOffer: boolean;
        if (isSpectator) {
          shouldCreateOffer = false;
        } else if (remoteIsSpectator) {
          shouldCreateOffer = true;
        } else {
          shouldCreateOffer = userId > remotePeerId;
        }

        if (shouldCreateOffer) {
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
    [userId, createPeerConnection, isSpectator]
  );

  useEffect(() => {
    let disposed = false;

    const acquireMedia = async (): Promise<MediaStream | null> => {
    // Spectators don't need local media - receive only
    if (isSpectator) return null;

    // If screen sharing is active, return the display stream
    if (isSharingScreen && displayStreamRef.current) {
      return displayStreamRef.current;
    }

    // Em mobile, priorizar câmera traseira ('environment'); em desktop usa frontal ('user')
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const primaryFacing = isMobile ? 'environment' : 'user';
    const fallbackFacing = isMobile ? 'user' : 'environment';
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const constraints = [
      { video: { facingMode: { exact: primaryFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } }, audio: audioConstraints },
      { video: { facingMode: { ideal: primaryFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } }, audio: audioConstraints },
      { video: { facingMode: { ideal: primaryFacing } }, audio: audioConstraints },
      { video: { facingMode: { ideal: fallbackFacing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: audioConstraints },
      { video: { facingMode: { ideal: fallbackFacing } }, audio: audioConstraints },
      { video: true, audio: audioConstraints },
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
        // Track initial device IDs
        const aTrack = stream.getAudioTracks()[0];
        const vTrack = stream.getVideoTracks()[0];
        if (aTrack) setSelectedAudioId(aTrack.getSettings().deviceId || "");
        if (vTrack) setSelectedVideoId(vTrack.getSettings().deviceId || "");
        // Re-enumerate to get labels
        enumerateDevices();
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
      } else if (!isSpectator) {
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
              payload: { type: "ready", senderId: userId, isSpectator },
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
  }, [duelId, userId, handleSignal, isSpectator]);

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

  const toggleScreenShare = async () => {
    if (isSharingScreen) {
      // Stop screen sharing and go back to camera
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach(t => t.stop());
        displayStreamRef.current = null;
      }
      
      // Restore camera if it was previously active
      if (localStreamRef.current) {
        // Camera is already active, just make sure it's enabled
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !isVideoOff; // Set to opposite of isVideoOff
        }
      }
      
      setIsSharingScreen(false);
    } else {
      // Start screen sharing
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        });

        displayStreamRef.current = displayStream;

        // Stop local camera stream when sharing screen
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
        }

        // Update all peer connections with screen share stream
        peersRef.current.forEach((peerState) => {
          // Remove all existing tracks
          peerState.pc.getSenders().forEach(sender => {
            peerState.pc.removeTrack(sender);
          });
          
          // Add screen share tracks
          displayStream.getTracks().forEach(track => {
            peerState.pc.addTrack(track, displayStream);
          });
        });

        setIsSharingScreen(true);
        
        // Notify user
        toast({
          title: "Compartilhamento de tela iniciado",
          description: "Sua tela está sendo compartilhada na chamada.",
        });
      } catch (err) {
        console.error("[WebRTC] Screen share error:", err);
        toast({
          title: "Erro ao compartilhar tela",
          description: "Não foi possível iniciar o compartilhamento de tela.",
          variant: "destructive",
        });
      }
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
  // For spectators: sort peers so creator comes first (local panel = left = creator)
  const sortedPeerIds = isSpectator && creatorId
    ? [...remotePeerIds].sort((a, b) => {
        if (a === creatorId) return -1;
        if (b === creatorId) return 1;
        return 0;
      })
    : remotePeerIds;

  const remoteSlots: (string | null)[] = [];
  if (isSpectator) {
    // Skip first peer (used in local panel), use rest for remote slots
    for (let i = 0; i < totalSlots - 1; i++) {
      remoteSlots.push(sortedPeerIds[i + 1] || null);
    }
  } else {
    for (let i = 0; i < totalSlots - 1; i++) {
      remoteSlots.push(remotePeerIds[i] || null);
    }
  }

  const localVideoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    (localVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
      el.srcObject = localStreamRef.current;
    }
  }, []);

  const renderLocalPanel = () => {
    // For spectators: show the first remote stream as "Player 1" panel instead of local camera
    if (isSpectator) {
      // Spectator's "local panel" actually shows player 1 (creator) stream
      // We use the first remote peer as player 1
      const player1PeerId = sortedPeerIds[0] || null;
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
          {localDeckOpen && localDeckContent && (
            <div className="w-full h-full overflow-auto bg-background touch-pan-y">
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
          style={{
            transform: zoomLevel > 1 
              ? `scaleX(-1) scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`
              : 'scaleX(-1)',
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

    // Only show deck overlay when deck is explicitly open AND content exists
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
          <div className="w-full h-full overflow-auto bg-background touch-pan-y">
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
          style={zoomLevel < 1 ? { transform: `scale(${zoomLevel})` } : undefined}
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
          className={`flex flex-col sm:flex-row w-full h-full transition-transform duration-200 origin-center ${zoomLevel < 1 ? 'rounded-2xl border-2 border-purple-500 overflow-hidden' : ''}`}
          style={zoomLevel < 1 ? { transform: `scale(${zoomLevel})` } : undefined}
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
            style={zoomLevel < 1 ? { transform: `scale(${zoomLevel})` } : undefined}
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
                      transform: zoomLevel > 1 
                        ? `scaleX(-1) scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`
                        : 'scaleX(-1)',
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

      {/* Controls bar — hidden for spectators */}
      {!isSpectator && (
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
          <Button
            variant="outline"
            size="icon"
            onClick={toggleScreenShare}
            className={`rounded-full w-8 h-8 sm:w-10 sm:h-10 backdrop-blur-sm ${isSharingScreen ? "bg-purple-500/80 text-white" : "bg-card/80"}`}
          >
            {isSharingScreen ? <MonitorStop className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
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
        </div>
      )}
    </div>
  );
});

WebRTCVideoCall.displayName = "WebRTCVideoCall";
