#!/usr/bin/env python3
"""Launch the APD visualizer locally. Python standard library only."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from socketserver import TCPServer
import threading
import webbrowser


class LocalHTTPServer(ThreadingHTTPServer):
    def server_bind(self):
        # The numeric loopback address needs no reverse DNS lookup. Avoid the
        # HTTPServer default, which can delay startup on offline or CI hosts.
        TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=0, help='Local port; default picks a free port')
    parser.add_argument('--no-browser', action='store_true', help='Print the URL without opening a browser')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent / 'dist'
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    server = LocalHTTPServer(('127.0.0.1', args.port), handler)
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'APD Visualizer: {url}', flush=True)
    print('Press Ctrl+C to stop. All calculations run in your browser.', flush=True)
    if not args.no_browser:
        threading.Timer(0.25, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
