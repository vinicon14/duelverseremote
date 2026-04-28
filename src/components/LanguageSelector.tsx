/**
 * LanguageSelector — permite ao usuário alterar o idioma da interface.
 * Persiste em localStorage (via setAppLanguage) e na coluna profiles.language_code.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/i18n/countries";
import { setAppLanguage } from "@/i18n";

interface LanguageSelectorProps {
  userId: string;
  currentLanguage?: string | null;
  onLanguageUpdated?: (lng: string) => void;
}

export const LanguageSelector = ({ userId, currentLanguage, onLanguageUpdated }: LanguageSelectorProps) => {
  const { i18n, t } = useTranslation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string>(currentLanguage || i18n.language || "en");

  const handleChange = async (newLng: string) => {
    setValue(newLng);
    setSaving(true);
    try {
      await setAppLanguage(newLng as LanguageCode);
      const { error } = await supabase
        .from("profiles")
        .update({ language_code: newLng })
        .eq("user_id", userId);
      if (error) throw error;
      onLanguageUpdated?.(newLng);
      toast({
        title: t("profile.languageUpdated", "Idioma atualizado"),
        description: SUPPORTED_LANGUAGES.find((l) => l.code === newLng)?.name,
      });
    } catch (err: any) {
      toast({
        title: t("common.error", "Erro"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-mystic">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <span className="text-gradient-mystic">{t("profile.language", "Idioma")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Select value={value} onValueChange={handleChange} disabled={saving}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {SUPPORTED_LANGUAGES.map((lng) => (
                <SelectItem key={lng.code} value={lng.code}>
                  <span className="flex items-center gap-2">
                    <span className="text-lg leading-none">{lng.flag}</span>
                    <span>{lng.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t(
            "profile.languageHint",
            "Altera o idioma da interface, do chat global e da fila de matchmaking."
          )}
        </p>
      </CardContent>
    </Card>
  );
};

export default LanguageSelector;
