"""Check the distributable HTML and the real localhost launcher."""
import ast
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler
import importlib.util
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.stylesheets = []
        self.inline_scripts = []
        self.current_script = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script':
            self.scripts.append(attrs.get('src'))
            if 'src' not in attrs:
                self.current_script = []
        if tag == 'link' and attrs.get('rel') == 'stylesheet':
            self.stylesheets.append(attrs.get('href'))

    def handle_endtag(self, tag):
        if tag == 'script' and self.current_script is not None:
            self.inline_scripts.append(''.join(self.current_script))
            self.current_script = None

    def handle_data(self, data):
        if self.current_script is not None:
            self.current_script.append(data)


class DistributionTests(unittest.TestCase):
    def test_source_assets_are_present_and_local(self):
        doc = Document()
        doc.feed((ROOT / 'dist/index.html').read_text(encoding='utf-8'))
        self.assertEqual(doc.scripts, ['vendor/plotly.min.js', 'engine.js', 'app.js'])
        self.assertEqual(doc.stylesheets, ['style.css'])
        for asset in doc.scripts + doc.stylesheets:
            self.assertTrue((ROOT / 'dist' / asset).is_file(), asset)

    def test_offline_bundle_preserves_scripts_and_notices(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'APD-Visualizer.html'
            subprocess.run(
                [sys.executable, str(ROOT / 'build_offline.py'), '--output', str(output)],
                cwd=directory, check=True, capture_output=True, text=True,
            )
            html = output.read_text(encoding='utf-8')
            doc = Document()
            doc.feed(html)
            self.assertEqual(doc.scripts, [None, None, None])
            self.assertEqual(doc.stylesheets, [])
            self.assertEqual(len(doc.inline_scripts), 3)
            for filename, script in zip(
                ['vendor/plotly.min.js', 'engine.js', 'app.js'], doc.inline_scripts
            ):
                expected = (ROOT / 'dist' / filename).read_text(encoding='utf-8')
                self.assertEqual(script.strip(), expected.replace('</script', '<\\/script').strip())
            for filename in ['COPYRIGHT.txt', 'dist/vendor/PLOTLY-LICENSE.txt']:
                self.assertIn((ROOT / filename).read_text(encoding='utf-8'), html)
            self.assertIn('ℝ', html)
            self.assertIn('ReLU', html)

    def test_python_sources_parse(self):
        for filename in ['start.py', 'build_offline.py']:
            ast.parse((ROOT / filename).read_text(encoding='utf-8'), filename=filename)

    def test_launcher_serves_correct_assets_from_any_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            process = subprocess.Popen(
                [sys.executable, str(ROOT / 'start.py'), '--no-browser'],
                cwd=directory, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding='utf-8',
            )
            pool = ThreadPoolExecutor(max_workers=1)
            try:
                line = pool.submit(process.stdout.readline).result(timeout=15)
                match = re.search(r'http://127\.0\.0\.1:\d+/', line)
                self.assertIsNotNone(match, line)
                for path, source in [('', 'index.html'), ('engine.js', 'engine.js')]:
                    with urlopen(match.group(0) + path, timeout=10) as response:
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.read(), (ROOT / 'dist' / source).read_bytes())
            finally:
                process.terminate()
                process.communicate(timeout=10)
                pool.shutdown(wait=True, cancel_futures=True)

    def test_launcher_starts_without_reverse_dns(self):
        spec = importlib.util.spec_from_file_location('apd_launcher', ROOT / 'start.py')
        launcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(launcher)
        with patch('socket.gethostbyaddr', side_effect=AssertionError('Unexpected DNS lookup')):
            with launcher.LocalHTTPServer(('127.0.0.1', 0), SimpleHTTPRequestHandler) as server:
                self.assertEqual(server.server_name, '127.0.0.1')
                self.assertGreater(server.server_port, 0)


if __name__ == '__main__':
    unittest.main()
