import type { NextApiRequest, NextApiResponse } from 'next';

// No in-process verifier. Its result is a short-lived, email-bound proof that
// the registration API must atomically consume in the same shared database.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  return res.redirect(307, '/v1/captcha/verify');
}
