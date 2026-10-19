import {COUNTRIES,PAPER_STYLES,DEFAULTS,normalizeSettings,validateFeed,createQueue,moveIndex,ageLabel,safeUrl} from './core.mjs';
import {createRadio} from './radio.mjs';
import {cleanArticleText} from './editorial.mjs';
import {paginateArticle} from './typeset.mjs';
const $=id=>document.getElementById(id);
const SETTINGS_KEY='globus.settings.v1',CACHE_KEY='globus.edition.v1',LAST_KEY='globus.last.v1';
const storage={get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}};
let settings=normalizeSettings(storage.get(SETTINGS_KEY)||DEFAULTS),feed=null,queue=[],index=0,pages=[],page=0;
let overlay=null,draftCountries=[],busy=false,offline=false,layoutFrame=0,pendingFeed=null,lastFetch=0,layoutReady=false;
const radio=createRadio($('backgroundRadio'),message=>$('musicStatus').textContent=message);
const current=()=>queue[index],countryInfo=code=>COUNTRIES.find(c=>c.code===code);
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3000);}
function applySettings(){
  document.body.dataset.theme=settings.theme;document.body.dataset.justify=settings.justify?'yes':'no';
  const base=Math.max(14,Math.min(24,innerWidth*.0125)),copy=base*settings.textScale/100;
  document.body.style.setProperty('--copy',`${copy}px`);document.body.style.setProperty('--title',`${Math.max(24,Math.min(43,innerWidth*.025))*Math.sqrt(settings.textScale/100)}px`);document.body.style.setProperty('--leading',settings.lineHeight);
  $('fontScale').value=settings.textScale;$('fontValue').textContent=`${settings.textScale}% · ${Math.round(copy)} px`;
  for(const b of document.querySelectorAll('[data-scale]'))b.setAttribute('aria-pressed',String(Number(b.dataset.scale)===settings.textScale));
  for(const b of document.querySelectorAll('[data-leading]'))b.setAttribute('aria-pressed',String(Number(b.dataset.leading)===settings.lineHeight));
  for(const b of document.querySelectorAll('[data-justify]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String((b.dataset.justify==='true')===settings.justify));
  for(const b of document.querySelectorAll('[data-theme]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.theme===settings.theme));
  for(const b of document.querySelectorAll('[data-translation]'))b.setAttribute('aria-pressed',String((b.dataset.translation==='true')===settings.autoTranslate));
  for(const b of document.querySelectorAll('[data-topic]'))b.setAttribute('aria-pressed',String(b.dataset.topic===settings.topic));
  for(const b of document.querySelectorAll('[data-music]'))b.setAttribute('aria-pressed',String((b.dataset.music==='true')===settings.musicEnabled));
  $('musicVolume').value=settings.musicVolume;$('musicValue').textContent=`${settings.musicVolume}%`;
  $('musicSettingsButton').textContent=`Фоновая классика · ${settings.musicEnabled?'включена':'выключена'}`;
  radio.configure(settings.musicEnabled,settings.musicVolume);
  applyPaperStyle();
}
function applyPaperStyle(){const style=settings.paperStyle==='rotate'?PAPER_STYLES[index%PAPER_STYLES.length].id:settings.paperStyle;document.body.dataset.paper=style;$('reader').dataset.paper=style;for(const b of document.querySelectorAll('[data-paper-choice]'))b.setAttribute('aria-pressed',String(b.dataset.paperChoice===settings.paperStyle));$('rotateStyle').setAttribute('aria-pressed',String(settings.paperStyle==='rotate'));}
function saveSettings(){settings=normalizeSettings(settings);if(!storage.set(SETTINGS_KEY,settings))toast('Настройки не удалось сохранить.');applySettings();}
function hasFull(a=current()){return Boolean(a&&(a.fullText||a.originalFullText));}
function storyContent(){
  const a=current();if(!a)return '';
  let text=hasFull(a)?(settings.autoTranslate?(a.fullText||a.originalFullText):(a.originalFullText||a.fullText)):(settings.autoTranslate?a.text:(a.originalText||a.text));
  if(!text)return 'Редакция передала только заголовок.';
  return cleanArticleText(text,[a.title,a.originalTitle])||'Редакция передала только заголовок.';
}
function updateStatus(){
  if(!feed)return;
  // Routine network state is kept in the menu; only stale data needs a line on paper.
  const stale=Date.now()-Date.parse(feed.generatedAt)>6*3600000;
  const changed=$('notice').hidden===stale;$('notice').hidden=!stale;$('notice').textContent=stale?'Сохранённый выпуск. Свежие новости пока не получены.':'';if(changed&&layoutReady)scheduleLayout();
  const missing=feed.sources.filter(s=>s.status!=='ok'&&settings.countries.includes(s.country));
  $('editionInfo').textContent=`Выпуск: ${new Date(feed.generatedAt).toLocaleString('ru-RU')}. ${offline?'Нет связи, показана сохранённая копия.':'Подключено к интернету.'}${missing.length?' Недоступны: '+missing.map(s=>s.name).join(', ')+'.':''}${pendingFeed?' Новый выпуск готов и появится при следующей новости.':''}`;
  $('updateInfo').textContent='Новые выпуски — каждые 3 часа, каждый день. Проверка обновлений — каждые 10 минут и после восстановления сети. '+$('editionInfo').textContent;
}
function rebuildQueue(preserve=true){const id=preserve?(current()?.id||storage.get(LAST_KEY)):null;queue=createQueue(feed?.articles||[],settings.countries,Date.now(),settings.topic);index=Math.max(0,queue.findIndex(a=>a.id===id));render();}
function render(preservePage=false){
  if(!preservePage)page=0;pages=[];layoutReady=false;
  const a=current();$('article').hidden=!a;$('emptyState').hidden=Boolean(a);$('reader').dataset.newsId=a?.id||'';$('reader').dataset.ready='false';updateStatus();applyPaperStyle();
  if(!a){$('emptyExplanation').textContent=settings.topic==='politics'?'За последние 72 часа для выбранных стран политических новостей не найдено. Измените страны или тематику в меню.':'Выберите страны или обновите выпуск в меню.';$('country').textContent='Новости с Луны';$('sourceLine').textContent='';$('headline').textContent='';$('pageMark').textContent='';return;}
  storage.set(LAST_KEY,a.id);const c=countryInfo(a.country);$('country').textContent=`${c.flag} ${c.name}`;
  const translation=hasFull(a)?a.fullTranslation:a.translation;
  const kind=!hasFull(a)?' · аннотация':a.fullStatus==='excerpt'?' · фрагмент':'';
  const language=settings.autoTranslate&&translation==='argos'?' · перевод':settings.autoTranslate&&translation==='unavailable'?' · оригинал':'';
  $('sourceLine').textContent=`${a.source} · ${ageLabel(a.publishedAt)}${kind}${language}`;
  $('headline').textContent=settings.autoTranslate?a.title:(a.originalTitle||a.title);$('headline').lang=settings.autoTranslate?'ru':a.language||'ru';$('headline').style.fontSize='';scheduleLayout();
}
function scheduleLayout(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(layoutPages);}
const fontReady=Promise.all([
  document.fonts.load('400 24px "PT Serif"'),document.fonts.load('700 24px "PT Serif"'),
  document.fonts.load('italic 400 24px "PT Serif"'),document.fonts.load('600 43px Oswald'),
]).catch(()=>{});
let fontsLoaded=false;fontReady.then(()=>{fontsLoaded=true;if(current())scheduleLayout();});
const measuringCanvas=document.createElement('canvas'),measuringContext=measuringCanvas.getContext('2d');
function layoutPages(){
  if(!fontsLoaded||!current()||$('article').hidden)return;
  const saved=page,title=$('headline'),space=$('textSpace'),left=$('leftText'),right=$('rightText');title.style.fontSize='';
  let size=parseFloat(getComputedStyle(title).fontSize),lineHeight=parseFloat(getComputedStyle(left).lineHeight);
  while(size>18&&(title.offsetHeight>$('article').clientHeight*.23||space.clientHeight<lineHeight*5)){size--;title.style.fontSize=`${size}px`;}
  const style=getComputedStyle(left),fontSize=parseFloat(style.fontSize),fontFamily=style.fontFamily;
  const measure=(text,weight)=>{measuringContext.font=`${weight} ${fontSize}px ${fontFamily}`;return measuringContext.measureText(text).width;};
  pages=paginateArticle(storyContent(),{width:Math.min(left.clientWidth,right.clientWidth),height:space.clientHeight-1,lineHeight,fontSize,paragraphGap:fontSize*.42,measure,justify:settings.justify});
  page=Math.min(saved,pages.length-1);layoutReady=true;renderPage();$('reader').dataset.ready='true';
}
function renderColumn(column,data){
  const fragments=data.chunks.map(chunk=>{const p=document.createElement('p');p.className='copy-paragraph'+(chunk.lead?' lead':'')+(chunk.continuation?' continuation':'');
    for(const row of chunk.lines){const span=document.createElement('span');span.className='copy-line'+(row.justified?' justified':'');span.textContent=row.text;span.dataset.spacing=String(row.justified?row.ratio:1);p.append(span);}return p;});
  column.replaceChildren(...fragments);
}
function renderPage(){
  const p=pages[page];if(!p)return;
  renderColumn($('leftText'),p.left);renderColumn($('rightText'),p.right);
  $('textSpace').dataset.pageIndex=String(page);$('textSpace').dataset.pageCount=String(pages.length);
  // Grid columns stretch to the screen; the rule follows actual copy, including short notes.
  const actual=column=>{const last=column.lastElementChild;return last?last.getBoundingClientRect().bottom-column.getBoundingClientRect().top:0;};
  $('textSpace').style.setProperty('--rule-height',`${Math.min($('textSpace').clientHeight,$('leftText').childElementCount&&$('rightText').childElementCount?Math.max(actual($('leftText')),actual($('rightText'))):0)}px`);
  $('pageMark').textContent=pages.length>1?`${page+1} / ${pages.length}${page<pages.length-1?'  ↓':'  ·'}`:'';
}
function changePage(delta){if(!layoutReady)return;const next=Math.max(0,Math.min(pages.length-1,page+delta));if(next!==page){page=next;renderPage();}}
function applyPending(){if(!pendingFeed)return;const id=current()?.id;feed=pendingFeed;pendingFeed=null;queue=createQueue(feed.articles,settings.countries,Date.now(),settings.topic);index=Math.max(0,queue.findIndex(a=>a.id===id));}
function navigate(delta){if(!queue.length&&!pendingFeed)return;applyPending();index=moveIndex(index,delta,queue.length);render();$('reader').focus();}
function showDialog(id){if(overlay)overlay.hidden=true;const panel=$(id);overlay=panel;panel.hidden=false;if(id==='countriesDialog'){draftCountries=[...settings.countries];renderCountries();}requestAnimationFrame(()=>{if(overlay===panel)(id==='quickDialog'?$('quickContinue'):id==='musicDialog'?$(settings.musicEnabled?'musicOn':'musicOff'):panel.querySelector('button:not(:disabled),input'))?.focus();});}
function closeDialog(){if(!overlay)return false;overlay.hidden=true;overlay=null;$('reader').focus();return true;}
function toggleMenu(){if(overlay?.id==='quickDialog')closeDialog();else showDialog('quickDialog');}
function renderCountries(){const focused=document.activeElement?.dataset.country;$('countryOptions').replaceChildren(...COUNTRIES.map(c=>{const b=document.createElement('button');b.className='country-option';b.dataset.country=c.code;b.setAttribute('aria-pressed',String(draftCountries.includes(c.code)));const name=document.createElement('span');const count=createQueue(feed?.articles||[],[c.code],Date.now(),settings.topic).length;name.textContent=`${c.flag}  ${c.name} · ${count}`;b.dataset.count=String(count);const check=document.createElement('span');check.className='check';check.textContent=draftCountries.includes(c.code)?'✓':'';b.append(name,check);b.onclick=()=>{if(draftCountries.includes(c.code)){if(draftCountries.length===1){toast('Оставьте хотя бы одну страну.');return;}draftCountries=draftCountries.filter(x=>x!==c.code);}else draftCountries.push(c.code);renderCountries();};return b;}));if(focused)$('countryOptions').querySelector(`[data-country="${focused}"]`)?.focus();}
function showSource(){const a=current();if(!a)return;$('sourceTitle').textContent=a.source;$('sourceDetails').textContent=`${countryInfo(a.country).name} · ${a.sourceKind||'Редакция'} · ${ageLabel(a.publishedAt)}`;$('originalTitle').textContent=a.originalTitle||a.title;$('originalTitle').lang=a.language||'ru';$('sourceDisclaimer').textContent=hasFull(a)?'Показан доступный текст статьи с сайта редакции. Машинный перевод может содержать ошибки.':'Редакция отдала только аннотацию. Полный текст может быть недоступен или требовать подписку.';const url=safeUrl(a.url);if(url)$('originalLink').href=url;else $('originalLink').removeAttribute('href');$('originalLink').target=location.hostname==='app.globus.local'?'_self':'_blank';showDialog('sourceDialog');}
async function loadFeed(manual=false){if(busy)return;busy=true;$('refreshButton').disabled=true;$('retryButton').disabled=true;if(manual)toast('Проверяем новости…');try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);let response;try{response=await fetch(window.GLOBUS_CONFIG?.feedUrl||'./data/news.json',{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}if(!response.ok)throw new Error('Не удалось получить выпуск');const fresh=validateFeed(await response.json());if(!fresh.articles.length||Date.parse(fresh.generatedAt)>Date.now()+7200000)throw new Error('Недействительный выпуск');offline=response.headers.get('X-Globus-Offline')==='1'||navigator.onLine===false;lastFetch=Date.now();storage.set(CACHE_KEY,fresh);
  if(feed&&Date.parse(fresh.generatedAt)<=Date.parse(feed.generatedAt)){updateStatus();}
  else if(feed&&current()){pendingFeed=fresh;updateStatus();}
  else{feed=fresh;pendingFeed=null;rebuildQueue(true);}
  if(manual)toast(pendingFeed?'Новый выпуск появится при следующей новости.':'Выпуск проверен.');
 }catch{offline=true;if(!feed){try{const r=await fetch('./data/news.json');if(r.ok)feed=validateFeed(await r.json());}catch{}}if(feed){if(!current())rebuildQueue(true);updateStatus();}else{queue=[];render();$('emptyExplanation').textContent='Подключите интернет. OK — меню и обновление.';}if(manual)toast('Нет связи. Оставлен сохранённый выпуск.');}finally{busy=false;$('refreshButton').disabled=false;$('retryButton').disabled=false;}}
function controls(panel=overlay){return [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')].filter(e=>e.getClientRects().length);}
function spatialFocus(key){const active=document.activeElement,origin=active?.getBoundingClientRect(),elements=controls();if(!origin||!overlay.contains(active)){elements[0]?.focus();return;}const x=origin.x+origin.width/2,y=origin.y+origin.height/2,h=key==='ArrowLeft'||key==='ArrowRight',p=key==='ArrowRight'||key==='ArrowDown';const choices=elements.filter(e=>e!==active).map(e=>{const r=e.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y,along=h?dx:dy,across=h?Math.max(0,r.top-origin.bottom,origin.top-r.bottom):Math.max(0,r.left-origin.right,origin.left-r.right),gap=h?Math.max(0,p?r.left-origin.right:origin.left-r.right):Math.max(0,p?r.top-origin.bottom:origin.top-r.bottom);return{e,along,score:gap+across*4+Math.abs(along)*.02};}).filter(c=>p?c.along>4:c.along< -4).sort((a,b)=>a.score-b.score);choices[0]?.e.focus();}
function handleKey(key,event){
 if(overlay){if(['Escape','BrowserBack','Backspace'].includes(key)){event?.preventDefault();closeDialog();return;}if(key.startsWith('Arrow')){event?.preventDefault();if(document.activeElement===$('fontScale')&&['ArrowLeft','ArrowRight'].includes(key))setScale(settings.textScale+(key==='ArrowRight'?5:-5));else if(document.activeElement===$('musicVolume')&&['ArrowLeft','ArrowRight'].includes(key))setMusicVolume(settings.musicVolume+(key==='ArrowRight'?1:-1));else spatialFocus(key);return;}if(key==='Tab'){const list=controls();if(event.shiftKey&&document.activeElement===list[0]){event.preventDefault();list[list.length-1]?.focus();}else if(!event.shiftKey&&document.activeElement===list[list.length-1]){event.preventDefault();list[0]?.focus();}}return;}
 if(key==='ArrowRight'||key==='ArrowLeft'){event?.preventDefault();if(!event?.repeat)navigate(key==='ArrowRight'?1:-1);}
 else if(key==='ArrowDown'||key==='ArrowUp'){event?.preventDefault();changePage(key==='ArrowDown'?1:-1);}
 else if(key==='Enter'){event?.preventDefault();toggleMenu();}
 else if(key.toLowerCase()==='s'){event?.preventDefault();showDialog('settingsDialog');}
 else if(key.toLowerCase()==='c'){event?.preventDefault();showDialog('countriesDialog');}
 else if(key.toLowerCase()==='f'){event?.preventDefault();toggleFullscreen();}
}
document.addEventListener('keydown',e=>handleKey(e.key,e));window.globusBack=closeDialog;window.globusToggleMenu=toggleMenu;window.globusPause=()=>radio.suspend();window.globusResume=()=>{radio.resume();if(Date.now()-lastFetch>300000)loadFeed();};
window.globusRemoteKey=key=>{if(key==='Enter'){if(overlay){const a=document.activeElement;if(a&&['BUTTON','A'].includes(a.tagName))a.click();}else toggleMenu();}else handleKey(key);};
async function toggleFullscreen(){try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen();}catch{toast('Полный экран недоступен.');}}
function setScale(value){settings.textScale=value;saveSettings();scheduleLayout();}
$('quickContinue').onclick=closeDialog;$('quickCountries').onclick=()=>showDialog('countriesDialog');$('quickSettings').onclick=()=>showDialog('settingsDialog');$('quickSource').onclick=showSource;$('quickRefresh').onclick=()=>loadFeed(true);$('fullscreenButton').onclick=toggleFullscreen;
$('emptyCountries').onclick=()=>showDialog('countriesDialog');$('allCountries').onclick=()=>{draftCountries=COUNTRIES.map(c=>c.code);renderCountries();};$('russiaOnly').onclick=()=>{draftCountries=['RU'];renderCountries();};$('applyCountries').onclick=()=>{settings.countries=draftCountries;saveSettings();closeDialog();applyPending();rebuildQueue(false);};$('menuSettings').onclick=()=>showDialog('settingsDialog');$('menuSource').onclick=showSource;
$('refreshButton').onclick=()=>loadFeed(true);$('retryButton').onclick=()=>loadFeed(true);$('fontMinus').onclick=()=>setScale(settings.textScale-5);$('fontPlus').onclick=()=>setScale(settings.textScale+5);$('fontScale').oninput=e=>setScale(Number(e.target.value));
for(const b of document.querySelectorAll('[data-scale]'))b.onclick=()=>setScale(Number(b.dataset.scale));for(const b of document.querySelectorAll('[data-leading]'))b.onclick=()=>{settings.lineHeight=Number(b.dataset.leading);saveSettings();scheduleLayout();};for(const b of document.querySelectorAll('button[data-justify]'))b.onclick=()=>{settings.justify=b.dataset.justify==='true';saveSettings();scheduleLayout();};for(const b of document.querySelectorAll('button[data-theme]'))b.onclick=()=>{settings.theme=b.dataset.theme;saveSettings();scheduleLayout();};for(const b of document.querySelectorAll('[data-translation]'))b.onclick=()=>{settings.autoTranslate=b.dataset.translation==='true';saveSettings();render();};
function setMusicVolume(value){settings.musicVolume=value;saveSettings();}
$('musicSettingsButton').onclick=()=>showDialog('musicDialog');
$('musicVolume').oninput=e=>setMusicVolume(Number(e.target.value));$('musicMinus').onclick=()=>setMusicVolume(settings.musicVolume-1);$('musicPlus').onclick=()=>setMusicVolume(settings.musicVolume+1);
for(const b of document.querySelectorAll('[data-music]'))b.onclick=()=>{settings.musicEnabled=b.dataset.music==='true';saveSettings();};
for(const b of document.querySelectorAll('[data-topic]'))b.onclick=()=>{settings.topic=b.dataset.topic;saveSettings();applyPending();rebuildQueue(false);if(overlay?.id==='countriesDialog')renderCountries();};
$('resetReading').onclick=()=>{settings.textScale=100;settings.lineHeight=1.5;settings.justify=true;saveSettings();scheduleLayout();};
$('paperStylesButton').onclick=()=>showDialog('stylesDialog');$('rotateStyle').onclick=()=>{settings.paperStyle='rotate';saveSettings();scheduleLayout();};
$('styleOptions').replaceChildren(...PAPER_STYLES.map(style=>{const b=document.createElement('button');b.className='style-option';b.dataset.paperChoice=style.id;b.textContent=style.name;b.onclick=()=>{settings.paperStyle=style.id;saveSettings();scheduleLayout();};return b;}));
for(const b of document.querySelectorAll('[data-close]'))b.onclick=closeDialog;for(const panel of document.querySelectorAll('.overlay'))panel.onclick=e=>{if(e.target===panel)closeDialog();};
let touch=null,ignoreClickUntil=0,lastWheel=0;
$('reader').onclick=e=>{if(Date.now()>ignoreClickUntil&&!e.target.closest('button'))toggleMenu();};
$('reader').addEventListener('touchstart',e=>{touch={x:e.changedTouches[0].screenX,y:e.changedTouches[0].screenY};},{passive:true});$('reader').addEventListener('touchend',e=>{if(!touch||overlay)return;const dx=e.changedTouches[0].screenX-touch.x,dy=e.changedTouches[0].screenY-touch.y;touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))>60){ignoreClickUntil=Date.now()+500;if(Math.abs(dx)>Math.abs(dy)*1.3)navigate(dx>0?1:-1);else changePage(dy<0?1:-1);}},{passive:true});
document.addEventListener('wheel',e=>{if(overlay)return;e.preventDefault();if(Math.abs(e.deltaY)>10&&Date.now()-lastWheel>350){lastWheel=Date.now();changePage(e.deltaY>0?1:-1);}},{passive:false});
window.addEventListener('resize',()=>{applySettings();scheduleLayout();});window.addEventListener('online',()=>{loadFeed();radio.reconnect();});window.addEventListener('offline',()=>{offline=true;updateStatus();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.globusResume();else window.globusPause();});
document.addEventListener('keydown',()=>radio.gesture(),true);document.addEventListener('pointerdown',()=>radio.gesture(),true);
applySettings();if(document.hidden)radio.suspend();if(location.hostname==='app.globus.local')$('fullscreenButton').hidden=true;
try{const cached=storage.get(CACHE_KEY);if(cached){feed=validateFeed(cached);offline=true;rebuildQueue(true);}}catch{}
async function start(){if(!feed&&location.hostname==='app.globus.local'){try{const r=await fetch('./data/news.json');if(r.ok){feed=validateFeed(await r.json());offline=true;rebuildQueue(true);}}catch{}}loadFeed();}
start();setInterval(updateStatus,60000);setInterval(()=>{if(!document.hidden)loadFeed();},600000);
if('serviceWorker'in navigator&&['http:','https:'].includes(location.protocol)&&location.hostname!=='app.globus.local')navigator.serviceWorker.register('./sw.js').catch(()=>{});
