import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";
import ptPT from "./locales/pt-PT.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";
import ru from "./locales/ru.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import tr from "./locales/tr.json";
import ar from "./locales/ar.json";
import id from "./locales/id.json";

export const resources = {
  en: { translation: en },
  "pt-BR": { translation: ptBR },
  "pt-PT": { translation: ptPT },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
  ja: { translation: ja },
  ko: { translation: ko },
  zh: { translation: zh },
  ru: { translation: ru },
  nl: { translation: nl },
  pl: { translation: pl },
  tr: { translation: tr },
  ar: { translation: ar },
  id: { translation: id },
} as const;
