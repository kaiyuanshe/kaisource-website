import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    revision: process.env.KAISOURCE_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '',
  });
}
