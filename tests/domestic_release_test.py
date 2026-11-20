"""Exercise the archive trust boundary before a CI key can publish a release."""
import importlib.util
import io
import hashlib
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from subprocess import CompletedProcess

SPEC = importlib.util.spec_from_file_location('release', Path(__file__).resolve().parents[1] / 'deploy/domestic/ci-release.py')
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
SHA = 'a' * 40


class ArtifactSecurity(unittest.TestCase):
    def archive(self, root, extra=None, revision=SHA):
        archive = root / 'bundle.tar.gz'
        with tarfile.open(archive, 'w:gz') as output:
            for name, value in {'.release-sha': revision.encode(), '.ci-bin/kaisource-api': b'\x7fELFtest', 'src/hello.txt': b'hello'}.items():
                item = tarfile.TarInfo(name)
                item.size = len(value)
                output.addfile(item, io.BytesIO(value))
            if extra:
                output.addfile(extra)
        return archive

    def test_valid_artifact_installs_binary_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'release'
            target.mkdir()
            release.extract(self.archive(root), target, SHA)
            self.assertEqual((target / 'src/hello.txt').read_text(), 'hello')
            self.assertEqual((target / 'kaisource-api').read_bytes(), b'\x7fELFtest')
            self.assertEqual((target / 'kaisource-api').stat().st_mode & 0o777, 0o750)

    def test_rejects_path_escape_symlink_and_environment_injection(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE),
                           ('src/link', tarfile.SYMTYPE), ('src/hardlink', tarfile.LNKTYPE),
                           ('.env.production', tarfile.REGTYPE), ('node_modules/hook', tarfile.REGTYPE),
                           ('.vercel/project.json', tarfile.REGTYPE), ('.git/config', tarfile.REGTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                target = root / 'release'
                target.mkdir()
                item = tarfile.TarInfo(name)
                item.type = kind
                item.linkname = '/etc/kaisource/backend.env'
                with self.assertRaises(RuntimeError):
                    release.extract(self.archive(root, item), target, SHA)
                self.assertEqual(list(target.iterdir()), [])

    def test_wrong_revision_never_installs_the_api_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'release'
            target.mkdir()
            with self.assertRaisesRegex(RuntimeError, 'revision mismatch'):
                release.extract(self.archive(root, revision='b' * 40), target, SHA)
            self.assertFalse((target / 'kaisource-api').exists())


class NginxCutover(unittest.TestCase):
    def test_old_worker_response_is_allowed_until_new_revision_arrives(self):
        responses = [CompletedProcess([], 22, b'', b'404'),
                     CompletedProcess([], 0, b'{"revision":"previous"}'),
                     CompletedProcess([], 0, ('{"revision":"' + SHA + '"}').encode())]
        with patch.object(release.subprocess, 'run', side_effect=responses) as request, patch.object(release.time, 'sleep'):
            release.public_revision(SHA)
            self.assertEqual(request.call_count, 3)

    def test_a_persistent_old_revision_still_fails(self):
        with patch.object(release.subprocess, 'run', return_value=CompletedProcess([], 0, b'{"revision":"previous"}')), patch.object(release.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'not serving'):
                release.public_revision(SHA)


class SignedArtifactDownload(unittest.TestCase):
    URL = 'https://productionresultssa8.blob.core.windows.net/actions-results/example/artifact.zip?signature=temporary'

    def bundle(self, name='kaisource-release.tar.gz'):
        result = io.BytesIO()
        with zipfile.ZipFile(result, 'w') as archive:
            archive.writestr(name, b'archive contents')
        return result.getvalue()

    def test_untrusted_download_hosts_are_rejected_before_network_access(self):
        for url in ['http://127.0.0.1/x', 'https://productionresultssa8.blob.core.windows.net.evil.test/actions-results/x',
                    'https://user@productionresultssa8.blob.core.windows.net/actions-results/x']:
            with self.subTest(url=url), patch.object(release.urllib.request, 'build_opener') as network:
                with self.assertRaisesRegex(RuntimeError, 'signed artifact storage'):
                    release.fetch_artifact({'url': url, 'digest': 'sha256:' + SHA}, io.BytesIO())
                network.assert_not_called()

    def test_digest_and_zip_member_are_verified_before_source_is_used(self):
        for name, wrong_digest in [('kaisource-release.tar.gz', False), ('../unexpected.tar.gz', False),
                                    ('kaisource-release.tar.gz', True)]:
            data = self.bundle(name)
            response = io.BytesIO(data)
            response.status = 200
            output = io.BytesIO()
            envelope = {'url': self.URL, 'digest': 'sha256:' + ('0' * 64 if wrong_digest else hashlib.sha256(data).hexdigest())}
            with patch.object(release.urllib.request, 'build_opener') as network:
                network.return_value.open.return_value = response
                if name == 'kaisource-release.tar.gz' and not wrong_digest:
                    release.fetch_artifact(envelope, output)
                    self.assertEqual(output.getvalue(), b'archive contents')
                else:
                    with self.assertRaises(RuntimeError):
                        release.fetch_artifact(envelope, output)
                    self.assertEqual(output.getvalue(), b'')


if __name__ == '__main__':
    unittest.main()
