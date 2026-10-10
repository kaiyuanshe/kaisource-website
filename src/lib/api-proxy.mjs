import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';

const BODY_LIMIT = 10 * 1024 * 1024;
const RESPONSE_LIMIT = 16 * 1024 * 1024;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

// The destination is operator configuration, never a browser-supplied URL.
export function upstreamURL(origin, requestURL, allowLocalHTTP = false) {
  const base = new URL(origin);
  if (base.username || base.password || base.search || base.hash ||
      (base.protocol !== 'https:' && !(allowLocalHTTP && base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))) {
    throw new Error('Invalid upstream configuration');
  }
  const [pathname, ...query] = requestURL.split('?');
  const suffix = pathname.replace(/^\/(?:v1|api\/upstream)\//, '');
  if (suffix === pathname || !suffix || suffix.split('/').some(segment => {
    const decoded = decodeURIComponent(segment);
    return !decoded || decoded === '.' || decoded === '..' || /[\\/\x00-\x20\x7f]/.test(decoded);
  })) throw new Error('Invalid API path');
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/v1/${suffix}`;
  base.search = query.length ? `?${query.join('?')}` : '';
  return base;
}

// Do not share idle upstream sockets or retry mutations. A total deadline also
// covers a response that sends headers and then stops delivering its body.
export async function proxyAPI(req, res, options = {}) {
  const id = randomUUID();
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 15000;
  const log = options.log ?? (event => console.info(JSON.stringify(event)));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', id);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  let destination;
  try {
    destination = upstreamURL(options.origin ?? process.env.API_PROXY_ORIGIN, req.url, options.allowLocalHTTP);
  } catch {
    res.statusCode = 503;
    res.end(JSON.stringify({ code: 503, message: 'API unavailable', requestId: id }));
    return;
  }
  if (!METHODS.has(req.method)) {
    res.statusCode = 405;
    res.setHeader('Allow', [...METHODS].join(', '));
    res.end();
    return;
  }
  if (Number(req.headers['content-length']) > BODY_LIMIT) {
    res.statusCode = 413;
    res.end(JSON.stringify({ code: 413, message: 'Request too large', requestId: id }));
    return;
  }
  // Drop Host, cookies, hop-by-hop headers, caller-supplied forwarding and
  // provider-protection headers. The shared API authenticates bearer tokens.
  const headers = {};
  for (const name of ['authorization', 'content-type', 'accept', 'accept-language']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  headers['accept-encoding'] = 'identity';
  headers['cache-control'] = 'no-store';
  const transport = destination.protocol === 'https:' ? https : http;
  await new Promise(resolve => {
    let completed = false, upstream, response, timer;
    let outcome = 'complete';
    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      req.removeListener('aborted', disconnected);
      req.removeListener('data', countBody);
      log({ event: 'api_proxy', requestId: id, method: req.method,
        // Resource only: never log query strings, IDs, credentials or bodies.
        resource: ['articles', 'events', 'captcha', 'login', 'login-email', 'register', 'register-verify', 'statistics', 'users', 'oauth'].includes(destination.pathname.split('/v1/')[1]?.split('/')[0]) ? destination.pathname.split('/v1/')[1].split('/')[0] : 'other',
        status: res.statusCode, outcome, durationMs: Date.now() - started });
      resolve();
    };
    const fail = (status, reason) => {
      if (completed) return;
      outcome = reason;
      req.unpipe(upstream);
      upstream?.destroy();
      response?.destroy();
      if (!res.headersSent) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ code: status, message: status === 504 ? 'API request timed out' : 'API unavailable', requestId: id }));
      } else res.destroy();
      finish();
    };
    const disconnected = () => fail(499, 'client_disconnected');
    let receivedBody = 0;
    const countBody = chunk => {
      receivedBody += chunk.length;
      if (receivedBody > BODY_LIMIT) fail(413, 'request_too_large');
    };
    res.once('finish', finish);
    res.once('close', () => {
      if (!completed) { outcome = 'client_disconnected'; upstream?.destroy(); response?.destroy(); finish(); }
    });
    req.once('aborted', disconnected);
    timer = setTimeout(() => fail(504, 'deadline'), timeoutMs);
    upstream = transport.request(destination, { method: req.method, headers, agent: false }, incoming => {
      response = incoming;
      // Do not follow redirects with a bearer token, or let a private-origin
      // Location escape onto the public site.
      if ((incoming.statusCode ?? 502) >= 300 && (incoming.statusCode ?? 502) < 400) return fail(502, 'upstream_redirect');
      res.statusCode = incoming.statusCode ?? 502;
      for (const name of ['content-type', 'content-disposition', 'allow', 'www-authenticate', 'retry-after']) {
        if (incoming.headers[name]) res.setHeader(name, incoming.headers[name]);
      }
      const streaming = String(incoming.headers['content-type']).includes('text/event-stream');
      if (streaming) {
        clearTimeout(timer);
        timer = setTimeout(() => fail(504, 'stream_deadline'), Math.max(1, (options.streamTimeoutMs ?? 55000) - (Date.now() - started)));
      }
      let bytes = 0;
      incoming.on('data', chunk => { bytes += chunk.length; if (!streaming && bytes > RESPONSE_LIMIT) fail(502, 'response_too_large'); });
      incoming.once('error', () => fail(502, 'upstream_body_error'));
      incoming.pipe(res);
    });
    upstream.once('error', () => fail(502, 'upstream_connection_error'));
    req.on('data', countBody);
    req.pipe(upstream);
  });
}
