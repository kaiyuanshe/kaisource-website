import Router from 'next/router';

// The document's lang attribute can briefly lag a client-side transition.
// Prefer the router state when loading localized data after language changes.
export function getCurrentLocale(): string {
  if (typeof window === 'undefined') return 'zh-CN';
  return Router.locale || document.documentElement.lang || 'zh-CN';
}
