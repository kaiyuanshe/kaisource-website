import type { NextApiRequest, NextApiResponse } from 'next';

// Compatibility URL only: the browser follows a same-origin 307 with its POST
// intact. The authoritative Go API owns the challenge, image, expiry and limits.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  return res.redirect(307, '/v1/captcha/generate');
}
