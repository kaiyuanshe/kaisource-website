import { useTranslation } from "../hooks/useTranslation";
import styles from "./PreviewNotice.module.css";

export default function PreviewNotice() {
  const { t } = useTranslation();
  if (process.env.NEXT_PUBLIC_SITE_PREVIEW_MODE !== "true") return null;
  return (
    <aside className={styles.notice} role="status" data-testid="preview-notice">
      <strong>{t("preview.read_only")}</strong>
      <span>{t("preview.description")}</span>
    </aside>
  );
}
