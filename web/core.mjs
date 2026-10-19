export const COUNTRIES = [
  {code:'RU', name:'Россия', flag:'🇷🇺'}, {code:'US', name:'США', flag:'🇺🇸'},
  {code:'CN', name:'Китай', flag:'🇨🇳'}, {code:'GB', name:'Великобритания', flag:'🇬🇧'},
  {code:'DE', name:'Германия', flag:'🇩🇪'}, {code:'FR', name:'Франция', flag:'🇫🇷'},
  {code:'JP', name:'Япония', flag:'🇯🇵'}, {code:'IN', name:'Индия', flag:'🇮🇳'},
];
export const DEFAULTS = {countries:COUNTRIES.map(c=>c.code),font:'normal',theme:'paper',textScale:100,lineHeight:1.5,contentWidth:'wide',autoTranslate:true,topic:'politics',musicEnabled:false,musicVolume:12};
export const PAPER_STYLES = [
  {id:'morning',name:'Утренняя'}, {id:'broadsheet',name:'Большая газета'},
  {id:'coffee',name:'За кофе'}, {id:'archive',name:'Архив'},
  {id:'northern',name:'Северная'}, {id:'letterpress',name:'Типография'},
  {id:'sunday',name:'Воскресная'}, {id:'telegram',name:'Телеграф'},
  {id:'library',name:'Библиотечная'}, {id:'moon',name:'Лунный выпуск'},
  {id:'post',name:'Почтовая'}, {id:'evening',name:'Вечерняя'},
];
export function normalizeSettings(input = {}) {
  const countries = Array.isArray(input.countries) ? [...new Set(input.countries.filter(c => COUNTRIES.some(x => x.code===c)))] : DEFAULTS.countries;
  return {
    countries: countries.length ? countries : [...DEFAULTS.countries],
    font: ['normal','large','extra'].includes(input.font) ? input.font : DEFAULTS.font,
    theme: ['paper','dark'].includes(input.theme) ? input.theme : DEFAULTS.theme,
    textScale: Number.isFinite(input.textScale)?Math.max(50,Math.min(180,Math.round(input.textScale/5)*5)):100,
    lineHeight: [1.3,1.5,1.7].includes(input.lineHeight)?input.lineHeight:1.5,
    contentWidth: ['wide','column'].includes(input.contentWidth)?input.contentWidth:'wide',
    autoTranslate: input.autoTranslate!==false,
    paperStyle: ['rotate',...PAPER_STYLES.map(s=>s.id)].includes(input.paperStyle)?input.paperStyle:'rotate',
    justify: input.justify!==false,
    topic: input.topic==='all'?'all':'politics',
    musicEnabled: input.musicEnabled===true,
    musicVolume: Number.isFinite(input.musicVolume)?Math.max(1,Math.min(30,Math.round(input.musicVolume))):12,
  };
}
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function validateFeed(feed) {
  if (!feed || feed.schemaVersion!==1 || !Number.isFinite(Date.parse(feed.generatedAt)) || !Array.isArray(feed.articles)) throw new Error('Неверный формат выпуска');
  const seen=new Set();
  const articles=feed.articles.filter(a=>{
    if (!a || typeof a.id!=='string' || seen.has(a.id) || typeof a.title!=='string' || !a.title.trim() || !COUNTRIES.some(c=>c.code===a.country) || !safeUrl(a.url)) return false;
    seen.add(a.id); return true;
  }).map(a=>({...a,title:a.title.slice(0,1000),text:typeof a.text==='string'?a.text.slice(0,5000):'',fullText:typeof a.fullText==='string'?a.fullText.slice(0,80000):'',originalFullText:typeof a.originalFullText==='string'?a.originalFullText.slice(0,40000):'',source:typeof a.source==='string'?a.source:'Редакция'}));
  return {...feed,articles,sources:Array.isArray(feed.sources)?feed.sources:[]};
}
export function isRecent(article, now=Date.now()) {
  if(!article.publishedAt) return true;
  const t=Date.parse(article.publishedAt);
  return Number.isFinite(t) && now-t<=72*3600_000 && t-now<=2*3600_000;
}
// Round-robin keeps one prolific country from taking over the edition.
export function createQueue(articles,countries,now=Date.now(),topic='all') {
  const groups=countries.map(code=>articles.filter(a=>a.country===code && isRecent(a,now) && (topic!=='politics'||isPolitics(a))).sort((a,b)=>Number(Boolean(b.fullText||b.originalFullText))-Number(Boolean(a.fullText||a.originalFullText))||(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)));
  const out=[]; for(let i=0;groups.some(g=>i<g.length);i++) for(const group of groups) if(group[i]) out.push(group[i]);
  return out;
}
// Classify the editorial topic, not incidental names appearing in the full article.
// Unknown stories stay out of the strict feed; never replace an empty filter with all news.
export function isPolitics(article) {
  const categories=(Array.isArray(article.categories)?article.categories:[]).filter(x=>typeof x==='string').join(' ').toLowerCase();
  const section=(()=>{try{return new URL(article.url).pathname.toLowerCase();}catch{return '';}})();
  const headline=[article.originalTitle,article.title].filter(Boolean).join(' ').toLowerCase();
  const teaser=[article.originalText,article.text].filter(Boolean).join(' ').slice(0,3000).toLowerCase();
  const offTopic=/\b(sport|football|tennis|celebrity|entertainment|lifestyle|weather|horoscope|recipe|wellness)\w*|спорт|футбол|теннис|шоу-бизнес|гороскоп|рецепт|погод|заморозк/;
  const politics=/\b(politic\w*|election\w*|parliament\w*|diploma(?:t|c)\w*|geopolitic\w*|sanction\w*|legislat\w*|senat\w*|republican\w*|democrat\w*|ceasefire|airstrike\w*|invasion|armed conflict|peace talks|foreign minister|prime minister|white house|united nations|nato|kremlin|midterm\w*|voter\w*|ballot\w*|opposition|national security|defen[cs]e|military|nuclear|missile\w*|tariff\w*|immigration|refugee\w*|summit|governance|protest\w*|treaty|human rights)\b|политик|выбор[а-яё]*|избирател|парламент|госдум|дипломат|санкци|вторжени|перемири|мирн[а-яё]* переговор|военн[а-яё]* операци|вице-премьер|премьер-министр|премьер|министр[а-яё]* иностранных|международн[а-яё]* отношен|оппозици|республикан|демократическ[а-яё]* парти|конституц|(?:^|[^а-яё])(?:мид|нато|оон)(?:$|[^а-яё])|кремл/;
  const incident=/\b(fire|car crash|accident|murder|anniversary|celebrity|festival)\b|при пожаре|автокатастроф|годовщин|убийств|мошенничеств/;
  if(incident.test(headline)&&!politics.test(headline))return false;
  if(offTopic.test(categories+' '+section))return false;
  if(article.topic==='politics')return true;
  if(politics.test(categories+' '+section))return true;
  if(offTopic.test(headline))return false;
  if(politics.test(headline))return true;
  const actor=/\b(president|government|trump|putin|zelensky\w*|macron|netanyahu|rubio|congress|cabinet|chancellor)\b|президент|правительств|трамп|путин|зеленск|макрон|нетаньяху|лавров|мишустин|госсекретар|канцлер/;
  const action=/\b(meet\w*|talks|visit\w*|policy|summit|treaty|law|budget|reform\w*|war|military|missile\w*|protest\w*|immigration|governance|cooperation)\b|встрет|переговор|визит|закон|бюджет|реформ|войн|военн|ракет|протест|миграци|сотрудничеств|управлени|соглашени/;
  if(actor.test(headline)&&action.test(headline+' '+teaser))return true;
  return action.test(headline)&&politics.test(teaser);
}
export function moveIndex(index,delta,length) { return length ? ((index+delta)%length+length)%length : 0; }
export function ageLabel(value,now=Date.now()) {
  const date=Date.parse(value); if(!Number.isFinite(date)) return 'Время не указано';
  const minutes=Math.max(0,Math.floor((now-date)/60000));
  if(minutes<1)return 'Только что'; if(minutes<60)return `${minutes} мин назад`;
  if(minutes<1440)return `${Math.floor(minutes/60)} ч назад`;
  return new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date);
}
