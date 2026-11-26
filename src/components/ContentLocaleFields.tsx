import { Form, InputNumber, Select } from "antd";
import { useTranslation } from "@/hooks/useTranslation";

export function getContentLocaleValues(values: Record<string, unknown>) {
  const translationOf = Number(values.translationOf);

  return {
    locale: typeof values.locale === "string" ? values.locale : undefined,
    translation_of:
      Number.isInteger(translationOf) && translationOf > 0
        ? translationOf
        : undefined,
  };
}

export default function ContentLocaleFields() {
  const { locale, translateText } = useTranslation();

  return (
    <>
      <Form.Item
        label={translateText("内容语言")}
        name="locale"
        initialValue={locale}
        rules={[{ required: true, message: translateText("请选择内容语言") }]}
      >
        <Select
          options={[
            { value: "zh-CN", label: translateText("简体中文") },
            { value: "en", label: "English" },
          ]}
        />
      </Form.Item>
      <Form.Item
        label={translateText("关联语言版本 ID（可选）")}
        name="translationOf"
        tooltip={translateText(
          "填写原始内容的 ID，所有语言版本都关联同一个原始内容。文章和公告留空时，仅在同分类、同原文链接且匹配唯一时自动识别；活动请填写关联 ID。",
        )}
        extra={translateText(
          "切换语言会显示已发布的对应版本，不会自动翻译正文。",
        )}
      >
        <InputNumber min={1} precision={0} style={{ width: "100%" }} />
      </Form.Item>
    </>
  );
}
