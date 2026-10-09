import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('parallel backend binds loopback and cannot run a second scheduler or migration', () => {
  const unit = read('deploy/overseas-api/kaisource-api.service.example');
  assert.match(unit, /KAISOURCE_SERVER_HOST=127\.0\.0\.1/);
  assert.match(unit, /KAISOURCE_SERVER_PORT=8081/);
  assert.match(unit, /KAISOURCE_SCHEDULER_ENABLED=false/);
  assert.match(unit, /KAISOURCE_CRON_ENABLED=false/);
  assert.doesNotMatch(unit, /ExecStart=.*-mode (?:migrate|seed)/);
  assert.match(unit, /KAISOURCE_EMAIL_REDIRECTURL=https:\/\/www\.kaisource\.org\/login/);
  assert.match(unit, /KAISOURCE_OAUTH_REDIRECEURL=https:\/\/www\.kaisource\.org\/login/);
});
test('additive proxy namespace preserves paths and never exposes internal cron', () => {
  const nginx = read('deploy/overseas-api/nginx-location.conf.example');
  assert.match(nginx, /location \^~ \/kaisource-api\/v1\//);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8081\/v1\//);
  assert.doesNotMatch(nginx, /location (?:\/v1|\/api|\/ \{)/);
  assert.doesNotMatch(nginx, /proxy_pass.*8080/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr/);
  assert.match(nginx, /Cache-Control "no-store" always/);
});
test('operator timer only prunes authentication state and never collects statistics', () => {
  const unit = read('deploy/overseas-api/kaisource-auth-cleanup.service.example');
  assert.match(unit, /ExecStart=.* -mode cleanup/);
  assert.doesNotMatch(unit, /-mode (?:stats|seed|migrate)/);
  assert.match(read('deploy/overseas-api/kaisource-auth-cleanup.timer.example'), /Unit=kaisource-auth-cleanup.service/);
});
