import type { DeckCard } from "@/components/deckbuilder/DeckPanel";

export type DeckFormat = "ydk" | "ydke" | "json" | "csv" | "txt";

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
  }
}

export const FORMAT_LABELS: Record<DeckFormat, { en: string; pt: string }> = {
  ydk: { en: "YDK (YGOPRODeck)", pt: "YDK (YGOPRODeck)" },
  ydke: { en: "YDKE (Konami)", pt: "YDKE (Konami)" },
  json: { en: "JSON", pt: "JSON" },
  csv: { en: "CSV (Spreadsheet)", pt: "CSV (Planilha)" },
  txt: { en: "Text (Plain)", pt: "Texto (Simples)" },
};
