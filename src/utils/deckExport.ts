import type { DeckCard } from "@/components/deckbuilder/DeckPanel";

export type DeckFormat = "ydk" | "ydke" | "json" | "csv" | "txt" | "image";

export interface DeckExport {
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
}

function flattenSection(cards: DeckCard[]): number[] {
  const ids: number[] = [];
  cards.forEach((card) => {
    for (let i = 0; i < card.quantity; i++) ids.push(card.id);
  });
  return ids;
}

export function generateYDK(deck: DeckExport): string {
  const lines = ["#created by DuelVerse Deck Builder", "#main"];
  flattenSection(deck.main).forEach((id) => lines.push(String(id)));
  lines.push("#extra");
  flattenSection(deck.extra).forEach((id) => lines.push(String(id)));
  lines.push("!side");
  flattenSection(deck.side).forEach((id) => lines.push(String(id)));
  return lines.join("\n") + "\n";
}

export function generateYDKE(deck: DeckExport): string {
  const main = flattenSection(deck.main).join(",");
  const extra = flattenSection(deck.extra).join(",");
  const side = flattenSection(deck.side).join(",");
  const raw = `${main}!${extra}!${side}`;
  return btoa(raw);
}

export function generateJSON(deck: DeckExport, deckName?: string): string {
  const section = (cards: DeckCard[]) =>
    cards.flatMap((c) => Array.from({ length: c.quantity }, () => ({
      id: c.id,
      name: c.name,
      type: c.type,
      atk: c.atk,
      def: c.def,
      level: c.level,
      race: c.race,
      attribute: c.attribute,
    })));
  return JSON.stringify({
    name: deckName || "DuelVerse Deck",
    main: section(deck.main),
    extra: section(deck.extra),
    side: section(deck.side),
  }, null, 2);
}

export function generateCSV(deck: DeckExport): string {
  const rows = ["Section,Id,Name,Type,ATK,DEF,Level,Race,Attribute"];
  const add = (section: string, cards: DeckCard[]) => {
    cards.forEach((card) => {
      for (let i = 0; i < card.quantity; i++) {
        rows.push(`${section},${card.id},"${card.name}",${card.type},${card.atk ?? ""},${card.def ?? ""},${card.level ?? ""},${card.race},${card.attribute ?? ""}`);
      }
    });
  };
  add("main", deck.main);
  add("extra", deck.extra);
  add("side", deck.side);
  return rows.join("\n");
}

export function generateTXT(deck: DeckExport): string {
  const lines: string[] = [];
  const add = (header: string, cards: DeckCard[]) => {
    if (cards.length === 0) return;
    lines.push(`=== ${header} ===`);
    cards.forEach((card) => {
      lines.push(`${card.quantity}x ${card.name}`);
    });
    lines.push("");
  };
  add("Main Deck", deck.main);
  add("Extra Deck", deck.extra);
  add("Side Deck", deck.side);
  return lines.join("\n");
}

function corsProxy(url: string): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  try {
    const proxied = corsProxy(src);
    const res = await fetch(proxied);
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}

