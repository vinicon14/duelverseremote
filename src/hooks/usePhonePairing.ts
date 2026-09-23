import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { ensureIceServers, partyPcConfig } from "@/utils/iceServers";
import { queueRemoteCandidate, flushRemoteCandidates } from "@/utils/webrtcCandidates";

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
  attemptId?: string;
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
  const attemptRef = useRef<string | undefined>(undefined);

  const send = useCallback((signal: Omit<Signal, "from">) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "sig",
      payload: { ...signal, attemptId: attemptRef.current, from: "host" },
    });
  }, []);

  const disconnect = useCallback(() => {
    try {
      send({ type: "bye" });
    } catch { /* Best-effort departure; the channel may already be closed. */ }
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

    let disposed = false;
    let disconnectedAt: number | null = null;
    let pendingCandidates: RTCIceCandidateInit[] = [];
    const resetPeer = () => {
      const pc = pcRef.current;
      pcRef.current = null;
      pendingCandidates = [];
      disconnectedAt = null;
      if (pc) { pc.onconnectionstatechange = null; pc.onicecandidate = null; pc.ontrack = null; pc.close(); }
      setRemoteStream(null);
      setStatus("disconnected");
    };
    const setupPC = () => {
      const pc = new RTCPeerConnection(partyPcConfig());
      pcRef.current = pc;
      const stream = new MediaStream();
      setRemoteStream(stream);

      pc.ontrack = (e) => {
        (e.streams[0]?.getTracks() ?? [e.track]).forEach((t) => {
          stream.getTracks().filter(old => old.kind === t.kind && old.id !== t.id).forEach(old => stream.removeTrack(old));
          stream.addTrack(t);
        });
        setRemoteStream(new MediaStream(stream.getTracks()));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: "ice", candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") { disconnectedAt = null; setStatus("connected"); }
        else if (s === "failed" || s === "closed") resetPeer();
        else if (s === "disconnected") disconnectedAt ??= Date.now();
      };
      return pc;
    };

    const handleSignal = async ({ payload }: { payload: Signal }) => {
      const msg = payload as Signal;
      if (!msg || disposed || msg.from !== "phone") return;
      if (msg.type !== "claim" && msg.attemptId && msg.attemptId !== attemptRef.current) return;

      if (msg.type === "claim") {
        if (msg.token !== token) return;
        await ensureIceServers();
        if (disposed || channelRef.current !== channel) return;
        if (msg.attemptId && msg.attemptId !== attemptRef.current) resetPeer();
        attemptRef.current = msg.attemptId;
        setStatus("connecting");
        if (!pcRef.current) setupPC();
        send({ type: "ready" });
      } else if (msg.type === "offer" && pcRef.current && msg.sdp) {
        const pc = pcRef.current;
        await pc.setRemoteDescription(msg.sdp);
        await flushRemoteCandidates(pc, pendingCandidates);
        if (disposed || pcRef.current !== pc) return;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", sdp: answer });
      } else if (msg.type === "ice" && pcRef.current && msg.candidate) {
        await queueRemoteCandidate(pcRef.current, msg.candidate, pendingCandidates);
      } else if (msg.type === "bye") {
        resetPeer();
      }
    };
    let signals = Promise.resolve();
    channel.on("broadcast", { event: "sig" }, (message) => {
      signals = signals.then(() => handleSignal({ payload: message.payload as Signal })).catch(error => console.warn("[PhonePair] Host signal failed", error));
      return signals;
    });
    const watchdog = window.setInterval(() => {
      if (disconnectedAt !== null && Date.now() - disconnectedAt > 10000) resetPeer();
    }, 2000);

    channel.subscribe();

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      resetPeer();
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
  facingMode?: "user" | "environment";
  cameraOn: boolean;
  micOn: boolean;
  initialStream?: MediaStream | null;
}) {
  const { sessionId, token, cameraOn, micOn, initialStream = null } = params;
  const [status, setStatus] = useState<PairStatus>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const attemptRef = useRef<string | undefined>(undefined);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const initialStreamRef = useRef<MediaStream | null>(null);
  const appliedConstraintsRef = useRef<string | null>(null);

  const send = useCallback((signal: Omit<Signal, "from">) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "sig",
      payload: { ...signal, attemptId: attemptRef.current, from: "phone" },
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

  // The phone page owns media acquisition (camera switching / rotation).
  // Whenever it hands us a new stream, swap the outgoing tracks.
  useEffect(() => {
    if (!sessionId || !initialStream) return;
    if (initialStreamRef.current === initialStream) return;
    initialStreamRef.current = initialStream;
    appliedConstraintsRef.current = null;
    applyStream(initialStream).catch(() => {});
  }, [sessionId, initialStream, applyStream]);

  // Toggle tracks on/off without re-acquiring media.
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = cameraOn; });
    stream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
  }, [cameraOn, micOn, localStream]);


  useEffect(() => {
    if (!sessionId || !token) return;

    const channel = supabase.channel(`phone-pair:${sessionId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;
    let disposed = false;
    let pendingCandidates: RTCIceCandidateInit[] = [];
    let startedAt = Date.now();
    let disconnectedAt: number | null = null;
    attemptRef.current = crypto.randomUUID();
    const resetPeer = () => {
      const pc = pcRef.current;
      pcRef.current = null;
      videoSenderRef.current = null;
      audioSenderRef.current = null;
      pendingCandidates = [];
      disconnectedAt = null;
      if (pc) { pc.onconnectionstatechange = null; pc.onicecandidate = null; pc.close(); }
      attemptRef.current = crypto.randomUUID();
      setStatus("disconnected");
    };

    const handleSignal = async ({ payload }: { payload: Signal }) => {
      const msg = payload as Signal;
      if (!msg || disposed || msg.from !== "host") return;
      if (msg.attemptId && msg.attemptId !== attemptRef.current) return;

      if (msg.type === "ready") {
        if (pcRef.current) return;
        await ensureIceServers();
        if (disposed || channelRef.current !== channel || pcRef.current) return;
        setStatus("connecting");
        setError(null);
        startedAt = Date.now();
        const pc = new RTCPeerConnection(partyPcConfig());
        pcRef.current = pc;
        pc.onicecandidate = (e) => {
          if (e.candidate) send({ type: "ice", candidate: e.candidate.toJSON() });
        };
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === "connected") setStatus("connected");
          else if (s === "failed" || s === "closed") resetPeer();
          else if (s === "disconnected") disconnectedAt ??= Date.now();
          if (s === "connected") disconnectedAt = null;
        };

        // Wait briefly for stream if not yet available
        let attempts = 0;
        while (!streamRef.current && attempts < 40) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
        if (disposed || pcRef.current !== pc) return;
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
        if (!disposed && pcRef.current === pc) send({ type: "offer", sdp: offer });
      } else if (msg.type === "answer" && pcRef.current && msg.sdp) {
        const pc = pcRef.current;
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(msg.sdp);
        await flushRemoteCandidates(pc, pendingCandidates);
      } else if (msg.type === "ice" && pcRef.current && msg.candidate) {
        await queueRemoteCandidate(pcRef.current, msg.candidate, pendingCandidates);
      } else if (msg.type === "bye") {
        resetPeer();
      }
    };
    let signals = Promise.resolve();
    channel.on("broadcast", { event: "sig" }, (message) => {
      signals = signals.then(() => handleSignal({ payload: message.payload as Signal })).catch(error => {
        if (!disposed) { resetPeer(); setError("Conexão interrompida. Tentando novamente…"); }
        console.warn("[PhonePair] Signal failed", error);
      });
      return signals;
    });

    let claimTimer: number | null = null;

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        if (claimTimer) window.clearInterval(claimTimer);
        if (!pcRef.current) setStatus("waiting");
        send({ type: "claim", token });
        claimTimer = window.setInterval(() => {
          const pc = pcRef.current;
          const stalled = pc && pc.connectionState !== "connected" && Date.now() - startedAt > 20000;
          if (stalled || (disconnectedAt !== null && Date.now() - disconnectedAt > 10000)) resetPeer();
          if (!disposed && !pcRef.current) send({ type: "claim", token });
        }, 1200);
      }
    });

    return () => {
      disposed = true;
      try {
        channel.send({ type: "broadcast", event: "sig", payload: { from: "phone", type: "bye", attemptId: attemptRef.current } });
      } catch { /* Best-effort departure; the channel may already be closed. */ }
      if (claimTimer) window.clearInterval(claimTimer);
      resetPeer();
      supabase.removeChannel(channel);
      channelRef.current = null;
      // The phone page owns capture; reconnecting must not stop its tracks.
    };
  }, [sessionId, token, send]);

  return { status, localStream, error };
}
