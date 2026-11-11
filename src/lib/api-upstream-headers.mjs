// A protected backend is accessed only with operator-configured credentials.
// Never forward a browser's protection headers or send this secret to a
// different origin during a rollback or redirect.
export function upstreamProtectionHeaders(destination, settings = process.env) {
  const secret = settings.API_PROXY_BYPASS_SECRET;
  const origin = settings.API_PROXY_BYPASS_ORIGIN;
  if (!secret || !origin || /[\r\n]/.test(secret)) return {};
  try {
    const target = new URL(destination);
    const configured = new URL(origin);
    if (target.protocol !== 'https:' || configured.protocol !== 'https:' ||
        target.username || target.password || configured.username || configured.password ||
        configured.pathname !== '/' || configured.search || configured.hash ||
        target.origin !== configured.origin) return {};
    return { 'x-vercel-protection-bypass': secret };
  } catch {
    return {};
  }
}
