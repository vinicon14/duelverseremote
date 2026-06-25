import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
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
const BG2 = "#0f172a";
const WHITE = "#ffffff";

// ============ PERSISTENT BACKGROUND ============
const TechBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const drift = frame * 0.3;
  const gridSize = 80;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 40%, #102043 0%, ${BG} 60%, #050813 100%)` }}>
      {/* Grid */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.18 }}>
        <defs>
          <pattern id="g" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse" patternTransform={`translate(${-drift % gridSize} ${-drift * 0.5 % gridSize})`}>
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={CYAN} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
      {/* Scan line */}
      <div style={{
        position: "absolute", left: 0, right: 0,
        top: `${(frame * 1.2) % 110 - 5}%`,
        height: 2, background: `linear-gradient(90deg, transparent, ${CYAN}, transparent)`,
        opacity: 0.5, filter: "blur(1px)",
      }} />
      {/* Vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.7) 100%)", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

// ============ SCENE 1: LOGO INTRO (0 - 90) ============
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const lineW = interpolate(frame, [10, 50], [0, 600], { extrapolateRight: "clamp" });
  const glow = interpolate(frame, [20, 60], [0, 1], { extrapolateRight: "clamp" });
  const subOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{
        fontFamily: DISPLAY, fontWeight: 900, fontSize: 140, color: WHITE,
        letterSpacing: 8, transform: `scale(${0.7 + scale * 0.3})`,
        textShadow: `0 0 ${20 + glow * 60}px ${CYAN}, 0 0 ${40 + glow * 80}px rgba(6,182,212,${glow * 0.6})`,
      }}>
        DUELVERSE
      </div>
      <div style={{ width: lineW, height: 3, background: `linear-gradient(90deg, transparent, ${CYAN}, ${PURPLE}, transparent)`, marginTop: 12 }} />
      <div style={{
        marginTop: 28, fontFamily: BODY, fontSize: 22, color: CYAN, letterSpacing: 10,
        opacity: subOpacity, textTransform: "uppercase",
      }}>
        Remote Dueling System
      </div>
    </AbsoluteFill>
  );
};

// ============ SCENE 2: HOOK (90 - 240) ============
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w1 = spring({ frame: frame - 0, fps, config: { damping: 12 } });
  const w2 = spring({ frame: frame - 20, fps, config: { damping: 12 } });
  const w3 = spring({ frame: frame - 45, fps, config: { damping: 10, stiffness: 120 } });
  const glitch = Math.sin(frame * 0.5) * (frame < 80 ? 2 : 0);
  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "center", paddingLeft: 140 }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 180, color: WHITE, lineHeight: 0.95, transform: `translateX(${(1 - w1) * -200}px)`, opacity: w1 }}>
        YU-GI-OH.
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 110, color: CYAN, lineHeight: 1, marginTop: 20, transform: `translateX(${(1 - w2) * -200}px translateX(${glitch}px))`, opacity: w2, textShadow: `0 0 30px ${CYAN}` }}>
        CARA A CARA.
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 400, fontSize: 38, color: "#cbd5e1", marginTop: 30, opacity: w3, letterSpacing: 2 }}>
        Em qualquer lugar do mundo.
      </div>
    </AbsoluteFill>
  );
};

// ============ SCENE 3: INTERFACE REVEAL (240 - 390) ============
const Scene3: React.FC = () => {
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
        <Img src={staticFile("shots/home.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* HUD overlay */}
        <div style={{ position: "absolute", top: 20, left: 20, fontFamily: DISPLAY, fontSize: 18, color: CYAN, letterSpacing: 4, opacity: labelOp }}>
          ◢ INTERFACE / MAIN
        </div>
        <div style={{ position: "absolute", bottom: 20, right: 20, fontFamily: BODY, fontSize: 16, color: WHITE, opacity: labelOp }}>
          duelverse.site
        </div>
      </div>
      {/* Floating tags */}
      <div style={{
        position: "absolute", left: 80, top: 200,
        fontFamily: DISPLAY, fontSize: 24, color: PURPLE, letterSpacing: 3,
        opacity: interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(frame, [40, 70], [20, 0], { extrapolateRight: "clamp" })}px)`,
      }}>
        ◉ HD VIDEO
      </div>
      <div style={{
        position: "absolute", right: 80, top: 280,
        fontFamily: DISPLAY, fontSize: 24, color: CYAN, letterSpacing: 3,
        opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        ◉ DECK FÍSICO
      </div>
      <div style={{
        position: "absolute", left: 120, bottom: 180,
        fontFamily: DISPLAY, fontSize: 24, color: PURPLE, letterSpacing: 3,
        opacity: interpolate(frame, [80, 110], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        ◉ TEMPO REAL
      </div>
    </AbsoluteFill>
  );
};

// ============ SCENE 4: DUEL ROOM (390 - 540) ============
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const left = spring({ frame, fps, config: { damping: 16 } });
  const right = spring({ frame: frame - 12, fps, config: { damping: 16 } });
  const vsScale = spring({ frame: frame - 25, fps, config: { damping: 8, stiffness: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Left player */}
      <div style={{
        position: "absolute", left: 90, top: 200,
        width: 700, height: 480, borderRadius: 14, overflow: "hidden",
        border: `2px solid ${CYAN}`, boxShadow: `0 0 60px rgba(6,182,212,0.5)`,
        transform: `translateX(${(1 - left) * -300}px)`, opacity: left,
        background: "#000",
      }}>
        <Img src={staticFile("shots/rooms.png")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.95)" }} />
        <div style={{ position: "absolute", top: 12, left: 12, padding: "6px 14px", background: "rgba(6,182,212,0.85)", color: BG, fontFamily: DISPLAY, fontSize: 16, letterSpacing: 2 }}>
          ● VOCÊ — LP 8000
        </div>
      </div>
      {/* Right player */}
      <div style={{
        position: "absolute", right: 90, top: 400,
        width: 700, height: 480, borderRadius: 14, overflow: "hidden",
        border: `2px solid ${PURPLE}`, boxShadow: `0 0 60px rgba(168,85,247,0.5)`,
        transform: `translateX(${(1 - right) * 300}px)`, opacity: right,
        background: "#000",
      }}>
        <Img src={staticFile("shots/rankings.png")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.85) hue-rotate(-20deg)" }} />
        <div style={{ position: "absolute", top: 12, right: 12, padding: "6px 14px", background: "rgba(168,85,247,0.85)", color: WHITE, fontFamily: DISPLAY, fontSize: 16, letterSpacing: 2 }}>
          RIVAL ● LP 8000
        </div>
      </div>
      {/* VS */}
      <div style={{
        position: "absolute", fontFamily: DISPLAY, fontWeight: 900, fontSize: 220, color: WHITE,
        transform: `scale(${vsScale})`,
        textShadow: `0 0 40px ${CYAN}, 0 0 80px ${PURPLE}`,
      }}>
        VS
      </div>
    </AbsoluteFill>
  );
};

// ============ SCENE 5: OUTRO (540 - 690) ============
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  const ctaOp = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
  const pulse = 1 + Math.sin(frame * 0.15) * 0.03;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 36, color: CYAN, letterSpacing: 8, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
        O RINGUE ESTÁ ABERTO
      </div>
      <div style={{
        marginTop: 20,
        fontFamily: DISPLAY, fontWeight: 900, fontSize: 200, color: WHITE,
        letterSpacing: 6, transform: `scale(${pulse})`,
        textShadow: `0 0 40px ${CYAN}, 0 0 100px rgba(168,85,247,0.6)`,
        opacity: s,
      }}>
        DUELVERSE
      </div>
      <div style={{ width: 600, height: 2, background: `linear-gradient(90deg, transparent, ${CYAN}, ${PURPLE}, transparent)`, marginTop: 16, opacity: s }} />
      <div style={{
        marginTop: 36, padding: "20px 60px",
        border: `2px solid ${CYAN}`, fontFamily: DISPLAY, fontSize: 32, color: WHITE,
        letterSpacing: 4, opacity: ctaOp,
        background: "rgba(6,182,212,0.08)",
        boxShadow: `0 0 30px rgba(6,182,212,0.4)`,
      }}>
        duelverse.site
      </div>
    </AbsoluteFill>
  );
};

// ============ MAIN ============
export const Video1: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <TechBackground />
      <Sequence from={0} durationInFrames={90}><Scene1 /></Sequence>
      <Sequence from={90} durationInFrames={150}><Scene2 /></Sequence>
      <Sequence from={240} durationInFrames={150}><Scene3 /></Sequence>
      <Sequence from={390} durationInFrames={150}><Scene4 /></Sequence>
      <Sequence from={540} durationInFrames={150}><Scene5 /></Sequence>
      <Audio src={staticFile("audio/narration1.mp3")} volume={1.0} />
      <Audio src={staticFile("audio/music1.mp3")} volume={0.25} />
    </AbsoluteFill>
  );
};
