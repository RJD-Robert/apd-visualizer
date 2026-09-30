#!/usr/bin/env python3
"""Bundle the visualizer into one offline HTML file; no build dependencies."""
import argparse
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent


def build(output):
    """Embed the stylesheet, scripts, and notices using explicit UTF-8 encoding."""
    html = (ROOT / 'dist/index.html').read_text(encoding='utf-8')
    notices = [
        (ROOT / 'COPYRIGHT.txt').read_text(encoding='utf-8'),
        (ROOT / 'dist/vendor/PLOTLY-LICENSE.txt').read_text(encoding='utf-8'),
    ]
    html = html.replace('</head>', '<!--\n' + '\n'.join(notices) + '\n-->\n</head>')
    stylesheet = (ROOT / 'dist/style.css').read_text(encoding='utf-8')
    html, count = re.subn(
        r'<link\s+rel="stylesheet"\s+href="style\.css"\s*/?>',
        lambda _: '<style>\n' + stylesheet + '\n</style>',
        html,
    )
    if count != 1:
        raise ValueError('Expected exactly one local stylesheet in dist/index.html.')

    scripts = []
    for filename in ['vendor/plotly.min.js', 'engine.js', 'app.js']:
        pattern = r'<script\s+src="' + re.escape(filename) + r'"\s+defer\s*>\s*</script>'
        html, count = re.subn(pattern, '', html)
        if count != 1:
            raise ValueError(f'Expected exactly one script tag for {filename}.')
        source = (ROOT / 'dist' / filename).read_text(encoding='utf-8')
        source = source.replace('</script', '<\\/script')
        scripts.append('<script>\n' + source + '\n</script>')

    html = html.replace('</body>', '\n'.join(scripts) + '\n</body>')
    output.write_text(html, encoding='utf-8')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'APD-Visualizer.html')
    args = parser.parse_args()
    output = build(args.output)
    print(f'Created {output} ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
