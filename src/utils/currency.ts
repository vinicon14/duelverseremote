/**
 * DuelVerse - Moeda de cobrança por idioma.
 *
 * Preços são cadastrados em BRL. Para idiomas de países que cobram em dólar
 * ou euro, convertemos e arredondamos para um valor "redondo" (ex.: US$ 9.99).
 * As mesmas taxas existem em supabase/functions/stripe-create-checkout/index.ts.
 */
export type Currency = "BRL" | "USD" | "EUR";

// Taxas fixas de conversão a partir do BRL (revisar periodicamente).
export const RATES: Record<Currency, number> = {
  BRL: 1,
  USD: 0.19,
  EUR: 0.17,
};

const LANGUAGE_CURRENCY: Record<string, Currency> = {
  "pt-BR": "BRL",
  "pt-PT": "EUR",
  fr: "EUR",
  de: "EUR",
  it: "EUR",
  nl: "EUR",
  es: "EUR",
  pl: "EUR",
  en: "USD",
  ja: "USD",
  ko: "USD",
  zh: "USD",
  ru: "USD",
  tr: "USD",
  ar: "USD",
  id: "USD",
};

export const currencyForLanguage = (language?: string | null): Currency => {
  if (!language) return "USD";
  return LANGUAGE_CURRENCY[language] ?? LANGUAGE_CURRENCY[language.split("-")[0]] ?? "USD";
};

/** Converte de BRL e arredonda para terminar em .99 (mínimo 0.99). */
export const convertFromBRL = (amountBRL: number, currency: Currency): number => {
  if (currency === "BRL") return +Number(amountBRL).toFixed(2);
  const converted = Number(amountBRL) * RATES[currency];
  const rounded = Math.max(1, Math.ceil(converted));
  return +(rounded - 0.01).toFixed(2);
};

export const formatCurrency = (amount: number, currency: Currency, language?: string): string => {
  if (currency === "BRL") return `R$ ${amount.toFixed(2).replace(".", ",")}`;
  const locale = currency === "EUR" ? language || "de-DE" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency === "EUR" ? "€" : "$"} ${amount.toFixed(2)}`;
  }
};
