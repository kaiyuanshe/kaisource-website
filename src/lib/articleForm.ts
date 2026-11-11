// Values produced by the Ant Design article forms after field validation.
// Match the editor fields instead of treating every known field as unknown.
export interface ArticleFormValues extends Record<string, unknown> {
  title: string;
  description: string;
  content: string;
  source?: string;
  license?: string;
  author: string;
  translator?: string;
  editor?: string;
  locale?: string;
  translationOf?: number;
}
