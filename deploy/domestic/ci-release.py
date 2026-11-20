#!/usr/bin/python3
"""Restricted SSH entry point. Accepts a source artifact; never accepts a shell."""
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import traceback
import urllib.error
import urllib.request

BASE = Path('/srv/kaisource')
CONFIG = Path('/etc/kaisource')
STATE = CONFIG / 'deployment.json'
UPSTREAMS = Path('/etc/nginx/conf.d/kaisource-upstreams.conf')


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def atomic(path, content, mode=0o600):
    temporary = path.with_name(path.name + '.new')
    temporary.write_text(content)
    temporary.chmod(mode)
    os.replace(temporary, path)


def pointer(target):
    temporary = BASE / 'current.new'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, BASE / 'current')


def request(url, expected=200, method='GET'):
    req = urllib.request.Request(url, method=method, headers={'Host': 'kaiyuanshe.cn'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status, body = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read()
    if status != expected:
        raise RuntimeError('Health request failed: ' + str(status))
    return body


def healthy(web, api, revision):
    for _ in range(45):
        try:
            front = json.loads(request(f'http://127.0.0.1:{web}/api/health'))
            back = json.loads(request(f'http://127.0.0.1:{api}/healthz'))
            if front.get('revision') != revision or back.get('revision') != revision:
                raise RuntimeError('Running revision mismatch')
            request(f'http://127.0.0.1:{web}/')
            request(f'http://127.0.0.1:{web}/login')
            request(f'http://127.0.0.1:{web}/api/cloudinary/cloudinary-sign', 401, 'POST')
            for locale in ['zh-CN', 'en']:
                request(f'http://127.0.0.1:{api}/v1/articles?locale={locale}&page=1&page_size=1')
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError('Candidate startup/health failed; production has not been accepted')


def public_revision(revision):
    raw = subprocess.check_output([
        'curl', '--fail', '--silent', '--show-error', '--max-time', '15',
        '--resolve', 'kaiyuanshe.cn:443:127.0.0.1',
        'https://kaiyuanshe.cn/api/health',
    ])
    if json.loads(raw).get('revision') != revision:
        raise RuntimeError('Nginx is not serving the requested revision')


def extract(archive, destination, revision):
    with tarfile.open(archive, 'r:gz') as bundle:
        members = bundle.getmembers()
        total = 0
        for item in members:
            path = PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or not path.parts:
                raise RuntimeError('Invalid archive path')
            if not item.isfile() and not item.isdir():
                raise RuntimeError('Links and special files are prohibited')
            if any(part in {'.git', 'node_modules', '.next', '.vercel'} for part in path.parts):
                raise RuntimeError('Build state must not be supplied by the uploader')
            if any(part.startswith('.env') and part != '.env.example' for part in path.parts):
                raise RuntimeError('Environment files must remain on the server')
            total += item.size
        if total > 600 * 1024 * 1024:
            raise RuntimeError('Artifact too large')
        for item in members:
            target = destination / item.name
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(item) as source, target.open('wb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o750 if item.mode & 0o111 else 0o640)
    if (destination / '.release-sha').read_text().strip() != revision:
        raise RuntimeError('Artifact revision mismatch')
    binary = destination / '.ci-bin/kaisource-api'
    if not binary.is_file() or binary.read_bytes()[:4] != b'\x7fELF':
        raise RuntimeError('Linux backend artifact missing')
    shutil.move(str(binary), str(destination / 'kaisource-api'))
    (destination / 'kaisource-api').chmod(0o750)


def deploy(revision):
    previous = json.loads(STATE.read_text()) if STATE.exists() else {
        'revision': 'legacy', 'slot': 'legacy', 'release': str((BASE / 'current').resolve()),
        'web': 3000, 'api': 8080, 'units': ['kaisource-web.service', 'kaisource-api.service'],
    }
    if previous['revision'] == revision:
        # Consume stdin so an uploader never observes a broken pipe on retries.
        shutil.copyfileobj(sys.stdin.buffer, open(os.devnull, 'wb'))
        healthy(previous['web'], previous['api'], revision)
        public_revision(revision)
        print(json.dumps({'result': 'already-current', 'revision': revision}))
        return
    slot = 'green' if previous['slot'] == 'blue' else 'blue'
    web, api = (3001, 8081) if slot == 'blue' else (3002, 8082)
    release = BASE / 'releases' / revision
    # Never overwrite a version that might still be used by an operator.
    if release.exists():
        raise RuntimeError('Candidate directory already exists; inspect the failed release before retrying')
    units = [f'kaisource-api@{revision}.service', f'kaisource-web@{revision}.service']
    upstream_before = UPSTREAMS.read_text()
    switched = False
    accepted = False
    try:
        with tempfile.NamedTemporaryFile(dir='/var/tmp', prefix='kaisource-ci-', suffix='.tar.gz') as archive:
            size = 0
            while chunk := sys.stdin.buffer.read(1024 * 1024):
                size += len(chunk)
                if size > 256 * 1024 * 1024:
                    raise RuntimeError('Compressed artifact too large')
                archive.write(chunk)
            archive.flush()
            release.mkdir(mode=0o750)
            extract(archive.name, release, revision)
        run(['chown', '-R', 'kaisource:kaisource', str(release)])
        atomic(CONFIG / 'releases' / f'{revision}.env',
               f'WEB_PORT={web}\nKAISOURCE_SERVER_PORT={api}\n'
               f'KAISOURCE_SERVER_HOST=127.0.0.1\nKAISOURCE_RELEASE_SHA={revision}\n'
               'KAISOURCE_SCHEDULER_ENABLED=false\nKAISOURCE_CRON_ENABLED=false\n')
        build = [
            'systemd-run', '--quiet', '--wait', '--pipe', '--collect', '--service-type=exec',
            '--uid=kaisource', '--working-directory=' + str(release),
            '--property=EnvironmentFile=/etc/kaisource/build.env',
            '--setenv=PATH=/opt/kaisource-node/bin:/usr/bin:/bin',
            '--setenv=NEXT_TELEMETRY_DISABLED=1', '--setenv=NODE_OPTIONS=--max-old-space-size=1536',
        ]
        # Build env is provisioned locally. Runtime secrets never enter npm/build.
        run(build + ['/opt/kaisource-node/bin/npm', 'ci', '--legacy-peer-deps', '--include=dev', '--no-audit', '--no-fund'])
        run(build + ['--setenv=NODE_ENV=production', '/opt/kaisource-node/bin/npm', 'run', 'build'])
        if not (release / '.next/BUILD_ID').is_file():
            raise RuntimeError('Frontend build output missing')
        run(['systemctl', 'start', *units])
        healthy(web, api, revision)
        atomic(UPSTREAMS,
               f'upstream kaisource_web {{ server 127.0.0.1:{web}; }}\n'
               f'upstream kaisource_api {{ server 127.0.0.1:{api}; }}\n', 0o644)
        run(['nginx', '-t'])
        pointer(release)
        # Set before reload: even a partially successful reload must roll back.
        switched = True
        nginx_pid = subprocess.check_output(['systemctl', 'show', 'nginx', '-p', 'MainPID', '--value'], text=True).strip()
        workers = Path(f'/proc/{nginx_pid}/task/{nginx_pid}/children').read_text().split()
        run(['systemctl', 'reload', 'nginx'])
        public_revision(revision)
        healthy(web, api, revision)
        next_state = {'revision': revision, 'slot': slot, 'release': str(release),
                      'web': web, 'api': api, 'units': units, 'previous': previous}
        # Only one previous state is necessary; avoid an ever-growing history.
        next_state['previous'].pop('previous', None)
        run(['systemctl', 'enable', *units], stdout=subprocess.DEVNULL)
        atomic(STATE, json.dumps(next_state, indent=2) + '\n')
        accepted = True
        # Preserve old processes until old Nginx workers finish in-flight requests.
        for _ in range(45):
            if not any(Path('/proc/' + pid).exists() for pid in workers):
                subprocess.run(['systemctl', 'disable', *previous['units']], check=False, stdout=subprocess.DEVNULL)
                subprocess.run(['systemctl', 'stop', *previous['units']], check=False)
                break
            time.sleep(2)
        else:
            print('Old Nginx connections still draining; previous application processes retained.')
        print(json.dumps({'result': 'deployed', 'revision': revision, 'slot': slot,
                          'previousRevision': previous['revision'], 'checks': 'passed'}))
    except BaseException:
        if not accepted:
            if switched:
                run(['systemctl', 'start', *previous['units']])
                atomic(UPSTREAMS, upstream_before, 0o644)
                pointer(previous['release'])
                run(['nginx', '-t'])
                run(['systemctl', 'reload', 'nginx'])
            else:
                atomic(UPSTREAMS, upstream_before, 0o644)
            subprocess.run(['systemctl', 'stop', *units], check=False)
            subprocess.run(['systemctl', 'disable', *units], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # This candidate was never accepted. Preserve a separate failure log,
            # but free its directory so an exact retry can build it again.
            if release.exists():
                shutil.rmtree(release)
            print(json.dumps({'result': 'failed', 'productionRetained': previous['revision']}), file=sys.stderr)
        raise


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Restricted entry point requires root')
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
    if command == 'status':
        print(STATE.read_text() if STATE.exists() else '{"revision":"legacy"}')
        return
    match = re.fullmatch(r'deploy ([a-f0-9]{40})', command)
    if not match:
        raise RuntimeError('Only deploy <full commit SHA> or status is permitted')
    with open('/run/lock/kaisource-deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        deploy(match[1])


if __name__ == '__main__':
    try:
        main()
    except Exception:
        log = os.open('/var/log/kaisource-ci-release.log', os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(log, 'a') as output:
            output.write(time.strftime('%Y-%m-%dT%H:%M:%S%z') + '\n')
            traceback.print_exc(file=output)
        # Provider and application output may contain sensitive diagnostics.
        # Inspect protected journal logs on the host for the detailed cause.
        print('Deployment failed. Production was preserved or restored; inspect server diagnostics.', file=sys.stderr)
        sys.exit(1)
