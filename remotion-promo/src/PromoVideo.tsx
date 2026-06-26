import React from "react";
import {
  AbsoluteFill, Audio, Img, Sequence,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadOrbitron } from "@remotion/google-fonts/Orbitron";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const orbitron = loadOrbitron("normal", { weights: ["700", "900"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });
const DISPLAY = orbitron.fontFamily;
const BODY = inter.fontFamily;

const CYAN = "#06b6d4";
const PURPLE = "#a855f7";
const BG = "#0a1224";
const WHITE = "#ffffff";

export interface PromoConfig {
  narration: string;        // file in public/audio/
  music: string;
  hook1: string;            // big word
  hook2: string;            // accent word
  hookSub: string;
  heroShot: string;         // public/shots/
  heroLabel: string;
  featureShots: { src: string; label: string }[]; // 3 items
  ctaHeadline: string;      // small line above big DUELVERSE
}

const TechBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const drift = frame * 0.3;
  const gridSize = 80;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 40%, #102043 0%, ${BG} 60%, #050813 100%)` }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.18 }}>
        <defs>
          <pattern id="g" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse" patternTransform={`translate(${-drift % gridSize} ${-drift * 0.5 % gridSize})`}>
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={CYAN} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
      <div style={{
        position: "absolute", left: 0, right: 0,
        top: `${(frame * 1.2) % 110 - 5}%`,
        height: 2, background: `linear-gradient(90deg, transparent, ${CYAN}, transparent)`,
        opacity: 0.5, filter: "blur(1px)",
      }} />
      <AbsoluteFill style={{ background: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.7) 100%)", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

const Scene1Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const lineW = interpolate(frame, [10, 50], [0, 600], { extrapolateRight: "clamp" });
  const glow = interpolate(frame, [20, 60], [0, 1], { extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{
        fontFamily: DISPLAY, fontWeight: 900, fontSize: 140, color: WHITE,
        letterSpacing: 8, transform: `scale(${0.7 + scale * 0.3})`,
        textShadow: `0 0 ${20 + glow * 60}px ${CYAN}, 0 0 ${40 + glow * 80}px rgba(6,182,212,${glow * 0.6})`,
      }}>DUELVERSE</div>
      <div style={{ width: lineW, height: 3, background: `linear-gradient(90deg, transparent, ${CYAN}, ${PURPLE}, transparent)`, marginTop: 12 }} />
      <div style={{ marginTop: 28, fontFamily: BODY, fontSize: 22, color: CYAN, letterSpacing: 10, opacity: subOp, textTransform: "uppercase" }}>
        Remote Dueling System
      </div>
    </AbsoluteFill>
  );
};

const Scene2Hook: React.FC<{ cfg: PromoConfig }> = ({ cfg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w1 = spring({ frame, fps, config: { damping: 12 } });
  const w2 = spring({ frame: frame - 20, fps, config: { damping: 12 } });
  const w3 = spring({ frame: frame - 45, fps, config: { damping: 10, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "center", paddingLeft: 140 }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 180, color: WHITE, lineHeight: 0.95, transform: `translateX(${(1 - w1) * -200}px)`, opacity: w1 }}>{cfg.hook1}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 110, color: CYAN, lineHeight: 1, marginTop: 20, transform: `translateX(${(1 - w2) * -200}px)`, opacity: w2, textShadow: `0 0 30px ${CYAN}` }}>{cfg.hook2}</div>
      <div style={{ fontFamily: BODY, fontWeight: 400, fontSize: 38, color: "#cbd5e1", marginTop: 30, opacity: w3, letterSpacing: 2 }}>{cfg.hookSub}</div>
    </AbsoluteFill>
  );
};

