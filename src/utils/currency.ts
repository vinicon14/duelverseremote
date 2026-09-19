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

/**
 * Converte de BRL e arredonda para um valor comercial terminando em 9
 * (ex.: 0.49, 1.89, 9.49). Mantém pacotes diferentes com preços diferentes
 * e respeita o valor mínimo aceito pelo checkout internacional (0.50).
 */
export const MIN_CHARGE = 0.5;

export const convertFromBRL = (amountBRL: number, currency: Currency): number => {
  if (currency === "BRL") return +Number(amountBRL).toFixed(2);
  const converted = Number(amountBRL) * RATES[currency];
  // arredonda para cima na casa dos 10 centavos e tira 1 centavo
  const rounded = +(Math.ceil(converted * 10) / 10 - 0.01).toFixed(2);
  return Math.max(MIN_CHARGE, rounded);
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
