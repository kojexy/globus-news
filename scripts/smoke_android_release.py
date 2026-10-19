"""Install and exercise the actual signed release through Android instrumentation."""
from pathlib import Path
import subprocess

out=Path('work/android-smoke')
out.mkdir(parents=True,exist_ok=True)
subprocess.run(['adb','install','-r','android/app/build/outputs/apk/release/app-release.apk'],check=True)
subprocess.run(['adb','install','-r','android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk'],check=True)
result=subprocess.run(['adb','shell','am','instrument','-w','online.globus.news.test/androidx.test.runner.AndroidJUnitRunner'],capture_output=True,text=True,check=True)
print(result.stdout)
(out/'instrumentation.txt').write_text(result.stdout+'\n'+result.stderr)
for name in ['01-reader','02-next-news','03-countries','04-settings']:
    subprocess.run(['adb','pull',f'/sdcard/Download/globus-{name}.png',str(out/f'{name}.png')],check=False)
if 'OK (1 test)' not in result.stdout:
    raise RuntimeError('Android release instrumentation failed')
print('PASS: signed APK installs, launches, lays out news and responds to D-pad right/OK/Back/Menu.')