const Scene3Interface: React.FC<{ cfg: PromoConfig }> = ({ cfg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18, stiffness: 80 } });
  const labelOp = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "relative", width: 1400, height: 800,
        transform: `perspective(2000px) rotateY(${(1 - s) * -25}deg) scale(${0.85 + s * 0.15})`,
        opacity: s, borderRadius: 18, overflow: "hidden",
        boxShadow: `0 0 80px rgba(6,182,212,0.6), 0 0 120px rgba(168,85,247,0.3)`,
        border: `2px solid ${CYAN}`,
      }}>
        <Img src={staticFile(`shots/${cfg.heroShot}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 20, left: 20, fontFamily: DISPLAY, fontSize: 18, color: CYAN, letterSpacing: 4, opacity: labelOp }}>◢ {cfg.heroLabel}</div>
        <div style={{ position: "absolute", bottom: 20, right: 20, fontFamily: BODY, fontSize: 16, color: WHITE, opacity: labelOp }}>duelverse.site</div>
      </div>
    </AbsoluteFill>
  );
};

const Scene4Features: React.FC<{ cfg: PromoConfig }> = ({ cfg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, flexDirection: "row" }}>
      {cfg.featureShots.map((f, i) => {
        const s = spring({ frame: frame - i * 12, fps, config: { damping: 16 } });
        const color = i === 1 ? PURPLE : CYAN;
        return (
          <div key={i} style={{
            width: 540, height: 720, borderRadius: 14, overflow: "hidden",
            border: `2px solid ${color}`,
            boxShadow: `0 0 50px ${i === 1 ? "rgba(168,85,247,0.5)" : "rgba(6,182,212,0.5)"}`,
            transform: `translateY(${(1 - s) * 80}px) scale(${0.9 + s * 0.1})`,
            opacity: s, position: "relative", background: "#000",
          }}>
            <Img src={staticFile(`shots/${f.src}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "14px 20px",
              background: `linear-gradient(transparent, rgba(10,18,36,0.95))`,
              fontFamily: DISPLAY, fontSize: 22, color: WHITE, letterSpacing: 3,
            }}>● {f.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Scene5Outro: React.FC<{ cfg: PromoConfig }> = ({ cfg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  const ctaOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const pulse = 1 + Math.sin(frame * 0.15) * 0.03;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 36, color: CYAN, letterSpacing: 8, opacity: s, transform: `translateY(${(1 - s) * 30}px)`, textAlign: "center" }}>{cfg.ctaHeadline}</div>
      <div style={{
        marginTop: 20, fontFamily: DISPLAY, fontWeight: 900, fontSize: 200, color: WHITE,
        letterSpacing: 6, transform: `scale(${pulse})`,
        textShadow: `0 0 40px ${CYAN}, 0 0 100px rgba(168,85,247,0.6)`, opacity: s,
      }}>DUELVERSE</div>
      <div style={{ width: 600, height: 2, background: `linear-gradient(90deg, transparent, ${CYAN}, ${PURPLE}, transparent)`, marginTop: 16, opacity: s }} />
      <div style={{
        marginTop: 36, padding: "20px 60px",
        border: `2px solid ${CYAN}`, fontFamily: DISPLAY, fontSize: 32, color: WHITE,
        letterSpacing: 4, opacity: ctaOp,
        background: "rgba(6,182,212,0.08)",
        boxShadow: `0 0 30px rgba(6,182,212,0.4)`,
      }}>duelverse.site</div>
    </AbsoluteFill>
  );
};

export const PromoVideo: React.FC<{ cfg: PromoConfig }> = ({ cfg }) => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <TechBackground />
      <Sequence from={0} durationInFrames={90}><Scene1Logo /></Sequence>
      <Sequence from={90} durationInFrames={150}><Scene2Hook cfg={cfg} /></Sequence>
      <Sequence from={240} durationInFrames={150}><Scene3Interface cfg={cfg} /></Sequence>
      <Sequence from={390} durationInFrames={150}><Scene4Features cfg={cfg} /></Sequence>
      <Sequence from={540} durationInFrames={150}><Scene5Outro cfg={cfg} /></Sequence>
      <Audio src={staticFile(`audio/${cfg.narration}`)} volume={1.0} />
      <Audio src={staticFile(`audio/${cfg.music}`)} volume={0.22} />
    </AbsoluteFill>
  );
};

export const CONFIGS: Record<string, PromoConfig> = {
  video2: {
    narration: "narration2.mp3", music: "music2.mp3",
    hook1: "TORNEIOS.", hook2: "TODO DIA.", hookSub: "Suíço, Top Cut, premiação real.",
    heroShot: "tournaments.png", heroLabel: "TORNEIOS / LIVE",
    featureShots: [
      { src: "tournaments.png", label: "SUÍÇO + TOP CUT" },
      { src: "rankings.png",    label: "RANKING GLOBAL" },
      { src: "rooms.png",       label: "DUELO AO VIVO" },
    ],
    ctaHeadline: "ENTRE NA ARENA",
  },
  video3: {
    narration: "narration3.mp3", music: "music3.mp3",
    hook1: "MONTE.", hook2: "EM SEGUNDOS.", hookSub: "Busca, importação e IA pra reconhecer cartas.",
    heroShot: "deckbuilder.png", heroLabel: "DECK BUILDER / AI",
    featureShots: [
      { src: "deckbuilder.png", label: "BUSCA INTELIGENTE" },
      { src: "deckbuilder.png", label: "IMPORT DECKLIST" },
      { src: "deckbuilder.png", label: "IA RECONHECE CARTA" },
    ],
    ctaHeadline: "MONTE SEU DECK",
  },
  video4: {
    narration: "narration4.mp3", music: "music4.mp3",
    hook1: "SEM CARTAS?", hook2: "SEM PROBLEMA.", hookSub: "Arena Digital completa, com videochamada.",
    heroShot: "rooms.png", heroLabel: "ARENA DIGITAL",
    featureShots: [
      { src: "rooms.png", label: "PONTOS DE VIDA" },
      { src: "rooms.png", label: "EFEITOS / FASES" },
      { src: "rooms.png", label: "VIDEOCHAMADA HD" },
    ],
    ctaHeadline: "DUELO 100% ONLINE",
  },
  video5: {
    narration: "narration5.mp3", music: "music5.mp3",
    hook1: "PERSONALIZE.", hook2: "SEU CAMPO.", hookSub: "Sleeves, playmats e cosméticos PRO.",
    heroShot: "marketplace.png", heroLabel: "MARKETPLACE",
    featureShots: [
      { src: "marketplace.png", label: "SLEEVES EXCLUSIVAS" },
      { src: "marketplace.png", label: "PLAYMATS ANIMADOS" },
      { src: "marketplace.png", label: "DUELCOINS / PRO" },
    ],
    ctaHeadline: "MOSTRE SEU ESTILO",
  },
};
