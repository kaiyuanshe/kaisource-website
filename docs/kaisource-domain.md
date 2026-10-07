# KaiSource domain deployment

## Current international deployment

`kaisource.org` now redirects to the Vercel site at `www.kaisource.org`.
`kaiyuanshe.cn` remains on Azure. Do not apply the historical Azure `.org` DNS
records below to the current international deployment.

The same code selects its default locale at build time: Vercel/preview defaults
to English, standalone/Azure to Chinese. `SITE_DEFAULT_LOCALE` can explicitly
override either choice. All locales stay on the current domain. Next.js
domain-locale routing is not used because it moves visitors to the other
deployment and loses their login session during language switching.

## Historical dual-domain Azure setup (rollback reference only)

The following DNS, Nginx, and certificate examples document the original
same-server deployment. They are retained for rollback reference, not as current
instructions for pointing `kaisource.org` at Azure.

## DNS

Replace the registrar parking records for `kaisource.org` with records that
point to the existing website server:

```text
@    A      143.64.209.59
www  CNAME  kaisource.org.
```

Add an `AAAA` record only when the server has working public IPv6. DNS changes
must be complete before requesting the TLS certificate.

## Nginx

Preserve the request host when proxying to Next.js, including authentication
callbacks and same-origin API requests.

```nginx
upstream kaiyuanshe_frontend {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream kaiyuanshe_api {
    server 127.0.0.1:8080;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name kaiyuanshe.cn www.kaiyuanshe.cn;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://kaiyuanshe.cn$request_uri;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name kaisource.org www.kaisource.org;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://kaisource.org$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name kaiyuanshe.cn www.kaiyuanshe.cn;

    ssl_certificate /etc/letsencrypt/live/kaiyuanshe.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kaiyuanshe.cn/privkey.pem;

    if ($host = www.kaiyuanshe.cn) {
        return 301 https://kaiyuanshe.cn$request_uri;
    }

    location /v1/ {
        proxy_pass http://kaiyuanshe_api/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://kaiyuanshe_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name kaisource.org www.kaisource.org;

    ssl_certificate /etc/letsencrypt/live/kaisource.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kaisource.org/privkey.pem;

    if ($host = www.kaisource.org) {
        return 301 https://kaisource.org$request_uri;
    }

    location /v1/ {
        proxy_pass http://kaiyuanshe_api/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://kaiyuanshe_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Issue a separate certificate for the new domain after DNS resolves to the
website server:

```bash
sudo certbot --nginx -d kaisource.org -d www.kaisource.org
```

Use `NEXT_PUBLIC_API_URL=/v1` in the production environment so both domains
use the same-origin API proxy. Rebuild the frontend after changing any
`NEXT_PUBLIC_*` variable because Next.js embeds those values at build time.

## Authentication

Public pages work on both domains with the configuration above. Login requires
additional provider configuration:

- Add callback or redirect URLs for both domains to GitHub and the configured
  OAuth provider.
- Decide whether login sessions may remain separate per domain. Sharing a
  browser cookie between `.cn` and `.org` is not possible.
- If `NEXTAUTH_URL` remains `https://kaiyuanshe.cn`, NextAuth callbacks can
  return users to the Chinese domain. Use separate deployments or a dynamic
  auth origin strategy if login must stay on `kaisource.org`.

## Verification

After deployment, verify the origin directly and through Nginx:

```bash
curl -sS -H 'Host: kaiyuanshe.cn' http://127.0.0.1:3000/ | grep '<html lang="zh-CN"'
curl -sS -H 'Host: kaisource.org' http://127.0.0.1:3000/ | grep '<html lang="en"'
curl -I https://kaiyuanshe.cn/
curl -I https://kaisource.org/
```
