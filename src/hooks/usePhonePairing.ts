import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
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
];

export type PairStatus =
  | "idle"
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface Signal {
  from: "host" | "phone";
  type: "claim" | "ready" | "offer" | "answer" | "ice" | "bye";
  token?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * HOST (Desktop) side of the phone-pair link.
 * - Generates sessionId + token
 * - Waits for phone to `claim`
 * - Receives audio+video tracks as MediaStream
 */
export function useHostPairing() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [token] = useState(() =>
    Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
  const [status, setStatus] = useState<PairStatus>("waiting");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const send = useCallback((signal: Omit<Signal, "from">) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "sig",
      payload: { ...signal, from: "host" },
    });
  }, []);

  const disconnect = useCallback(() => {
    try {
      send({ type: "bye" });
    } catch {}
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    setRemoteStream(null);
    setStatus("disconnected");
  }, [send]);

  useEffect(() => {
    const channel = supabase.channel(`phone-pair:${sessionId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    const setupPC = () => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      const stream = new MediaStream();
      setRemoteStream(stream);

      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => stream.addTrack(t));
        setRemoteStream(new MediaStream(stream.getTracks()));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: "ice", candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") setStatus("connected");
        else if (s === "failed" || s === "closed") setStatus("disconnected");
      };
      return pc;
    };

    channel.on("broadcast", { event: "sig" }, async ({ payload }) => {
      const msg = payload as Signal;
      if (msg.from !== "phone") return;

      if (msg.type === "claim") {
        if (msg.token !== token) return;
        setStatus("connecting");
        if (!pcRef.current) setupPC();
        send({ type: "ready" });
      } else if (msg.type === "offer" && pcRef.current && msg.sdp) {
        await pcRef.current.setRemoteDescription(msg.sdp);
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        send({ type: "answer", sdp: answer });
      } else if (msg.type === "ice" && pcRef.current && msg.candidate) {
        try {
          await pcRef.current.addIceCandidate(msg.candidate);
        } catch {}
      } else if (msg.type === "bye") {
        pcRef.current?.close();
        pcRef.current = null;
        setRemoteStream(null);
        setStatus("disconnected");
      }
    });

    channel.subscribe();

    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId, token, send]);

  return { sessionId, token, status, remoteStream, disconnect };
}

/**
 * PHONE side of the pairing.
 * - Joins channel with sessionId
 * - Sends `claim` with token
 * - On `ready`: gets local media and sends offer
 */
export function usePhoneClientPairing(params: {
  sessionId: string | null;
  token: string | null;
  facingMode: "user" | "environment";
  cameraOn: boolean;
  micOn: boolean;
  initialStream?: MediaStream | null;
}) {
  const { sessionId, token, facingMode, cameraOn, micOn, initialStream = null } = params;
  const [status, setStatus] = useState<PairStatus>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const initialStreamRef = useRef<MediaStream | null>(null);
  const appliedConstraintsRef = useRef<string | null>(null);

  const send = useCallback((signal: Omit<Signal, "from">) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "sig",
      payload: { ...signal, from: "phone" },
    });
  }, []);

  const applyStream = useCallback(async (stream: MediaStream | null) => {
    streamRef.current = stream;
    setLocalStream(stream);

    const videoTrack = stream?.getVideoTracks()[0] ?? null;
    const audioTrack = stream?.getAudioTracks()[0] ?? null;
    if (videoTrack) videoTrack.enabled = cameraOn;
    if (audioTrack) audioTrack.enabled = micOn;

    if (videoSenderRef.current) await videoSenderRef.current.replaceTrack(videoTrack);
    if (audioSenderRef.current) await audioSenderRef.current.replaceTrack(audioTrack);
  }, [cameraOn, micOn]);

  const constraintsKey = `${facingMode}:${cameraOn}:${micOn}`;

  // Use the stream captured directly from the user's tap before starting WebRTC.
  useEffect(() => {
    if (!sessionId || !initialStream || initialStreamRef.current === initialStream) return;
    initialStreamRef.current = initialStream;
    appliedConstraintsRef.current = constraintsKey;
    applyStream(initialStream).catch(() => {});
  }, [sessionId, initialStream, constraintsKey, applyStream]);

  // Re-acquire media and replace tracks when controls change after permission is granted.
  useEffect(() => {
    if (!sessionId || !initialStream) return;
    if (appliedConstraintsRef.current === constraintsKey) return;

    let cancelled = false;
    (async () => {
      try {
        if (!cameraOn && !micOn) {
          const emptyStream = new MediaStream();
          streamRef.current?.getTracks().forEach((t) => t.stop());
          await applyStream(emptyStream);
          appliedConstraintsRef.current = constraintsKey;
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraOn ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          audio: micOn ? { echoCancellation: true, noiseSuppression: true } : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Stop previous
        streamRef.current?.getTracks().forEach((t) => t.stop());
        await applyStream(stream);
        appliedConstraintsRef.current = constraintsKey;
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Falha ao acessar câmera/microfone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, initialStream, constraintsKey, facingMode, cameraOn, micOn, applyStream]);

  useEffect(() => {
    if (!sessionId || !token) return;

    const channel = supabase.channel(`phone-pair:${sessionId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "sig" }, async ({ payload }) => {
      const msg = payload as Signal;
      if (msg.from !== "host") return;

      if (msg.type === "ready") {
        if (pcRef.current) return;
        setStatus("connecting");
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;
        pc.onicecandidate = (e) => {
          if (e.candidate) send({ type: "ice", candidate: e.candidate.toJSON() });
        };
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === "connected") setStatus("connected");
          else if (s === "failed" || s === "closed") setStatus("disconnected");
        };

        // Wait briefly for stream if not yet available
        let attempts = 0;
        while (!streamRef.current && attempts < 40) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
        const stream = streamRef.current;
        const videoTrack = stream?.getVideoTracks()[0];
        const audioTrack = stream?.getAudioTracks()[0];
        if (videoTrack) {
          videoSenderRef.current = pc.addTrack(videoTrack, stream!);
        } else {
          videoSenderRef.current = pc.addTransceiver("video", { direction: "sendonly" }).sender;
        }
        if (audioTrack) {
          audioSenderRef.current = pc.addTrack(audioTrack, stream!);
        } else {
          audioSenderRef.current = pc.addTransceiver("audio", { direction: "sendonly" }).sender;
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "offer", sdp: offer });
      } else if (msg.type === "answer" && pcRef.current && msg.sdp) {
        await pcRef.current.setRemoteDescription(msg.sdp);
      } else if (msg.type === "ice" && pcRef.current && msg.candidate) {
        try {
          await pcRef.current.addIceCandidate(msg.candidate);
        } catch {}
      } else if (msg.type === "bye") {
        pcRef.current?.close();
        pcRef.current = null;
        setStatus("disconnected");
      }
    });

    let claimTimer: ReturnType<typeof window.setInterval> | null = null;

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setStatus("waiting");
        send({ type: "claim", token });
        claimTimer = window.setInterval(() => {
          if (!pcRef.current) send({ type: "claim", token });
        }, 1200);
      }
    });

    return () => {
      try {
        channel.send({ type: "broadcast", event: "sig", payload: { from: "phone", type: "bye" } });
      } catch {}
      if (claimTimer) window.clearInterval(claimTimer);
      pcRef.current?.close();
      pcRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [sessionId, token, send]);

  return { status, localStream, error };
}
