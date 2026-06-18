import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/i18n/countries";

interface LocalizedRouteProps {
  component: React.ComponentType;
}

const supported = new Set<LanguageCode>(SUPPORTED_LANGUAGES.map((l) => l.code));

export const LocalizedRoute = ({ component: Component }: LocalizedRouteProps) => {
  const { lang } = useParams<{ lang: string }>();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (lang && supported.has(lang as LanguageCode) && i18n.language !== lang) {
      i18n.changeLanguage(lang as LanguageCode);
    }
  }, [lang, i18n]);

  return <Component />;
};

export default LocalizedRoute;
