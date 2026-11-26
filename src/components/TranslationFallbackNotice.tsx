import { Alert } from "antd";
import { useTranslation } from "@/hooks/useTranslation";

type TranslationFallbackNoticeProps = {
  contentLocale?: string;
};

export default function TranslationFallbackNotice({
  contentLocale,
}: TranslationFallbackNoticeProps) {
  const { locale, translateText } = useTranslation();

  if (!contentLocale || contentLocale === locale) {
    return null;
  }

  const message =
    locale === "en"
      ? translateText("此内容暂时没有英文版本，以下显示中文原文。")
      : locale === "zh-TW"
        ? "此內容暫時沒有繁體中文版本，以下顯示現有內容。"
        : "此内容暂时没有简体中文版本，以下显示英文原文。";

  return (
    <Alert
      banner
      showIcon
      type="info"
      message={message}
    />
  );
}
