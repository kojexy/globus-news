// Only remove standalone publisher controls. Mentions of these services in news stay intact.
const CONTROL=/^(?:Share|Partager|Поделиться|Advertisement|Реклама|Sign up|Subscribe|Подписаться|Читайте также|Related articles|Related topics|Read more)\s*[:：]?$/i;
const META=/^(?:(?:Issued on|Modified(?: on)?|Updated(?: on)?|Published(?: on)?|Выпущено|Изменено|Обновлено|Опубликовано)\s*[:：]\s*)+$/i;
const VIDEO=[
  /^To display this content from YouTube, you must enable advertisement tracking and audience measurement\.?$/i,
  /^One of your browser extensions seems to be blocking the video player from loading\.\s*To watch this content, you may need to disable it on this site\.?$/i,
  /^Чтобы (?:отобразить|показать) этот контент с YouTube, вы должны включить отслеживание рекламы и измерение аудитории\.?$/i,
  /^Одно из расширений вашего браузера, похоже, блокирует загрузку видеоплеера\.\s*Чтобы посмотреть этот контент, вам может потребоваться отключить его на этом сайте\.?$/i,
];
const DATE=/^(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})(?:\s*[-–—,·T]\s*|\s+)?(?:\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:UTC|GMT|Z|[+-]\d{2}:?\d{2}))?)?$/i;
const normalize=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

export function isPhotoCaption(text) {
  if(typeof text!=='string')return false;
  const paragraph=text.trim();
  if(paragraph.length<12||paragraph.length>500||/[\r\n]/.test(paragraph)||/^[«“"„]/.test(paragraph))return false;
  const credit=paragraph.match(/\s+\/(VCG|CFP|Xinhua|Синьхуа)\/?\.?$/i);
  if(!credit)return false;
  // VCG/CFP are visual credits. Xinhua is also a news source: require explicit photo wording.
  return /^(?:VCG|CFP)$/i.test(credit[1])||/^(?:(?:A |The )?(?:file |archive )?photo(?:graph)?(?: of| shows| taken|:)|На фото(?:графии)?(?=[\s:])|(?:Архивное |Файловое )?[Фф]ото(?:графия)?[ :])/i.test(paragraph);
}

export function cleanArticleText(text,titles=[]) {
  if(typeof text!=='string')return '';
  const headings=new Set(titles.filter(t=>typeof t==='string'&&t.trim()).map(normalize));
  const paragraphs=text.replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(p=>p.replace(/[\t ]+/g,' ').trim()).filter(Boolean);
  const out=[];let metadata=false;
  for(const paragraph of paragraphs){
    if(META.test(paragraph)){metadata=true;continue;}
    if(metadata&&DATE.test(paragraph))continue;
    metadata=false;
    if(CONTROL.test(paragraph)||VIDEO.some(pattern=>pattern.test(paragraph))||isPhotoCaption(paragraph))continue;
    if(out.length<3&&headings.has(normalize(paragraph)))continue;
    out.push(paragraph);
  }
  return out.join('\n\n');
}
