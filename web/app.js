import {COUNTRIES, DEFAULTS, normalizeSettings, validateFeed, createQueue, moveIndex, ageLabel, safeUrl} from './core.mjs';

const $ = id => document.getElementById(id);
const SETTINGS_KEY='globus.settings.v1', CACHE_KEY='globus.edition.v1', LAST_KEY='globus.last.v1';
const storage={get(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}};
let settings=normalizeSettings(storage.get(SETTINGS_KEY)||DEFAULTS), feed=null, queue=[], index=0, pages=[], page=0;
let overlay=null, returnFocus=null, draftCountries=[], busy=false, offline=false, layoutFrame=0;
let refreshPending=false, lastFetch=0;
const countryInfo=code=>COUNTRIES.find(c=>c.code===code);
const current=()=>queue[index];

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
function applySettings(){
  document.body.dataset.font=settings.font;document.body.dataset.theme=settings.theme;
  $('countryCount').textContent=settings.countries.length;
  $('filterLabel').textContent=settings.countries.length===COUNTRIES.length?'ВЕСЬ МИР':settings.countries.map(code=>countryInfo(code).name).join(' · ').toUpperCase();
  for(const b of document.querySelectorAll('[data-font]')) if(b.tagName==='BUTTON') b.setAttribute('aria-pressed',String(b.dataset.font===settings.font));
  for(const b of document.querySelectorAll('[data-theme]')) if(b.tagName==='BUTTON') b.setAttribute('aria-pressed',String(b.dataset.theme===settings.theme));
}
function saveSettings(){if(!storage.set(SETTINGS_KEY,settings))toast('Браузер не разрешил сохранить настройки.');applySettings();}

function rebuildQueue(preserve=true){
  const lastId=preserve?(current()?.id||storage.get(LAST_KEY)):null;
  queue=createQueue(feed?.articles||[],settings.countries);
  const found=queue.findIndex(a=>a.id===lastId);index=found>=0?found:0;render();
}
function updateStatus(){
  if(!feed)return;
  const stamp=new Intl.DateTimeFormat('ru',{hour:'2-digit',minute:'2-digit'}).format(new Date(feed.generatedAt));
  $('edition').textContent=`Выпуск ${stamp}`;
  const old=Date.now()-Date.parse(feed.generatedAt)>6*3600_000;
  const unavailable=feed.sources.filter(s=>s.status!=='ok'&&settings.countries.includes(s.country));
  const messages=[];
  if(offline)messages.push('Нет связи. Показан сохранённый выпуск.');
  if(old)messages.push('Выпуск старше 6 часов. Свежие новости пока не получены.');
  if(unavailable.length)messages.push(`Недоступны или из кеша: ${unavailable.map(s=>s.name).join(', ')}.`);
  if(refreshPending)messages.push('Свежий выпуск готов. Он появится при следующем переключении.');
  $('notice').textContent=messages.join(' ');$('notice').hidden=!messages.length;
  $('updateInfo').textContent=`Выпуск: ${new Date(feed.generatedAt).toLocaleString('ru-RU')}. Плановое обновление — каждые 3 часа; возможна задержка GitHub.`;
}
function render(){
  const a=current();page=0;pages=[];
  $('article').hidden=!a;$('emptyState').hidden=Boolean(a);
  $('nextButton').disabled=!a;$('previousButton').disabled=!a;$('sourceButton').disabled=!a;
  updateStatus();
  if(!a){$('progress').style.width='0';return;}
  storage.set(LAST_KEY,a.id);
  const c=countryInfo(a.country);$('country').replaceChildren();
  const flag=document.createElement('span');flag.className='flag';flag.textContent=c.flag;flag.setAttribute('aria-hidden','true');
  $('country').append(flag,document.createTextNode(c.name));
  $('position').textContent=`${String(index+1).padStart(2,'0')} / ${String(queue.length).padStart(2,'0')}`;
  $('storyCategory').textContent=a.country==='RU'?'РОССИЙСКИЕ РЕДАКЦИИ':'ВЗГЛЯД ИЗ ДРУГОЙ СТРАНЫ';
  $('headline').textContent=a.title;$('headline').style.fontSize='';
  $('sourceName').textContent=a.source;$('sourceKind').textContent=a.sourceKind||'';
  $('publishedAt').textContent=ageLabel(a.publishedAt);$('publishedAt').dateTime=a.publishedAt||'';
  $('translationLabel').textContent=a.translation==='argos'?'Машинный перевод · Argos':a.translation==='unavailable'?'Перевод недоступен · оригинал':'Оригинал на русском';
  $('progress').style.width=`${((index+1)/queue.length)*100}%`;
  $('article').classList.remove('changing');void $('article').offsetWidth;$('article').classList.add('changing');
  scheduleLayout();
}
function scheduleLayout(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(layoutPages);}
function layoutPages(){
  if(!current()||$('article').hidden)return;
  const savedPage=page,title=$('headline'),copy=title.parentElement,space=$('textSpace'),text=$('storyText');
  // Reserve room for at least two body lines. Long titles shrink before body text.
  title.style.fontSize='';
  let size=parseFloat(getComputedStyle(title).fontSize);
  const line=parseFloat(getComputedStyle(text).lineHeight);
  while(size>23 && (title.offsetHeight>copy.clientHeight*.48 || space.clientHeight<line*2)){
    size-=1;title.style.fontSize=`${size}px`;
  }
  const content=current().text||'Редакция передала только заголовок. Полный текст доступен на сайте источника.';
  const words=content.split(/\s+/).filter(Boolean), result=[];
  let start=0;
  const maxHeight=Math.max(1,space.clientHeight-2);
  while(start<words.length){
    let low=1,high=words.length-start,fit=0;
    while(low<=high){
      const mid=Math.floor((low+high)/2);text.textContent=words.slice(start,start+mid).join(' ');
      if(text.scrollHeight<=maxHeight){fit=mid;low=mid+1;}else high=mid-1;
    }
    // Very small windows still expose every word through explicit pages.
    if(!fit)fit=1;
    result.push(words.slice(start,start+fit).join(' '));start+=fit;
  }
  pages=result.length?result:[''];page=Math.min(savedPage,pages.length-1);renderPage();
}
function renderPage(){
  $('storyText').textContent=pages[page]||'';$('pageControls').hidden=pages.length<2;
  $('pageNumber').textContent=`${page+1} / ${pages.length}`;
  $('previousPage').disabled=page===0;$('nextPage').disabled=page>=pages.length-1;
}
function changePage(delta){const next=Math.max(0,Math.min(pages.length-1,page+delta));if(next!==page){page=next;renderPage();}else if(pages.length>1)toast(delta>0?'Конец заметки. → следующая новость':'Начало заметки');}

