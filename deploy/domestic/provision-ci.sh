#!/usr/bin/env bash
# Run as root after copying this directory into a protected temporary directory.
# This provisions the deployment mechanism; it does not publish application code.
set -euo pipefail
test "$(id -u)" = 0
cd -- "$(dirname -- "$0")"
test -f /etc/kaisource/build.env
test -f /etc/kaisource/media.env
test -f /etc/kaisource/backend.env
install -d -o root -g root -m 0700 /etc/kaisource/releases
install -o root -g root -m 0755 ci-release.py /usr/local/sbin/kaisource-ci-release
install -o root -g root -m 0644 kaisource-web@.service /etc/systemd/system/
install -o root -g root -m 0644 kaisource-api@.service /etc/systemd/system/
if ! id kaisource-deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash kaisource-deploy
fi
install -d -o kaisource-deploy -g kaisource-deploy -m 0700 /home/kaisource-deploy/.ssh
python3 - <<'PY'
from pathlib import Path
import shutil,subprocess,time,os
sudo=Path('/etc/sudoers.d/kaisource-ci')
sudo.write_text('Defaults:kaisource-deploy env_keep += "SSH_ORIGINAL_COMMAND"\nkaisource-deploy ALL=(root) NOPASSWD: /usr/local/sbin/kaisource-ci-release\n')
sudo.chmod(0o440)
subprocess.run(['visudo','-cf',str(sudo)],check=True)
upstreams=Path('/etc/nginx/conf.d/kaisource-upstreams.conf')
if not upstreams.exists():
 backup=Path('/etc/kaisource')/('nginx-before-ci-'+time.strftime('%Y%m%d%H%M%S'))
 backup.mkdir(mode=0o700)
 paths=[Path('/etc/nginx/sites-enabled/kaisource'),Path('/etc/nginx/sites-enabled/kaisource-formal')]
 for p in paths:
  shutil.copy2(p,backup/p.name)
 upstreams.write_text('upstream kaisource_web { server 127.0.0.1:3000; }\nupstream kaisource_api { server 127.0.0.1:8080; }\n')
 try:
  for p in paths:
   text=p.read_text().replace('proxy_pass http://127.0.0.1:3000;', 'proxy_pass http://kaisource_web;').replace('proxy_pass http://127.0.0.1:8080;', 'proxy_pass http://kaisource_api;')
   p.write_text(text)
  subprocess.run(['nginx','-t'],check=True)
  subprocess.run(['systemctl','reload','nginx'],check=True)
 except BaseException:
  for p in paths: shutil.copy2(backup/p.name,p)
  upstreams.unlink()
  subprocess.run(['nginx','-t'],check=True)
  subprocess.run(['systemctl','reload','nginx'],check=True)
  raise
 print('Nginx mechanism provisioned; existing ports unchanged. Backup:',backup)
PY
systemctl daemon-reload
test "$(systemctl show kaisource-web@ci-verify.service -p LoadState --value)" = loaded
test "$(systemctl show kaisource-api@ci-verify.service -p LoadState --value)" = loaded
printf '%s\n' 'CI mechanism ready. Install the dedicated forced-command public key separately.'
