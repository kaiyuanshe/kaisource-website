import sanitizeHtml from 'sanitize-html';

// Shared boundary for Markdown/HTML content. Marked's removed `sanitize` option
// does not clean HTML; sanitize the rendered result explicitly.
export function sanitizeRenderedHTML(html) {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'del', 's', 'input'],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class', 'id'],
      input: ['type', 'checked', 'disabled'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }),
      input: (tagName, attribs) => ({ tagName, attribs: { type: 'checkbox', disabled: 'disabled', ...('checked' in attribs ? { checked: 'checked' } : {}) } }),
    },
  });
}
