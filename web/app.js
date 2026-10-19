import {COUNTRIES, DEFAULTS, normalizeSettings, validateFeed, createQueue, moveIndex, ageLabel, safeUrl} from './core.mjs';
const $=id=>document.getElementById(id);
// Preserve the installed app's country filter and cached edition across the rename.
const SETTINGS_KEY='globus.settings.v1',CACHE_KEY='globus.edition.v1',LAST_KEY='globus.last.v1';
const storage={get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}};
let settings=normalizeSettings(storage.get(SETTINGS_KEY)||DEFAULTS),feed=null,queue=[],index=0,pages=[],page=0;
let overlay=null,draftCountries=[],busy=false,offline=false,layoutFrame=0,reading=false,pendingFeed=null,lastFetch=0;
const current=()=>queue[index],countryInfo=code=>COUNTRIES.find(c=>c.code===code);
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
function applySettings(){
  document.body.dataset.theme=settings.theme;document.body.dataset.width=settings.contentWidth;
  const base=Math.max(16,Math.min(26,innerWidth*.0135)),copy=base*settings.textScale/100;
  document.body.style.setProperty('--copy',`${copy}px`);
  document.body.style.setProperty('--title',`${Math.max(25,Math.min(49,innerWidth*.026))*Math.sqrt(settings.textScale/100)}px`);
  document.body.style.setProperty('--leading',settings.lineHeight);
  $('fontScale').value=settings.textScale;$('fontValue').textContent=`${settings.textScale}% · ${Math.round(copy)} px`;
  $('countryCount').textContent=settings.countries.length;
  $('filterLabel').textContent=settings.countries.length===COUNTRIES.length?'ВЕСЬ МИР':settings.countries.map(c=>countryInfo(c).name).join(' · ').toUpperCase();
  for(const b of document.querySelectorAll('[data-scale]'))b.setAttribute('aria-pressed',String(Number(b.dataset.scale)===settings.textScale));
  for(const b of document.querySelectorAll('[data-leading]'))b.setAttribute('aria-pressed',String(Number(b.dataset.leading)===settings.lineHeight));
  for(const b of document.querySelectorAll('[data-width]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.width===settings.contentWidth));
  for(const b of document.querySelectorAll('[data-theme]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.theme===settings.theme));
  for(const b of document.querySelectorAll('[data-translation]'))b.setAttribute('aria-pressed',String((b.dataset.translation==='true')===settings.autoTranslate));
}
function saveSettings(){settings=normalizeSettings(settings);if(!storage.set(SETTINGS_KEY,settings))toast('Не удалось сохранить настройки в этом браузере.');applySettings();}
function updateStatus(){
  if(!feed)return;
  $('edition').textContent=`Выпуск ${new Date(feed.generatedAt).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}`;
  const messages=[];
  if(offline)messages.push('Нет связи. Показан сохранённый выпуск.');
  if(Date.now()-Date.parse(feed.generatedAt)>6*3600_000)messages.push('Выпуск старше 6 часов. Обновление пока не получено.');
  const missing=feed.sources.filter(s=>s.status!=='ok'&&settings.countries.includes(s.country));
  if(missing.length)messages.push(`Недоступны или из кеша: ${missing.map(s=>s.name).join(', ')}.`);
  if(pendingFeed)messages.push('Свежий выпуск готов и появится при возвращении к ленте.');
  $('notice').textContent=messages.join(' ');$('notice').hidden=!messages.length;
  $('updateInfo').textContent=`Обновление через интернет каждые 10 минут. Новые выпуски собираются каждые 3 часа, ежедневно. Последний выпуск: ${new Date(feed.generatedAt).toLocaleString('ru-RU')}. Расписание GitHub иногда задерживается.`;
}
function rebuildQueue(preserve=true){const id=preserve?(current()?.id||storage.get(LAST_KEY)):null;queue=createQueue(feed?.articles||[],settings.countries);index=Math.max(0,queue.findIndex(a=>a.id===id));render();}
function hasFull(a=current()){return Boolean(a&&(settings.autoTranslate?a.fullText||a.originalFullText:a.originalFullText||a.fullText));}
function storyContent(){
  const a=current();if(!a)return '';
  if(reading&&hasFull(a))return settings.autoTranslate?(a.fullText||a.originalFullText):(a.originalFullText||a.fullText);
  const summary=settings.autoTranslate?a.text:(a.originalText||a.text);
  if(reading){
    const reason=a.fullStatus==='restricted'?'Редакция ограничила доступ к полному тексту.':'Полный текст этой статьи пока недоступен в приложении.';
    return `${reason}\n\n${summary||'Доступен только заголовок.'}\n\nОригинал можно открыть через OK → «Оригинал и источник».`;
  }
  return summary||'Редакция передала только заголовок. Нажмите OK, чтобы открыть заметку и проверить полный текст.';
}
function render(preservePage=false){
  const a=current();if(!preservePage)page=0;pages=[];
  document.body.dataset.mode=reading?'reading':'overview';
  $('article').hidden=!a;$('emptyState').hidden=Boolean(a);
  for(const id of ['nextButton','previousButton','sourceButton','readButton','sideReadButton'])$(id).disabled=!a;
  $('backButton').hidden=!reading;$('readButton').hidden=reading;
  $('nextLabel').textContent=reading?'Дальше':'Следующая';
  $('nextButton').setAttribute('aria-label',reading?'Следующая страница':'Следующая новость');
  $('previousButton').setAttribute('aria-label',reading?'Предыдущая страница':'Предыдущая новость');
  $('remoteHint').textContent=reading?'← → Страницы · OK Меню · Назад В ленту':'← → Новости · OK Читать · ↑ Меню';
  updateStatus();if(!a){$('progress').style.width='0';return;}
  storage.set(LAST_KEY,a.id);
  const c=countryInfo(a.country),flag=document.createElement('span');flag.className='flag';flag.textContent=c.flag;flag.setAttribute('aria-hidden','true');$('country').replaceChildren(flag,document.createTextNode(c.name));
  $('position').textContent=`${String(index+1).padStart(2,'0')} / ${queue.length}`;
  $('storyCategory').textContent=reading?`${a.source} · ${ageLabel(a.publishedAt)}`:a.country==='RU'?'РОССИЙСКИЕ РЕДАКЦИИ':'ВЗГЛЯД ИЗ ДРУГОЙ СТРАНЫ';
  $('headline').textContent=settings.autoTranslate?a.title:(a.originalTitle||a.title);$('headline').style.fontSize='';
  $('headline').lang=settings.autoTranslate?'ru':a.language||'ru';
  $('sourceName').textContent=a.source;$('sourceKind').textContent=a.sourceKind||'';$('publishedAt').textContent=ageLabel(a.publishedAt);$('publishedAt').dateTime=a.publishedAt||'';
  const translation=reading&&hasFull(a)?(a.fullTranslation||a.translation):a.translation;
  $('translationLabel').textContent=!settings.autoTranslate&&a.language!=='ru'?'Оригинал · перевод выключен':translation==='argos'?'Автоперевод на русский · Argos':translation==='unavailable'?'Перевод недоступен · показан оригинал':'Оригинал на русском';
  $('readingStatus').textContent=reading?(hasFull(a)?a.fullStatus==='excerpt'?'Большой фрагмент статьи':'Текст статьи':'Доступна аннотация'):(hasFull(a)?'Есть текст статьи':'Краткая заметка');
  $('sideReadButton').textContent=hasFull(a)?'Читать целиком · OK':'Открыть заметку · OK';$('readButton').textContent=$('sideReadButton').textContent;
  $('progress').style.width=reading?'0':`${(index+1)/queue.length*100}%`;
  scheduleLayout();
}
function scheduleLayout(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(layoutPages);}
function layoutPages(){
  if(!current()||$('article').hidden)return;
  const saved=page,title=$('headline'),copy=title.parentElement,space=$('textSpace'),text=$('storyText');title.style.fontSize='';
  let size=parseFloat(getComputedStyle(title).fontSize),line=parseFloat(getComputedStyle(text).lineHeight);
  while(size>21&&(title.offsetHeight>copy.clientHeight*.37||space.clientHeight<line*3)){size--;title.style.fontSize=`${size}px`;}
  const content=storyContent(),tokens=content.match(/\S+\s*/g)||[''],result=[];let start=0;
  const height=Math.max(1,space.clientHeight-2);
  while(start<tokens.length){let lo=1,hi=tokens.length-start,fit=0;
    while(lo<=hi){const mid=Math.floor((lo+hi)/2);text.textContent=tokens.slice(start,start+mid).join('').trim();if(text.scrollHeight<=height){fit=mid;lo=mid+1;}else hi=mid-1;}
    fit=Math.max(1,fit);
    if(reading&&start+fit<tokens.length){for(let i=fit;i>fit*.65;i--)if(tokens[start+i-1].includes('\n\n')){fit=i;break;}}
    result.push(tokens.slice(start,start+fit).join('').trim());start+=fit;
  }
  pages=result;page=Math.min(saved,pages.length-1);renderPage();
}
function renderPage(){
  $('storyText').textContent=pages[page]||'';$('pageControls').hidden=pages.length<2;$('pageNumber').textContent=`${page+1} / ${pages.length}`;
  $('previousPage').disabled=page===0;$('nextPage').disabled=page>=pages.length-1;
  if(reading){$('readingStatus').textContent=`${hasFull()?current().fullStatus==='excerpt'?'Фрагмент статьи':'Текст статьи':'Краткая заметка'} · страница ${page+1} из ${pages.length}`;$('progress').style.width=`${(page+1)/pages.length*100}%`;}
}
function changePage(delta){const next=Math.max(0,Math.min(pages.length-1,page+delta));if(next!==page){page=next;renderPage();}else toast(delta>0?'Конец статьи. Назад — вернуться к новостям.':'Начало статьи.');}
function openReading(){if(!current())return;reading=true;closeDialog();render();$('reader').focus();}
function applyPending(){if(!pendingFeed)return;const id=current()?.id;feed=pendingFeed;pendingFeed=null;queue=createQueue(feed.articles,settings.countries);index=Math.max(0,queue.findIndex(a=>a.id===id));}
function exitReading(){if(!reading)return false;reading=false;applyPending();render();$('reader').focus();return true;}
function navigate(delta){if(!queue.length&&!pendingFeed)return;reading=false;applyPending();index=moveIndex(index,delta,queue.length);render();$('reader').focus();}
function showDialog(id){if(overlay)overlay.hidden=true;const panel=$(id);overlay=panel;panel.hidden=false;if(id==='countriesDialog'){draftCountries=[...settings.countries];renderCountries();}if(id==='quickDialog'){$('quickRead').textContent=reading?'Продолжить чтение':'Читать новость · OK';$('quickBack').hidden=!reading;}requestAnimationFrame(()=>{if(overlay===panel)(id==='quickDialog'?$('quickRead'):panel.querySelector('button:not(:disabled),input'))?.focus();});}
function closeDialog(){if(!overlay)return false;overlay.hidden=true;overlay=null;$('reader').focus();scheduleLayout();return true;}
function toggleMenu(){if(overlay?.id==='quickDialog')closeDialog();else showDialog('quickDialog');}
function renderCountries(){const focused=document.activeElement?.dataset.country;$('countryOptions').replaceChildren(...COUNTRIES.map(c=>{const button=document.createElement('button');button.className='country-option';button.dataset.country=c.code;button.setAttribute('aria-pressed',String(draftCountries.includes(c.code)));const name=document.createElement('span');name.textContent=`${c.flag}  ${c.name}`;const check=document.createElement('span');check.className='check';check.textContent=draftCountries.includes(c.code)?'✓':'';button.append(name,check);button.onclick=()=>{if(draftCountries.includes(c.code)){if(draftCountries.length===1){toast('Оставьте хотя бы одну страну.');return;}draftCountries=draftCountries.filter(x=>x!==c.code);}else draftCountries.push(c.code);renderCountries();};return button;}));if(focused)$('countryOptions').querySelector(`[data-country="${focused}"]`)?.focus();}
function showSource(){const a=current();if(!a)return;$('sourceTitle').textContent=a.source;$('sourceDetails').textContent=`${countryInfo(a.country).name} · ${a.sourceKind||'Редакция'} · ${ageLabel(a.publishedAt)}`;$('originalTitle').textContent=a.originalTitle||a.title;$('originalTitle').lang=a.language||'ru';$('sourceDisclaimer').textContent=hasFull(a)?'В режиме чтения показан доступный текст статьи с сайта редакции. Подписки не обходятся.':'Доступна аннотация редакции. Полный текст может быть недоступен или требовать подписку.';const url=safeUrl(a.url);if(url)$('originalLink').href=url;else $('originalLink').removeAttribute('href');$('originalLink').target=location.hostname==='app.globus.local'?'_self':'_blank';showDialog('sourceDialog');}
async function loadFeed(manual=false){if(busy)return;busy=true;$('refreshButton').disabled=true;$('retryButton').disabled=true;if(manual)toast('Проверяем свежий выпуск…');try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);let response;try{response=await fetch(window.GLOBUS_CONFIG?.feedUrl||'./data/news.json',{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}if(!response.ok)throw new Error(`HTTP ${response.status}`);const fresh=validateFeed(await response.json());if(!fresh.articles.length||Date.parse(fresh.generatedAt)>Date.now()+2*3600_000)throw new Error('Недействительный выпуск');offline=response.headers.get('X-Globus-Offline')==='1'||navigator.onLine===false;lastFetch=Date.now();storage.set(CACHE_KEY,fresh);
    if(feed&&fresh.generatedAt===feed.generatedAt){updateStatus();scheduleLayout();}
    else if(feed&&current()&&(reading||!manual)){pendingFeed=fresh;updateStatus();scheduleLayout();}
    else{feed=fresh;pendingFeed=null;rebuildQueue(true);}
    if(manual)toast(reading&&pendingFeed?'Новый выпуск готов. Текущая статья останется открытой.':'Выпуск обновлён.');
  }catch{offline=true;if(!feed){try{const r=await fetch('./data/news.json');if(r.ok)feed=validateFeed(await r.json());}catch{}}if(feed){if(!current())rebuildQueue(true);updateStatus();scheduleLayout();if(manual)toast('Нет связи. Оставлен сохранённый выпуск.');}else{queue=[];render();$('edition').textContent='Нет связи';$('emptyExplanation').textContent='Первый выпуск не загрузился. Подключите интернет и нажмите «Обновить».';}}finally{busy=false;$('refreshButton').disabled=false;$('retryButton').disabled=false;}}
function controls(panel=overlay){return [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')].filter(e=>e.getClientRects().length);}
function spatialFocus(key){const active=document.activeElement,origin=active?.getBoundingClientRect(),elements=controls();if(!origin||!overlay.contains(active)){elements[0]?.focus();return;}const x=origin.x+origin.width/2,y=origin.y+origin.height/2,h=key==='ArrowLeft'||key==='ArrowRight',p=key==='ArrowRight'||key==='ArrowDown';const choices=elements.filter(e=>e!==active).map(e=>{const r=e.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y,along=h?dx:dy,across=h?Math.max(0,r.top-origin.bottom,origin.top-r.bottom):Math.max(0,r.left-origin.right,origin.left-r.right),gap=h?Math.max(0,p?r.left-origin.right:origin.left-r.right):Math.max(0,p?r.top-origin.bottom:origin.top-r.bottom);return{e,along,score:gap+across*4+Math.abs(along)*.02};}).filter(c=>p?c.along>4:c.along< -4).sort((a,b)=>a.score-b.score);choices[0]?.e.focus();}
function back(){return closeDialog()||exitReading();}
function handleKey(key,event){
  if(overlay){if(['Escape','BrowserBack','Backspace'].includes(key)){event?.preventDefault();back();return;}if(key.startsWith('Arrow')){event?.preventDefault();const active=document.activeElement;if(active===$('fontScale')&&['ArrowLeft','ArrowRight'].includes(key)){setScale(settings.textScale+(key==='ArrowRight'?5:-5));}else spatialFocus(key);return;}if(key==='Tab'){const list=controls();if(event.shiftKey&&document.activeElement===list[0]){event.preventDefault();list[list.length-1]?.focus();}else if(!event.shiftKey&&document.activeElement===list[list.length-1]){event.preventDefault();list[0]?.focus();}}return;}
  if(['ArrowLeft','ArrowRight'].includes(key)){event?.preventDefault();reading?changePage(key==='ArrowRight'?1:-1):navigate(key==='ArrowRight'?1:-1);}
  else if(['ArrowUp','ArrowDown'].includes(key)){event?.preventDefault();if(reading)changePage(key==='ArrowDown'?1:-1);else showDialog('quickDialog');}
  else if(key==='Enter'&&(document.activeElement===$('reader')||document.activeElement===document.body)){event?.preventDefault();reading?showDialog('quickDialog'):openReading();}
  else if(['Escape','BrowserBack','Backspace'].includes(key)){event?.preventDefault();back();}
  else if(key.toLowerCase()==='s'){event?.preventDefault();showDialog('settingsDialog');}
  else if(key.toLowerCase()==='f'){event?.preventDefault();toggleFullscreen();}
  else if(key.toLowerCase()==='c'){event?.preventDefault();showDialog('countriesDialog');}
}
document.addEventListener('keydown',e=>handleKey(e.key,e));
window.globusBack=back;window.globusToggleMenu=toggleMenu;
window.globusRemoteKey=key=>{if(key==='Enter'){if(overlay){const active=document.activeElement;if(active&&['BUTTON','A'].includes(active.tagName))active.click();}else reading?showDialog('quickDialog'):openReading();}else handleKey(key);};
window.globusResume=()=>{if(Date.now()-lastFetch>300000)loadFeed();};
async function toggleFullscreen(){try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen();}catch{toast('Полный экран недоступен в этом браузере.');}}
function setScale(value){settings.textScale=value;saveSettings();scheduleLayout();}
$('countriesButton').onclick=()=>showDialog('countriesDialog');$('emptyCountries').onclick=()=>showDialog('countriesDialog');$('settingsButton').onclick=()=>showDialog('settingsDialog');$('menuButton').onclick=toggleMenu;$('sourceButton').onclick=showSource;$('sideReadButton').onclick=openReading;$('readButton').onclick=openReading;$('backButton').onclick=exitReading;
$('allCountries').onclick=()=>{draftCountries=COUNTRIES.map(c=>c.code);renderCountries();};$('russiaOnly').onclick=()=>{draftCountries=['RU'];renderCountries();};$('applyCountries').onclick=()=>{settings.countries=draftCountries;saveSettings();reading=false;closeDialog();applyPending();rebuildQueue(false);};
$('menuSettings').onclick=()=>showDialog('settingsDialog');$('menuSource').onclick=showSource;
$('quickRead').onclick=()=>{if(reading)closeDialog();else openReading();};$('quickCountries').onclick=()=>showDialog('countriesDialog');$('quickSettings').onclick=()=>showDialog('settingsDialog');$('quickSource').onclick=showSource;$('quickBack').onclick=()=>{closeDialog();exitReading();};$('quickRefresh').onclick=()=>loadFeed(true);
$('previousButton').onclick=()=>reading?changePage(-1):navigate(-1);$('nextButton').onclick=()=>reading?changePage(1):navigate(1);$('previousPage').onclick=()=>changePage(-1);$('nextPage').onclick=()=>changePage(1);
$('fullscreenButton').onclick=toggleFullscreen;$('refreshButton').onclick=()=>loadFeed(true);$('retryButton').onclick=()=>loadFeed(true);$('fontMinus').onclick=()=>setScale(settings.textScale-5);$('fontPlus').onclick=()=>setScale(settings.textScale+5);$('fontScale').oninput=e=>setScale(Number(e.target.value));
for(const b of document.querySelectorAll('[data-scale]'))b.onclick=()=>setScale(Number(b.dataset.scale));for(const b of document.querySelectorAll('[data-leading]'))b.onclick=()=>{settings.lineHeight=Number(b.dataset.leading);saveSettings();scheduleLayout();};for(const b of document.querySelectorAll('button[data-width]'))b.onclick=()=>{settings.contentWidth=b.dataset.width;saveSettings();scheduleLayout();};for(const b of document.querySelectorAll('button[data-theme]'))b.onclick=()=>{settings.theme=b.dataset.theme;saveSettings();};for(const b of document.querySelectorAll('[data-translation]'))b.onclick=()=>{settings.autoTranslate=b.dataset.translation==='true';saveSettings();render();};
$('resetReading').onclick=()=>{settings.textScale=100;settings.lineHeight=1.5;settings.contentWidth='wide';saveSettings();scheduleLayout();};for(const b of document.querySelectorAll('[data-close]'))b.onclick=closeDialog;for(const panel of document.querySelectorAll('.overlay'))panel.onclick=e=>{if(e.target===panel)closeDialog();};
let touch=null;$('reader').addEventListener('touchstart',e=>{touch={x:e.changedTouches[0].screenX,y:e.changedTouches[0].screenY};},{passive:true});$('reader').addEventListener('touchend',e=>{if(!touch||overlay)return;const dx=e.changedTouches[0].screenX-touch.x,dy=e.changedTouches[0].screenY-touch.y;touch=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5){if(reading)changePage(dx>0?1:-1);else navigate(dx>0?1:-1);}},{passive:true});
window.addEventListener('resize',()=>{applySettings();scheduleLayout();});window.addEventListener('online',()=>loadFeed());window.addEventListener('offline',()=>{offline=true;updateStatus();scheduleLayout();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.globusResume();});
function tick(){$('clock').textContent=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date());if(current())$('publishedAt').textContent=ageLabel(current().publishedAt);updateStatus();}
applySettings();tick();if(location.hostname==='app.globus.local')$('fullscreenButton').hidden=true;
try{const cached=storage.get(CACHE_KEY);if(cached){feed=validateFeed(cached);offline=true;rebuildQueue(true);}}catch{}
async function start(){if(!feed&&location.hostname==='app.globus.local'){try{const r=await fetch('./data/news.json');if(r.ok){feed=validateFeed(await r.json());offline=true;rebuildQueue(true);}}catch{}}loadFeed();}
start();setInterval(tick,60000);setInterval(()=>{if(!document.hidden)loadFeed();},600000);
if('serviceWorker'in navigator&&['http:','https:'].includes(location.protocol)&&location.hostname!=='app.globus.local')navigator.serviceWorker.register('./sw.js').catch(()=>{});
