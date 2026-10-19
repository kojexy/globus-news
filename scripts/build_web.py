"""Buildless web distribution shared by GitHub Pages and the Android shell."""
from pathlib import Path
import json
import os
import shutil

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / 'dist'
if target.exists():
    shutil.rmtree(target)
shutil.copytree(ROOT / 'web', target)
(target / '.nojekyll').touch()
config = {'feedUrl': os.environ.get('GLOBUS_FEED_URL', './data/news.json'), 'version': '1.3.1'}
(target / 'runtime.js').write_text('window.GLOBUS_CONFIG = ' + json.dumps(config) + ';\n')
print(f'Built {target}')
