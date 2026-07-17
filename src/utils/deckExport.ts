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

async function drawDeckImage(deck: DeckExport, deckName?: string): Promise<Blob | null> {
  const CARD_W = 120;
  const CARD_H = 176;
  const COLS = 10;
  const PAD = 6;
  const HEADER_H = 28;
  const SECTION_GAP = 12;
  const TOP_PAD = 40;
  const BOTTOM_PAD = 16;

  const sections: { label: string; cards: DeckCard[] }[] = [];
  if (deck.main.length > 0) sections.push({ label: "Main Deck", cards: deck.main });
  if (deck.extra.length > 0) sections.push({ label: "Extra Deck", cards: deck.extra });
  if (deck.side.length > 0) sections.push({ label: "Side Deck", cards: deck.side });

  if (sections.length === 0) return null;

  const totalCards = sections.reduce((sum, s) => sum + s.cards.reduce((a, c) => a + c.quantity, 0), 0);
  const totalRows = Math.ceil(totalCards / COLS);
  const canvasH = TOP_PAD + sections.length * (HEADER_H + SECTION_GAP) + totalRows * (CARD_H + PAD) + BOTTOM_PAD;
  const canvasW = COLS * (CARD_W + PAD) + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Title
  if (deckName) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(deckName, canvasW / 2, 24);
  }

  let y = TOP_PAD;
  const imagePromises: { img: HTMLImageElement; x: number; y: number; qty: number }[] = [];
  let col = 0;

  for (const section of sections) {
    // Section header
    ctx.fillStyle = "#a855f7";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${section.label} (${section.cards.reduce((a, c) => a + c.quantity, 0)})`, PAD, y + 16);
    y += HEADER_H;

    for (const card of section.cards) {
      for (let i = 0; i < card.quantity; i++) {
        const x = PAD + col * (CARD_W + PAD);
        imagePromises.push({ img: null as any, x, y, qty: card.quantity });
        const last = imagePromises[imagePromises.length - 1];

        const src = card.card_images[0]?.image_url_small || card.card_images[0]?.image_url;
        if (src) {
          last.img = await loadImage(src);
        }

        col++;
        if (col >= COLS) {
          col = 0;
          y += CARD_H + PAD;
        }
      }
    }
    if (col > 0) {
      col = 0;
      y += CARD_H + PAD;
    }
  }

  // Draw images
  y = TOP_PAD;
  col = 0;
  let imgIdx = 0;

  for (const section of sections) {
    y += HEADER_H;
    for (const card of section.cards) {
      for (let i = 0; i < card.quantity; i++) {
        const entry = imagePromises[imgIdx];
        const x = PAD + col * (CARD_W + PAD);

        // Card placeholder
        ctx.fillStyle = "#1a1a2e";
        ctx.beginPath();
        ctx.roundRect(x, y, CARD_W, CARD_H, 4);
        ctx.fill();

        if (entry.img) {
          ctx.drawImage(entry.img, x, y, CARD_W, CARD_H);
        }

        col++;
        if (col >= COLS) {
          col = 0;
          y += CARD_H + PAD;
        }
        imgIdx++;
      }
    }
    if (col > 0) {
      col = 0;
      y += CARD_H + PAD;
    }
  }

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
