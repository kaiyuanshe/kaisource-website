import type { NextApiRequest, NextApiResponse } from 'next';
import { oauthLoginUrl } from '@/lib/oauth-url.mjs';
import { issueOAuthState, oauthSiteOrigin, oauthStateCookie } from '@/lib/oauth-state.mjs';

export default function startOAuth(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secure = process.env.NODE_ENV === 'production';
  const origin = oauthSiteOrigin(process.env.NEXTAUTH_URL, secure);
  if (!origin) return res.status(503).json({ error: 'OAuth is not configured' });
  if (req.headers.origin !== origin || req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    return res.status(403).json({ error: 'Invalid login origin' });
  }
  try {
    const { state, cookie } = issueOAuthState(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET);
    const runtimeEnv = process.env;
    const url = oauthLoginUrl(runtimeEnv.NEXT_PUBLIC_OAUTH, origin, '/login', state);
    if (!url) return res.status(503).json({ error: 'OAuth is not configured' });
    res.setHeader('Set-Cookie', oauthStateCookie(cookie, secure));
    return res.status(200).json({ url });
  } catch {
    return res.status(503).json({ error: 'OAuth is not configured' });
  }
}
