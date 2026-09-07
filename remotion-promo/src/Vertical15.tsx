import React from "react";
import {
  AbsoluteFill, Audio, Img, Sequence, Series,
  interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadOrbitron } from "@remotion/google-fonts/Orbitron";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const orbitron = loadOrbitron("normal", { weights: ["700", "900"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
const DISPLAY = orbitron.fontFamily;
const BODY = inter.fontFamily;

const PURPLE = "#9333EA";
const PURPLE_SOFT = "#a855f7";
const BLACK = "#09090B";
const WHITE = "#FFFFFF";
const RED = "#ff2d3d";

/* ---------------- shared layers ---------------- */

const Grid: React.FC<{ opacity?: number }> = ({ opacity = 0.16 }) => {
  const frame = useCurrentFrame();
  const size = 70;
  const d = (frame * 0.35) % size;
  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="grid15" width={size} height={size} patternUnits="userSpaceOnUse" patternTransform={`translate(${-d} ${-d * 0.6})`}>
            <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke="#6b7280" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid15)" />
      </svg>
    </AbsoluteFill>
  );
};

const Particles: React.FC<{ count?: number }> = ({ count = 26 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      {new Array(count).fill(0).map((_, i) => {
        const x = random(`x${i}`) * width;
        const speed = 0.4 + random(`s${i}`) * 1.2;
        const y = (height - ((frame * speed * 6 + random(`y${i}`) * height) % (height + 200)));
        const size = 3 + random(`r${i}`) * 8;
        const op = 0.15 + random(`o${i}`) * 0.5;
        return (
          <div key={i} style={{
            position: "absolute", left: x, top: y, width: size, height: size,
            borderRadius: random(`c${i}`) > 0.5 ? "50%" : 2,
            background: PURPLE_SOFT, opacity: op,
            boxShadow: `0 0 ${size * 2}px ${PURPLE}`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, transparent 35%, rgba(0,0,0,0.85) 100%)" }} />
);

const Scanline: React.FC<{ intensity?: number }> = ({ intensity = 0.06 }) => (
  <AbsoluteFill style={{
    backgroundImage: `repeating-linear-gradient(to bottom, rgba(255,255,255,${intensity}) 0px, rgba(255,255,255,${intensity}) 1px, transparent 1px, transparent 4px)`,
    mixBlendMode: "overlay",
  }} />
);

/* ---------------- scene 1: 0.0 - 1.5s ---------------- */

const PlaymatOutline: React.FC<{ progress: number; shake?: number }> = ({ progress, shake = 0 }) => {
  const zones = [
    // extra deck / graveyard row markers
    ...new Array(5).fill(0).map((_, i) => ({ x: 90 + i * 172, y: 250, w: 150, h: 210 })),
    ...new Array(5).fill(0).map((_, i) => ({ x: 90 + i * 172, y: 500, w: 150, h: 210 })),
  ];
  return (
    <div style={{ position: "relative", width: 950, height: 800, transform: `translateX(${shake}px)` }}>
      <svg width="950" height="800" style={{ overflow: "visible" }}>
        <rect x="20" y="180" width="910" height="580" rx="16" fill="none" stroke={PURPLE} strokeWidth="3"
          strokeDasharray="3000" strokeDashoffset={3000 - progress * 3000} opacity={0.85} />
        {zones.map((z, i) => (
          <rect key={i} x={z.x} y={z.y} width={z.w} height={z.h} rx="8" fill="none"
            stroke="#9ca3af" strokeWidth="2" opacity={interpolate(progress, [0.3 + i * 0.03, 0.6 + i * 0.03], [0, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        ))}
        {/* two overlapping cards */}
        <g opacity={interpolate(progress, [0.5, 0.9], [0, 1], { extrapolateRight: "clamp" })}>
          <rect x="330" y="300" width="170" height="240" rx="10" fill="rgba(147,51,234,0.10)" stroke={PURPLE} strokeWidth="3" transform="rotate(-9 415 420)" />
          <rect x="450" y="330" width="170" height="240" rx="10" fill="rgba(147,51,234,0.16)" stroke={PURPLE_SOFT} strokeWidth="3" transform="rotate(7 535 450)" />
        </g>
      </svg>
    </div>
  );
};

const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
  const textOp = interpolate(frame, [8, 22], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(frame, [8, 26], [40, 0], { extrapolateRight: "clamp" });
  const flash = frame > 36 && frame < 40 ? 0.35 : 0;
  return (
    <AbsoluteFill style={{ background: BLACK, alignItems: "center", justifyContent: "center" }}>
      <Grid opacity={0.13} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: 120 }}>
        <PlaymatOutline progress={progress} />
      </AbsoluteFill>
      <div style={{
        position: "absolute", top: 300, left: 70, right: 70,
        fontFamily: BODY, fontWeight: 700, fontSize: 88, lineHeight: 1.05,
        color: WHITE, textAlign: "center", opacity: textOp, transform: `translateY(${textY}px)`,
        letterSpacing: -1,
      }}>
        NÃO TEM ONDE JOGAR<br />YU-GI-OH! ONLINE?
      </div>
      <AbsoluteFill style={{ background: WHITE, opacity: flash }} />
      <Scanline />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------- scene 2: 1.5 - 3.0s ---------------- */

const Glitch: React.FC<{ text: string; frame: number }> = ({ text, frame }) => {
  const g = Math.sin(frame * 1.7) > 0.2 || frame % 7 === 0;
  const off = g ? (random(`g${frame}`) - 0.5) * 22 : 0;
  const clip = g ? `inset(${random(`c${frame}`) * 60}% 0 ${random(`d${frame}`) * 30}% 0)` : "none";
  return (
    <div style={{ position: "relative", fontFamily: DISPLAY, fontWeight: 900, fontSize: 130, letterSpacing: 2 }}>
      <span style={{ color: RED, textShadow: `0 0 40px ${RED}` }}>{text}</span>
      <span style={{ position: "absolute", left: off, top: 0, color: "#00e5ff", opacity: g ? 0.75 : 0, clipPath: clip, mixBlendMode: "screen" }}>{text}</span>
      <span style={{ position: "absolute", left: -off, top: 0, color: RED, opacity: g ? 0.7 : 0, clipPath: clip, mixBlendMode: "screen" }}>{text}</span>
    </div>
  );
};

const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shake = Math.sin(frame * 3.2) * interpolate(frame, [0, 30], [10, 2], { extrapolateRight: "clamp" });
  const s = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 140 } });
  const banOp = interpolate(frame, [14, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BLACK, alignItems: "center", justifyContent: "center" }}>
      <Grid opacity={0.1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: 60 }}>
        <PlaymatOutline progress={1} shake={shake} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: 120 }}>
        <div style={{ transform: `scale(${0.6 + s * 0.4})`, opacity: s, position: "relative", width: 420, height: 420 }}>
          <svg width="420" height="420" viewBox="0 0 420 420">
            {/* discord mark (simplified vector) */}
            <g fill="#9ca3af" transform="translate(85,140) scale(0.5)">
              <path d="M216 0C167 0 128 39 128 88v8H88c-48 0-88 40-88 88v152c0 48 40 88 88 88h280c48 0 88-40 88-88V184c0-48-40-88-88-88h-40v-8C328 39 289 0 240 0h-24z" opacity="0" />
              <path d="M420 60c-32-15-66-25-102-31-5 8-10 19-14 28-38-6-76-6-114 0-4-9-9-20-14-28C140 35 106 45 74 60 9 156-9 250 0 342c43 32 84 51 125 64 10-14 19-29 26-45-14-5-28-12-41-20 3-3 7-5 10-8 79 37 165 37 243 0 3 3 7 5 10 8-13 8-26 15-41 20 7 16 16 31 26 45 41-13 82-32 125-64 11-107-18-200-63-282zM165 285c-25 0-45-23-45-51s20-51 45-51 46 23 45 51c0 28-20 51-45 51zm164 0c-25 0-45-23-45-51s20-51 45-51 46 23 45 51c0 28-20 51-45 51z" />
            </g>
            <circle cx="210" cy="210" r="165" fill="none" stroke={RED} strokeWidth="24" opacity="0.95" />
            <line x1="93" y1="93" x2="327" y2="327" stroke={RED} strokeWidth="24" strokeLinecap="round" opacity="0.95" />
          </svg>
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", top: 380, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 76, color: WHITE, letterSpacing: -1 }}>O DISCORD FOI</div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10, opacity: banOp }}>
          <Glitch text="BANIDO?" frame={frame} />
        </div>
      </div>
      <Scanline intensity={0.09} />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------- scene 3: 3.0 - 6.0s ---------------- */

const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const blast = interpolate(frame, [0, 26], [0, 1], { extrapolateRight: "clamp" });
  const r = blast * Math.max(width, height) * 1.4;
  const calmS = spring({ frame: frame - 6, fps, config: { damping: 13, stiffness: 120 } });
  const evolS = spring({ frame: frame - 42, fps, config: { damping: 13, stiffness: 110 } });
  const calmOut = interpolate(frame, [36, 44], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BLACK, alignItems: "center", justifyContent: "center" }}>
      <Grid opacity={0.14} />
      <Particles />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{
          width: r, height: r, borderRadius: "50%",
          background: `radial-gradient(circle, rgba(147,51,234,${0.55 * (1 - blast)}) 0%, rgba(147,51,234,${0.25 * (1 - blast)}) 45%, transparent 70%)`,
          border: `${Math.max(0, 6 * (1 - blast))}px solid rgba(168,85,247,${0.8 * (1 - blast)})`,
        }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "absolute",
          fontFamily: DISPLAY, fontWeight: 900, fontSize: 170, color: WHITE, letterSpacing: 6,
          opacity: calmS * calmOut, transform: `scale(${0.85 + calmS * 0.15})`,
          textShadow: `0 0 60px ${PURPLE}`,
        }}>CALMA.</div>
        <div style={{
          position: "absolute", textAlign: "center", lineHeight: 1.02,
          fontFamily: DISPLAY, fontWeight: 900, fontSize: 108, color: WHITE, letterSpacing: 2,
          opacity: evolS, transform: `translateY(${(1 - evolS) * 60}px)`,
          textShadow: `0 0 50px rgba(147,51,234,0.9)`,
        }}>
          O DUELO<br /><span style={{ color: PURPLE_SOFT }}>EVOLUIU.</span>
        </div>
      </AbsoluteFill>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------- scene 4: 6.0 - 10.0s ---------------- */

const LifePoints: React.FC<{ label: string; from: number; to: number; startFrame: number; align: "left" | "right" }> = ({ label, from, to, startFrame, align }) => {
  const frame = useCurrentFrame();
  const v = Math.round(interpolate(frame, [startFrame, startFrame + 24], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) / 25) * 25;
  const hit = frame > startFrame && frame < startFrame + 26;
  return (
    <div style={{ textAlign: align, fontFamily: DISPLAY }}>
      <div style={{ fontFamily: BODY, fontSize: 26, color: "#cbd5e1", letterSpacing: 3 }}>{label}</div>
      <div style={{
        fontSize: 66, fontWeight: 900, color: hit ? "#ff5a6a" : WHITE,
        textShadow: `0 0 30px ${hit ? "rgba(255,90,106,0.8)" : "rgba(147,51,234,0.7)"}`,
      }}>{v}</div>
    </div>
  );
};

const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const topS = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const botS = spring({ frame: frame - 8, fps, config: { damping: 16, stiffness: 110 } });
  const lineP = interpolate(frame, [24, 60], [0, 1], { extrapolateRight: "clamp" });
  const capOp = interpolate(frame, [46, 62], [0, 1], { extrapolateRight: "clamp" });
  const panel = (src: string, s: number, dir: number) => (
    <div style={{
      width: 940, height: 560, borderRadius: 18, overflow: "hidden", position: "relative",
      border: `3px solid ${PURPLE}`, boxShadow: `0 0 60px rgba(147,51,234,0.55)`,
      transform: `translateX(${(1 - s) * 120 * dir}px) scale(${0.92 + s * 0.08})`, opacity: s, background: "#000",
    }}>
      <Img src={staticFile(`shots/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(147,51,234,0.10), transparent 40%, rgba(9,9,11,0.55))" }} />
    </div>
  );
  return (
    <AbsoluteFill style={{ background: BLACK, alignItems: "center", justifyContent: "center", gap: 40 }}>
      <Grid opacity={0.12} />
      <Particles count={16} />
      {panel("rooms.png", topS, -1)}
      {panel("home.png", botS, 1)}
      {/* P2P link line */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <svg width="1080" height="1920" style={{ position: "absolute" }}>
          <line x1="540" y1="620" x2="540" y2="1300" stroke={PURPLE_SOFT} strokeWidth="4"
            strokeDasharray="24 18" strokeDashoffset={-frame * 8} opacity={lineP * 0.9} />
          <circle cx="540" cy={620 + (1300 - 620) * ((frame % 45) / 45)} r="10" fill={WHITE} opacity={lineP} />
        </svg>
        <div style={{
          position: "absolute", top: 930, fontFamily: DISPLAY, fontSize: 30, color: PURPLE_SOFT,
          letterSpacing: 6, opacity: lineP, background: "rgba(9,9,11,0.85)", padding: "10px 24px",
          border: `1px solid ${PURPLE}`, borderRadius: 8,
        }}>WEBRTC P2P</div>
      </AbsoluteFill>
      {/* LP counters */}
      <div style={{ position: "absolute", top: 250, left: 90, right: 90, display: "flex", justifyContent: "space-between" }}>
        <LifePoints label="VOCÊ" from={8000} to={8000} startFrame={999} align="left" />
        <LifePoints label="OPONENTE" from={8000} to={7200} startFrame={30} align="right" />
      </div>
      <div style={{
        position: "absolute", bottom: 300, left: 60, right: 60, textAlign: "center",
        fontFamily: DISPLAY, fontWeight: 900, fontSize: 78, color: WHITE, letterSpacing: 1,
        opacity: capOp, textShadow: `0 0 40px rgba(147,51,234,0.8)`,
      }}>SEU DUELO<br />CONTINUA AQUI.</div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------- scene 5: 10.0 - 13.0s ---------------- */

const StatBar: React.FC<{ value: string; label: string; delay: number; pct: number }> = ({ value, label, delay, pct }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 120 } });
  return (
    <div style={{ width: 860, opacity: s, transform: `translateX(${(1 - s) * 90}px)` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 82, color: WHITE, textShadow: `0 0 30px ${PURPLE}` }}>{value}</span>
        <span style={{ fontFamily: BODY, fontSize: 30, color: "#cbd5e1", letterSpacing: 3 }}>{label}</span>
      </div>
      <div style={{ height: 12, background: "rgba(255,255,255,0.08)", borderRadius: 6, marginTop: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * s * 100}%`, background: `linear-gradient(90deg, ${PURPLE}, #38bdf8)`, boxShadow: `0 0 20px ${PURPLE}` }} />
      </div>
    </div>
  );
};

