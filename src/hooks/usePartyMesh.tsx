/**
 * DuelVerse - Modo Party (malha WebRTC sem limite de participantes)
 *
 * Cada participante se conecta aos demais em malha. Quem não liga câmera nem
 * microfone entra em modo leve (apenas recebe). A sinalização usa broadcast +
 * presence do Realtime.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureIceServers, partyPcConfig } from "@/utils/iceServers";

export interface PartyPeer {
  userId: string;
  username: string;
  avatarUrl: string | null;
  stream: MediaStream | null;
  hasVideo: boolean;
  hasAudio: boolean;
  speaking: boolean;
}

interface Options {
  roomId: string;
  userId: string;
  username: string;
  avatarUrl?: string | null;
}

export function usePartyMesh({ roomId, userId, username, avatarUrl = null }: Options) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [peers, setPeers] = useState<Record<string, PartyPeer>>({});
  const [connected, setConnected] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const profilesRef = useRef<Map<string, { username: string; avatarUrl: string | null }>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const send = useCallback((payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event: "party-signal", payload });
  }, []);

  const attachAudio = useCallback((peerId: string, stream: MediaStream) => {
    let el = audioElsRef.current.get(peerId);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      (el as any).playsInline = true;
      el.style.display = "none";
      document.body.appendChild(el);
      audioElsRef.current.set(peerId, el);
    }
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play().catch(() => setAudioBlocked(true));
  }, []);

  const unlockAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => el.play().catch(() => undefined));
    setAudioBlocked(false);
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch {
        /* noop */
      }
      pcsRef.current.delete(peerId);
    }
    const el = audioElsRef.current.get(peerId);
    if (el) {
      el.srcObject = null;
      el.remove();
      audioElsRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    setPeers((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const createPeer = useCallback(
    (peerId: string) => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(partyPcConfig());
      pcsRef.current.set(peerId, pc);

      const stream = localStreamRef.current;
      if (stream && stream.getTracks().length > 0) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else {
        try {
          pc.addTransceiver("video", { direction: "recvonly" });
          pc.addTransceiver("audio", { direction: "recvonly" });
        } catch {
          /* noop */
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: "ice", from: userId, to: peerId, candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        const remote = event.streams[0] ?? new MediaStream([event.track]);
        attachAudio(peerId, remote);
        const profile = profilesRef.current.get(peerId);
        setPeers((prev) => ({
          ...prev,
          [peerId]: {
            userId: peerId,
            username: profile?.username ?? "Jogador",
            avatarUrl: profile?.avatarUrl ?? null,
            stream: remote,
            hasVideo: remote.getVideoTracks().some((t) => t.readyState === "live"),
            hasAudio: remote.getAudioTracks().some((t) => t.readyState === "live"),
            speaking: false,
          },
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          removePeer(peerId);
          // Reconstrói a conexão; o par de menor id reabre a oferta.
          if (userId < peerId) setTimeout(() => void offerTo(peerId), 800);
        }
      };

      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachAudio, removePeer, send, userId],
  );

  const offerTo = useCallback(
    async (peerId: string) => {
      await ensureIceServers();
      const pc = createPeer(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "offer", from: userId, to: peerId, sdp: pc.localDescription });
      } catch {
        /* noop */
      }
    },
    [createPeer, send, userId],
  );

  /** Reanuncia as trilhas locais para todos os pares (ao ligar câmera/mic). */
  const republish = useCallback(async () => {
    const stream = localStreamRef.current;
    for (const [peerId, pc] of pcsRef.current.entries()) {
      const senders = pc.getSenders();
      const tracks = stream ? stream.getTracks() : [];
      for (const kind of ["audio", "video"] as const) {
        const track = tracks.find((t) => t.kind === kind) ?? null;
        const sender = senders.find((s) => s.track?.kind === kind)
          ?? pc.getTransceivers().find((t) => t.receiver.track?.kind === kind)?.sender;
        if (sender) {
          try {
            await sender.replaceTrack(track);
          } catch {
            /* noop */
          }
        } else if (track && stream) {
          pc.addTrack(track, stream);
        }
      }
      if (userId < peerId) await offerTo(peerId);
    }
  }, [offerTo, userId]);

  const ensureLocalStream = useCallback(async (wantVideo: boolean, wantAudio: boolean) => {
    if (!wantVideo && !wantAudio) {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      return null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: wantVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
      audio: wantAudio ? { echoCancellation: true, noiseSuppression: true } : false,
    });
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const toggleCamera = useCallback(async () => {
    const next = !cameraOn;
    await ensureLocalStream(next, micOn);
    setCameraOn(next);
    await republish();
    await supabase
      .from("party_participants")
      .update({ camera_on: next })
      .eq("room_id", roomId)
      .eq("user_id", userId);
  }, [cameraOn, micOn, ensureLocalStream, republish, roomId, userId]);

  const toggleMic = useCallback(async () => {
    const next = !micOn;
    await ensureLocalStream(cameraOn, next);
    setMicOn(next);
    await republish();
    await supabase
      .from("party_participants")
      .update({ mic_on: next })
      .eq("room_id", roomId)
      .eq("user_id", userId);
  }, [cameraOn, micOn, ensureLocalStream, republish, roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    let cancelled = false;
    void ensureIceServers();

    const channel = supabase.channel(`party-${roomId}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, any[]>;
      const ids = Object.keys(state).filter((id) => id !== userId);
      ids.forEach((id) => {
        const meta = state[id]?.[0];
        profilesRef.current.set(id, {
          username: meta?.username ?? "Jogador",
          avatarUrl: meta?.avatarUrl ?? null,
        });
      });
      setPeers((prev) => {
        const next: Record<string, PartyPeer> = {};
        ids.forEach((id) => {
          const profile = profilesRef.current.get(id);
          next[id] = prev[id]
            ? { ...prev[id], username: profile?.username ?? prev[id].username, avatarUrl: profile?.avatarUrl ?? prev[id].avatarUrl }
            : {
                userId: id,
                username: profile?.username ?? "Jogador",
                avatarUrl: profile?.avatarUrl ?? null,
                stream: null,
                hasVideo: false,
                hasAudio: false,
                speaking: false,
              };
        });
        return next;
      });
      // Limpa quem saiu
      pcsRef.current.forEach((_pc, peerId) => {
        if (!ids.includes(peerId)) removePeer(peerId);
      });
      // Inicia oferta apenas do lado de menor id (evita colisão)
      ids.forEach((id) => {
        if (userId < id && !pcsRef.current.has(id)) void offerTo(id);
      });
    });

    channel.on("broadcast", { event: "party-signal" }, async ({ payload }) => {
      const data = payload as any;
      if (!data || data.to !== userId || data.from === userId) return;
      const peerId = data.from as string;

      if (data.type === "offer") {
        const pc = createPeer(peerId);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const queued = pendingIceRef.current.get(peerId) ?? [];
          for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined);
          pendingIceRef.current.delete(peerId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: "answer", from: userId, to: peerId, sdp: pc.localDescription });
        } catch {
          /* noop */
        }
      } else if (data.type === "answer") {
        const pc = pcsRef.current.get(peerId);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const queued = pendingIceRef.current.get(peerId) ?? [];
          for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined);
          pendingIceRef.current.delete(peerId);
        } catch {
          /* noop */
        }
      } else if (data.type === "ice") {
        const pc = pcsRef.current.get(peerId);
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => undefined);
        } else {
          const list = pendingIceRef.current.get(peerId) ?? [];
          list.push(data.candidate);
          pendingIceRef.current.set(peerId, list);
        }
      } else if (data.type === "leave") {
        removePeer(peerId);
      }
    });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED" || cancelled) return;
      setConnected(true);
      await channel.track({ userId, username, avatarUrl });
    });

    return () => {
      cancelled = true;
      try {
        channel.send({ type: "broadcast", event: "party-signal", payload: { type: "leave", from: userId, to: "*" } });
      } catch {
        /* noop */
      }
      pcsRef.current.forEach((_pc, peerId) => removePeer(peerId));
      pcsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  return {
    localStream,
    cameraOn,
    micOn,
    peers: Object.values(peers),
    connected,
    audioBlocked,
    unlockAudio,
    toggleCamera,
    toggleMic,
  };
}
