import type { NextApiRequest, NextApiResponse } from 'next';
import { proxyAPI } from '@/lib/api-proxy.mjs';

export const config = { api: { bodyParser: false, responseLimit: false }, maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await proxyAPI(req, res);
}