const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const beat = (i: number) => {
    const start = 36 + i * 14;
    return interpolate(frame, [start, start + 5, start + 12], [0.25, 1, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };
  return (
    <AbsoluteFill style={{ background: BLACK, alignItems: "center", justifyContent: "center", gap: 46 }}>
      <Grid opacity={0.12} />
      <Particles count={18} />
      <div style={{ position: "absolute", top: 330, display: "flex", flexDirection: "column", gap: 52 }}>
        <StatBar value="1000+" label="DUELISTAS ATIVOS" delay={0} pct={1} />
        <StatBar value="500+" label="DUELOS DIÁRIOS" delay={9} pct={0.62} />
        <StatBar value="50+" label="TORNEIOS SUÍÇOS" delay={18} pct={0.34} />
      </div>
      <div style={{ position: "absolute", bottom: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 96, color: PURPLE_SOFT, opacity: beat(0), textShadow: `0 0 50px ${PURPLE}` }}>JOGUE.</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 96, color: "#38bdf8", opacity: beat(1), textShadow: `0 0 50px #38bdf8` }}>CONECTE.</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 96, color: WHITE, opacity: Math.max(beat(2), frame > 62 ? 1 : 0) }}>DUEL.</div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------- scene 6: 13.0 - 15.0s ---------------- */

