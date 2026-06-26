// Generates narrations 2-5 via Lovable AI TTS + 4 music tracks via python
import fs from "fs";
import { spawnSync } from "child_process";

const NARRATIONS = {
  narration2: "Esqueça filas. Esqueça desistência. No Duelverse, torneios oficiais de Yu-Gi-Oh acontecem todo dia. Sistema suíço, top cut, premiação em DuelCoins. Inscreva-se, jogue ao vivo com videochamada, e suba no ranking global. Entre no Duelverse ponto site e prove quem é o melhor duelista.",
  narration3: "Monte seu deck em segundos. O Duelverse tem o maior banco de cartas multi TCG, com busca inteligente por arquétipo, importação de decklist, e inteligência artificial que reconhece suas cartas pela foto. Salve, edite, compartilhe. Tudo direto no navegador. Duelverse ponto site.",
  narration4: "Sem cartas físicas? Sem problema. A Arena Digital do Duelverse simula o duelo completo. Pontos de vida, fases, efeitos, materiais XYZ, link summon. Tudo no estilo dos torneios oficiais, com seu oponente ao vivo na videochamada. Duelverse ponto site.",
  narration5: "Personalize seu campo de batalha. Sleeves exclusivas, playmats animados, cosméticos PRO. No marketplace do Duelverse, jogadores criam, vendem e colecionam. Pague com DuelCoins ganhos jogando, ou suba para PRO e desbloqueie tudo. Duelverse ponto site.",
};

async function tts(name, text) {
  const out = `public/audio/${name}.mp3`;
  if (fs.existsSync(out)) { console.log(`skip ${name}`); return; }
  console.log(`TTS ${name}...`);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      voice: "ash",
      input: text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) { console.error(name, res.status, await res.text()); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log(`✓ ${out} ${buf.length} bytes`);
}

for (const [name, text] of Object.entries(NARRATIONS)) {
  await tts(name, text);
}

// Music: copy music1.mp3 with different filters via ffmpeg for variety
const musicVariants = [
  { name: "music2", filter: "atempo=1.08,asetrate=44100*1.04,aresample=44100" }, // slightly faster/higher
  { name: "music3", filter: "atempo=0.95,asetrate=44100*0.96,aresample=44100" }, // slower/lower
  { name: "music4", filter: "atempo=1.0,bass=g=4,treble=g=2" },                   // heavier
  { name: "music5", filter: "atempo=1.05,acrusher=level_in=1:level_out=1:bits=10:mode=lin:aa=1" }, // glitchy
];

for (const m of musicVariants) {
  const out = `public/audio/${m.name}.mp3`;
  if (fs.existsSync(out)) { console.log(`skip ${m.name}`); continue; }
  console.log(`Music ${m.name}...`);
  const r = spawnSync("ffmpeg", ["-y", "-i", "public/audio/music1.mp3", "-af", m.filter, out], { stdio: "inherit" });
  if (r.status !== 0) process.exit(1);
}
console.log("All assets generated.");
