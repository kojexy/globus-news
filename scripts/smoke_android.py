"""Real Android emulator smoke test, without app instrumentation dependencies."""
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

OUT=Path('work/android-smoke')
OUT.mkdir(parents=True,exist_ok=True)

def adb(*args):
    return subprocess.check_output(['adb',*args],text=True).strip()

def snapshot(name):
    for attempt in range(4):
        try:
            adb('shell','uiautomator','dump','/sdcard/globus-window.xml')
            xml=adb('shell','cat','/sdcard/globus-window.xml')
            root=ET.fromstring(xml)
            text='\n'.join(n.attrib.get('text','')+' '+n.attrib.get('content-desc','') for n in root.iter())
            (OUT/f'{name}.xml').write_text(xml)
            with (OUT/f'{name}.png').open('wb') as f: subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)
            return text
        except (subprocess.CalledProcessError,ET.ParseError):
            time.sleep(2)
    raise RuntimeError('Android accessibility snapshot failed')

adb('install','-r','android/app/build/outputs/apk/release/app-release.apk')
adb('shell','am','start','-n','online.globus.news/.MainActivity')
time.sleep(20)
assert adb('shell','pidof','online.globus.news'),'App process did not start'
first=snapshot('01-reader')
assert re.search(r'0?1\s*/\s*\d+',first), 'No first news item in Android WebView: '+first
adb('shell','input','keyevent','22')
time.sleep(2)
second=snapshot('02-next-news')
assert re.search(r'0?2\s*/\s*\d+',second),'D-pad right did not change the news: '+second
adb('shell','input','keyevent','23')
time.sleep(1)
countries=snapshot('03-countries')
assert 'Откуда читать новости' in countries,'D-pad OK did not open country filters: '+countries
adb('shell','input','keyevent','4')
time.sleep(1)
assert 'Откуда читать новости' not in snapshot('04-back'),'Back did not close filters'
adb('shell','input','keyevent','82')
time.sleep(1)
assert 'Настройки экрана' in snapshot('05-settings'),'Menu did not open reading settings'
print('PASS: signed APK installs, launches, shows news, responds to D-pad right/OK/Back/Menu.')
