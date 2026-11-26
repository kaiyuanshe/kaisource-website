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
          "填写同一内容的另一个语言版本 ID。文章和公告如果留空，会按原文链接自动匹配已有语言版本；活动建议填写对应内容 ID。",
        )}
        extra={translateText(
          "发布两种语言时，建议让两个版本关联到同一条内容。这样前台切换语言会打开对应版本。",
        )}
      >
        <InputNumber min={1} precision={0} style={{ width: "100%" }} />
      </Form.Item>
    </>
  );
}