const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = interpolate(frame, [0, 8], [1, 0], { extrapolateRight: "clamp" });
  const s = spring({ frame: frame - 4, fps, config: { damping: 18, stiffness: 100 } });
  const sweep = interpolate(frame, [16, 40], [-500, 900], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctaOp = interpolate(frame, [22, 36], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#0d0d12", alignItems: "center", justifyContent: "center" }}>
      <Grid opacity={0.1} />
      <div style={{ position: "relative", opacity: s, transform: `scale(${0.9 + s * 0.1})`, textAlign: "center" }}>
        <svg width="420" height="300" viewBox="0 0 420 300">
          <rect x="105" y="40" width="150" height="215" rx="12" fill="none" stroke={WHITE} strokeWidth="7" transform="rotate(-11 180 147)" />
          <rect x="170" y="55" width="150" height="215" rx="12" fill="rgba(9,9,11,0.9)" stroke={WHITE} strokeWidth="7" transform="rotate(9 245 162)" />
        </svg>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 84, color: WHITE, letterSpacing: 10, marginTop: 10 }}>DUELVERSE</div>
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: sweep, width: 160,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
          filter: "blur(6px)", mixBlendMode: "screen",
        }} />
      </div>
      <div style={{ position: "absolute", bottom: 480, textAlign: "center", opacity: ctaOp }}>
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 52, color: WHITE, letterSpacing: 2 }}>duelverse.site</div>
        <div style={{ marginTop: 14, fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, color: PURPLE_SOFT, letterSpacing: 8 }}>ENTRE AGORA.</div>
      </div>
      <AbsoluteFill style={{ background: WHITE, opacity: flash }} />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ---------------- root ---------------- */

export const Vertical15: React.FC = () => (
  <AbsoluteFill style={{ background: BLACK }}>
    <Series>
      <Series.Sequence durationInFrames={45}><Scene1 /></Series.Sequence>
      <Series.Sequence durationInFrames={45}><Scene2 /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><Scene3 /></Series.Sequence>
      <Series.Sequence durationInFrames={120}><Scene4 /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><Scene5 /></Series.Sequence>
      <Series.Sequence durationInFrames={60}><Scene6 /></Series.Sequence>
    </Series>
    <Sequence from={90}>
      <Audio src={staticFile("audio/music1.mp3")} volume={0.35} />
    </Sequence>
    <Sequence from={186}>
      <Audio src={staticFile("audio/vo1.mp3")} volume={1} />
    </Sequence>
    <Sequence from={296}>
      <Audio src={staticFile("audio/vo2f.mp3")} volume={1} />
    </Sequence>
  </AbsoluteFill>
);