let pendingFeed=null;
function navigate(delta){
  if(!queue.length && !pendingFeed)return;
  if(pendingFeed){
    const id=current()?.id;feed=pendingFeed;pendingFeed=null;refreshPending=false;
    queue=createQueue(feed.articles,settings.countries);index=Math.max(0,queue.findIndex(a=>a.id===id));
  }
  index=moveIndex(index,delta,queue.length);render();
}
function showDialog(id){
  returnFocus=document.activeElement;overlay=$(id);overlay.hidden=false;
  if(id==='countriesDialog'){draftCountries=[...settings.countries];renderCountries();}
  requestAnimationFrame(()=>overlay.querySelector('button:not(:disabled),a[href]')?.focus());
}
function closeDialog(){
  if(!overlay)return false;overlay.hidden=true;overlay=null;
  if(returnFocus && document.contains(returnFocus))returnFocus.focus();else $('reader').focus();
  scheduleLayout();return true;
}
function renderCountries(){
  const focused=document.activeElement?.dataset.country;
  $('countryOptions').replaceChildren(...COUNTRIES.map(c=>{
    const button=document.createElement('button');button.className='country-option';button.dataset.country=c.code;
    button.setAttribute('aria-pressed',String(draftCountries.includes(c.code)));
    const flag=document.createElement('span');flag.textContent=c.flag;flag.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.textContent=c.name;
    const check=document.createElement('span');check.className='check';check.textContent=draftCountries.includes(c.code)?'✓':'';check.setAttribute('aria-hidden','true');
    button.append(flag,name,check);
    button.addEventListener('click',()=>{
      if(draftCountries.includes(c.code)){
        if(draftCountries.length===1){toast('Оставьте хотя бы одну страну.');return;}
        draftCountries=draftCountries.filter(code=>code!==c.code);
      }else draftCountries.push(c.code);
      renderCountries();
    });return button;
  }));
  if(focused)$('countryOptions').querySelector(`[data-country="${focused}"]`)?.focus();
  $('applyCountries').textContent=`Читать новости · ${draftCountries.length} ${draftCountries.length===1?'страна':draftCountries.length<5?'страны':'стран'} →`;
}
function showSource(){
  const a=current();if(!a)return;
  $('sourceTitle').textContent=a.source;
  $('sourceDetails').textContent=`${countryInfo(a.country).name} · ${a.sourceKind||'Редакция'} · ${ageLabel(a.publishedAt)}`;
  $('originalTitle').textContent=a.originalTitle||a.title;$('originalTitle').lang=a.language||'ru';
  $('sourceDisclaimer').textContent='Показан краткий текст, опубликованный редакцией в RSS. Глобус не дописывает факты и не выдаёт перевод за независимую проверку.';
  const link=safeUrl(a.url);if(link)$('originalLink').href=link;else $('originalLink').removeAttribute('href');
  showDialog('sourceDialog');
}
async function loadFeed(manual=false){
  if(busy)return;busy=true;
  $('refreshButton').disabled=true;$('retryButton').disabled=true;
  if(manual)toast('Проверяем свежий выпуск…');
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    let response;
    try{response=await fetch(window.GLOBUS_CONFIG?.feedUrl||'./data/news.json',{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const fresh=validateFeed(await response.json());
    if(!fresh.articles.length)throw new Error('Пустой выпуск');
    if(Date.parse(fresh.generatedAt)>Date.now()+2*3600_000)throw new Error('Неверная дата выпуска');
    offline=false;lastFetch=Date.now();storage.set(CACHE_KEY,fresh);
    if(feed && Date.parse(fresh.generatedAt)>Date.parse(feed.generatedAt) && current() && !manual){
      pendingFeed=fresh;refreshPending=true;updateStatus();scheduleLayout();
    }else{
      feed=fresh;pendingFeed=null;refreshPending=false;rebuildQueue(true);
    }
    if(manual)toast('Выпуск обновлён.');
  }catch(error){
    offline=true;
    if(!feed){
      // Bundled edition makes the Android shell usable on its very first offline launch.
      try{
        const response=await fetch('./data/news.json',{cache:'no-store'});
        if(response.ok)feed=validateFeed(await response.json());
      }catch{}
    }
    if(feed){rebuildQueue(true);if(manual)toast('Связи нет. Оставлен сохранённый выпуск.');}
    else{
      queue=[];render();$('edition').textContent='Нет связи';$('emptyExplanation').textContent='Не удалось загрузить первый выпуск. Проверьте интернет и нажмите «Обновить».';
    }
  }finally{busy=false;$('refreshButton').disabled=false;$('retryButton').disabled=false;}
}

function spatialFocus(key){
  const elements=[...overlay.querySelectorAll('button:not(:disabled),a[href]')].filter(e=>e.getClientRects().length);
  const active=document.activeElement, origin=active?.getBoundingClientRect();
  if(!origin||!overlay.contains(active)){elements[0]?.focus();return;}
  const x=origin.x+origin.width/2,y=origin.y+origin.height/2;
  const horizontal=key==='ArrowLeft'||key==='ArrowRight', positive=key==='ArrowRight'||key==='ArrowDown';
  const choices=elements.filter(e=>e!==active).map(e=>{
    const r=e.getBoundingClientRect(),dx=r.x+r.width/2-x,dy=r.y+r.height/2-y;
    const along=horizontal?dx:dy, across=horizontal?dy:dx;
    return {e,along,score:Math.abs(along)+Math.abs(across)*3};
  }).filter(c=>positive?c.along>4:c.along< -4).sort((a,b)=>a.score-b.score);
  choices[0]?.e.focus();
}
document.addEventListener('keydown',event=>{
  const key=event.key;
  if(overlay){
    if(key==='Escape'||key==='BrowserBack'||key==='Backspace'){event.preventDefault();closeDialog();}
    else if(key.startsWith('Arrow')){event.preventDefault();spatialFocus(key);}
    else if(key==='Tab'){
      const controls=[...overlay.querySelectorAll('button:not(:disabled),a[href]')].filter(e=>e.getClientRects().length);
      if(event.shiftKey && document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
      else if(!event.shiftKey && document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
    }return;
  }
  if(key==='ArrowRight'){event.preventDefault();navigate(1);}
  else if(key==='ArrowLeft'){event.preventDefault();navigate(-1);}
  else if(key==='ArrowDown'){event.preventDefault();changePage(1);}
  else if(key==='ArrowUp'){event.preventDefault();changePage(-1);}
  else if(key==='Enter' && (document.activeElement===document.body || document.activeElement===$('reader'))){event.preventDefault();showDialog('countriesDialog');}
  else if(key.toLowerCase()==='f'){event.preventDefault();toggleFullscreen();}
  else if(key.toLowerCase()==='s'){event.preventDefault();showDialog('settingsDialog');}
  else if(key==='Escape' && document.activeElement!==document.body)$('reader').focus();
});
// Android's Back callback calls this; a second Back exits the app.
window.globusBack=()=>closeDialog();
window.globusRemoteKey=key=>{
  if(key==='Enter'){
    const active=document.activeElement;
    if(active && ['BUTTON','A'].includes(active.tagName))active.click();
    else if(!overlay)showDialog('countriesDialog');
  }else document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
};

async function toggleFullscreen(){
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Полный экран недоступен. Используйте F11 или кнопку браузера.');}
}
$('countriesButton').onclick=()=>showDialog('countriesDialog');$('emptyCountries').onclick=()=>showDialog('countriesDialog');
$('settingsButton').onclick=()=>showDialog('settingsDialog');$('sourceButton').onclick=showSource;
$('menuSettings').onclick=()=>{closeDialog();showDialog('settingsDialog');};
$('menuSource').onclick=()=>{closeDialog();showSource();};
$('allCountries').onclick=()=>{draftCountries=COUNTRIES.map(c=>c.code);renderCountries();};
$('russiaOnly').onclick=()=>{draftCountries=['RU'];renderCountries();};
$('applyCountries').onclick=()=>{settings=normalizeSettings({...settings,countries:draftCountries});saveSettings();closeDialog();rebuildQueue(false);};
$('nextButton').onclick=()=>navigate(1);$('previousButton').onclick=()=>navigate(-1);
$('nextPage').onclick=()=>changePage(1);$('previousPage').onclick=()=>changePage(-1);
$('fullscreenButton').onclick=toggleFullscreen;$('refreshButton').onclick=()=>loadFeed(true);$('retryButton').onclick=()=>loadFeed(true);
for(const button of document.querySelectorAll('[data-close]'))button.onclick=closeDialog;
for(const element of document.querySelectorAll('.overlay'))element.addEventListener('click',event=>{if(event.target===element)closeDialog();});
for(const button of document.querySelectorAll('[data-font]')) if(button.tagName==='BUTTON')button.onclick=()=>{settings.font=button.dataset.font;saveSettings();scheduleLayout();};
for(const button of document.querySelectorAll('[data-theme]')) if(button.tagName==='BUTTON')button.onclick=()=>{settings.theme=button.dataset.theme;saveSettings();};
let touch=null;
$('reader').addEventListener('touchstart',e=>{touch={x:e.changedTouches[0].screenX,y:e.changedTouches[0].screenY};},{passive:true});
$('reader').addEventListener('touchend',e=>{if(!touch||overlay)return;const dx=e.changedTouches[0].screenX-touch.x,dy=e.changedTouches[0].screenY-touch.y;touch=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)navigate(dx>0?1:-1);},{passive:true});
window.addEventListener('resize',scheduleLayout);
window.addEventListener('online',()=>loadFeed());
window.addEventListener('offline',()=>{offline=true;updateStatus();scheduleLayout();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden && Date.now()-lastFetch>300_000)loadFeed();});
function tick(){
  $('clock').textContent=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date());
  if(current())$('publishedAt').textContent=ageLabel(current().publishedAt);
  updateStatus();
}
applySettings();tick();
try{const saved=storage.get(CACHE_KEY);if(saved){feed=validateFeed(saved);offline=true;rebuildQueue(true);}}catch{}
loadFeed();setInterval(tick,60_000);setInterval(()=>{if(!document.hidden)loadFeed();},10*60_000);
if('serviceWorker' in navigator && ['http:','https:'].includes(location.protocol) && location.hostname!=='app.globus.local')navigator.serviceWorker.register('./sw.js').catch(()=>{});