async function loadBrandImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number, minSize: number) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `700 ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

async function drawDeckImage(deck: DeckExport, deckName?: string): Promise<Blob | null> {
  const CANVAS_W = 1280;
  const CARD_W = 112;
  const CARD_H = 164;
  const COLS = 10;
  const GAP = 8;
  const OUTER_PAD = 28;
  const SECTION_PAD = 14;
  const SECTION_HEADER_H = 42;
  const SECTION_GAP = 18;
  const TOP_HEADER_H = 112;
  const FOOTER_H = 42;

  const sections: { label: string; cards: DeckCard[]; accent: string; glow: string }[] = [];
  if (deck.main.length > 0) sections.push({ label: "MAIN DECK", cards: deck.main, accent: "#9b5cff", glow: "rgba(155, 92, 255, 0.22)" });
  if (deck.extra.length > 0) sections.push({ label: "EXTRA DECK", cards: deck.extra, accent: "#32d5ff", glow: "rgba(50, 213, 255, 0.18)" });
  if (deck.side.length > 0) sections.push({ label: "SIDE DECK", cards: deck.side, accent: "#ff4fa3", glow: "rgba(255, 79, 163, 0.18)" });

  if (sections.length === 0) return null;

  const countCards = (cards: DeckCard[]) => cards.reduce((sum, card) => sum + card.quantity, 0);
  const totalCards = sections.reduce((sum, section) => sum + countCards(section.cards), 0);
  const sectionHeight = (cards: DeckCard[]) => {
    const rows = Math.ceil(countCards(cards) / COLS);
    return SECTION_PAD + SECTION_HEADER_H + rows * CARD_H + Math.max(0, rows - 1) * GAP + SECTION_PAD;
  };
  const canvasH = TOP_HEADER_H
    + sections.reduce((sum, section) => sum + sectionHeight(section.cards), 0)
    + Math.max(0, sections.length - 1) * SECTION_GAP
    + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const background = ctx.createLinearGradient(0, 0, CANVAS_W, canvasH);
  background.addColorStop(0, "#07050f");
  background.addColorStop(0.52, "#10091d");
  background.addColorStop(1, "#050913");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CANVAS_W, canvasH);

  // Grade técnica discreta da identidade DuelVerse.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#7040a8";
  ctx.lineWidth = 1;
  for (let x = 0; x <= CANVAS_W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }
  for (let y = 0; y <= canvasH; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();
  }
  ctx.restore();

  // Moldura externa em duas cores da marca.
  const frameGradient = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  frameGradient.addColorStop(0, "#7738d6");
  frameGradient.addColorStop(0.5, "#cf65ff");
  frameGradient.addColorStop(1, "#20c7f5");
  ctx.strokeStyle = frameGradient;
  ctx.lineWidth = 4;
  roundedRect(ctx, 10, 10, CANVAS_W - 20, canvasH - 20, 18);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  roundedRect(ctx, 17, 17, CANVAS_W - 34, canvasH - 34, 14);
  ctx.stroke();

  // Cabeçalho: nome do deck à esquerda e assinatura DuelVerse no canto.
  ctx.fillStyle = "#b889ff";
  ctx.font = "700 13px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("DECKLIST OFICIAL", OUTER_PAD + 4, 39);
  const title = deckName?.trim() || "Deck sem nome";
  const titleSize = fitText(ctx, title, 820, 34, 20);
  ctx.fillStyle = "#f8f7ff";
  ctx.font = `700 ${titleSize}px Arial, sans-serif`;
  ctx.fillText(title, OUTER_PAD + 4, 76);
  ctx.fillStyle = "#9c96ac";
  ctx.font = "500 13px Arial, sans-serif";
  ctx.fillText(`${totalCards} CARTAS  •  DUELVERSE.SITE`, OUTER_PAD + 4, 98);

  const logo = await loadBrandImage(`${window.location.origin}/favicon.png`);
  if (logo) {
    ctx.drawImage(logo, CANVAS_W - 273, 27, 64, 64);
  } else {
    ctx.strokeStyle = "#f8f7ff";
    ctx.lineWidth = 5;
    roundedRect(ctx, CANVAS_W - 258, 41, 34, 42, 7);
    ctx.stroke();
    roundedRect(ctx, CANVAS_W - 248, 31, 34, 42, 7);
    ctx.stroke();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#f8f7ff";
  ctx.font = "700 25px Arial, sans-serif";
  ctx.fillText("DUELVERSE", CANVAS_W - 205, 60);
  ctx.fillStyle = "#a9a3b6";
  ctx.font = "500 10px Arial, sans-serif";
  ctx.fillText("GLOBAL TCG DUEL PLATFORM", CANVAS_W - 205, 78);

  type CardPosition = { src?: string; x: number; y: number; accent: string };
  const cardPositions: CardPosition[] = [];
  let y = TOP_HEADER_H;

  for (const section of sections) {
    const boxHeight = sectionHeight(section.cards);
    const boxWidth = CANVAS_W - OUTER_PAD * 2;
    ctx.save();
    ctx.shadowColor = section.glow;
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(12, 12, 24, 0.92)";
    roundedRect(ctx, OUTER_PAD, y, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = section.accent;
    ctx.lineWidth = 2;
    roundedRect(ctx, OUTER_PAD, y, boxWidth, boxHeight, 10);
    ctx.stroke();

    const sectionCount = countCards(section.cards);
    ctx.fillStyle = section.accent;
    roundedRect(ctx, OUTER_PAD, y, 7, boxHeight, 4);
    ctx.fill();
    ctx.font = "700 17px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(section.label, OUTER_PAD + SECTION_PAD + 8, y + 28);
    ctx.fillStyle = "#8f899d";
    ctx.font = "600 12px Arial, sans-serif";
    ctx.fillText(`${sectionCount} CARTAS`, OUTER_PAD + SECTION_PAD + 155, y + 28);

    const cardsY = y + SECTION_PAD + SECTION_HEADER_H;
    let cardIndex = 0;

    for (const card of section.cards) {
      for (let i = 0; i < card.quantity; i++) {
        const row = Math.floor(cardIndex / COLS);
        const col = cardIndex % COLS;
        const x = OUTER_PAD + SECTION_PAD + col * (CARD_W + GAP);
        const src = card.card_images[0]?.image_url_small || card.card_images[0]?.image_url;
        cardPositions.push({ src, x, y: cardsY + row * (CARD_H + GAP), accent: section.accent });
        cardIndex += 1;
      }
    }
    y += boxHeight + SECTION_GAP;
  }

  const cardImages = await Promise.all(cardPositions.map((entry) => entry.src ? loadImage(entry.src) : Promise.resolve(null)));
  cardPositions.forEach((entry, index) => {
    ctx.fillStyle = "#19152a";
    roundedRect(ctx, entry.x, entry.y, CARD_W, CARD_H, 5);
    ctx.fill();
    const image = cardImages[index];
    if (image) {
      ctx.save();
      roundedRect(ctx, entry.x, entry.y, CARD_W, CARD_H, 5);
      ctx.clip();
      ctx.drawImage(image, entry.x, entry.y, CARD_W, CARD_H);
      ctx.restore();
    }
    ctx.strokeStyle = entry.accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    roundedRect(ctx, entry.x, entry.y, CARD_W, CARD_H, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  const footerY = canvasH - FOOTER_H;
  ctx.fillStyle = "#817a91";
  ctx.font = "500 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CRIADO NO DUELVERSE  •  CONSTRUA, TESTE E DUELE", CANVAS_W / 2, footerY + 21);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function exportDeckImage(deck: DeckExport, deckName?: string) {
  const blob = await drawDeckImage(deck, deckName);
  if (!blob) return;
  const safe = (deckName || "deck").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDeck(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportDeck(deck: DeckExport, format: DeckFormat, deckName?: string) {
  const safe = (deckName || "deck").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  switch (format) {
    case "ydk":
      downloadDeck(generateYDK(deck), `${safe}.ydk`, "text/plain");
      break;
    case "ydke":
      downloadDeck(generateYDKE(deck), `${safe}.ydke`, "text/plain");
      break;
    case "json":
      downloadDeck(generateJSON(deck, deckName), `${safe}.json`, "application/json");
      break;
    case "csv":
      downloadDeck(generateCSV(deck), `${safe}.csv`, "text/csv");
      break;
    case "txt":
      downloadDeck(generateTXT(deck), `${safe}.txt`, "text/plain");
      break;
    case "image":
      exportDeckImage(deck, deckName);
      break;
  }
}

export const FORMAT_LABELS: Record<DeckFormat, { en: string; pt: string }> = {
  ydk: { en: "YDK (YGOPRODeck)", pt: "YDK (YGOPRODeck)" },
  ydke: { en: "YDKE (Konami)", pt: "YDKE (Konami)" },
  json: { en: "JSON", pt: "JSON" },
  csv: { en: "CSV (Spreadsheet)", pt: "CSV (Planilha)" },
  txt: { en: "Text (Plain)", pt: "Texto (Simples)" },
  image: { en: "Image (PNG)", pt: "Imagem (PNG)" },
};
