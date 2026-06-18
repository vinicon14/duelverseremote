import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LanguageCode } from "@/i18n/countries";

interface LocalizedRouteProps {
  element: React.ComponentType;
}

const supported = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export const LocalizedRoute = ({ element: Element }: LocalizedRouteProps) => {
  const { lang } = useParams<{ lang: string }>();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (lang && supported.has(lang) && i18n.language !== lang) {
      i18n.changeLanguage(lang as LanguageCode);
    }
  }, [lang, i18n]);

  return <Element />;
};

export default LocalizedRoute;
