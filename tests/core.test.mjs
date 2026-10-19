import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,createQueue,moveIndex,safeUrl,validateFeed,PAPER_STYLES} from '../web/core.mjs';
const now=Date.parse('2026-10-19T12:00:00Z');
const article=(id,country,hours=1)=>({id,country,title:id,url:'https://example.org/'+id,publishedAt:new Date(now-hours*3600000).toISOString()});
test('permanent country filter rejects unknown codes and keeps a nonempty selection',()=>{
  const normalized=normalizeSettings({countries:['RU','US','RU','XX'],font:'bad',theme:'dark'});
  assert.deepEqual(normalized.countries,['RU','US']);
  assert.equal(normalized.font,'normal');assert.equal(normalized.theme,'dark');assert.equal(normalized.textScale,100);assert.equal(normalized.autoTranslate,true);
  assert.equal(normalizeSettings({countries:[]}).countries.length,8);
});
test('TV reading settings clamp scale and preserve explicit translation preference',()=>{
  assert.equal(normalizeSettings({textScale:10}).textScale,50);
  assert.equal(normalizeSettings({textScale:999}).textScale,180);
  assert.equal(normalizeSettings({autoTranslate:false}).autoTranslate,false);
  assert.equal(normalizeSettings({lineHeight:1.3,contentWidth:'column'}).lineHeight,1.3);
});
test('newspaper styles migrate existing preferences without losing countries or translation',()=>{
  assert.equal(PAPER_STYLES.length,12);assert.equal(new Set(PAPER_STYLES.map(s=>s.id)).size,12);
  const old=normalizeSettings({countries:['RU','CN'],textScale:75,autoTranslate:false});
  assert.deepEqual(old.countries,['RU','CN']);assert.equal(old.paperStyle,'rotate');assert.equal(old.textScale,75);assert.equal(old.autoTranslate,false);
  assert.equal(normalizeSettings({paperStyle:'coffee',justify:false}).paperStyle,'coffee');
  assert.equal(normalizeSettings({paperStyle:'invalid'}).paperStyle,'rotate');
});
test('queue filters countries, removes old/future stories, and balances editions',()=>{
  const articles=[article('ru2','RU',2),article('us','US'),article('ru','RU'),article('cn','CN'),article('old','RU',73),article('future','RU',-3)];
  assert.deepEqual(createQueue(articles,['RU','US'],now).map(a=>a.id),['ru','us','ru2']);
  assert.deepEqual(createQueue(articles,['JP'],now),[]);
});
test('remote wraps in either direction and safely handles empty feeds',()=>{
  assert.equal(moveIndex(0,-1,4),3);assert.equal(moveIndex(3,1,4),0);assert.equal(moveIndex(1,1,0),0);
});
test('source links reject active content and embedded credentials',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','https://a:b@example.com'])assert.equal(safeUrl(url),null);
  assert.equal(safeUrl('https://example.com/story'),'https://example.com/story');
});
test('malformed feed cannot replace valid cached data; duplicate and unsafe stories are discarded',()=>{
  assert.throws(()=>validateFeed({articles:[]}));
  const a=article('one','RU');
  const valid=validateFeed({schemaVersion:1,generatedAt:new Date(now).toISOString(),articles:[a,a,{...a,id:'bad',url:'javascript:x'}]});
  assert.equal(valid.articles.length,1);
});

test('politics is the default and optional music is off until explicitly enabled',()=>{
  const s=normalizeSettings({});assert.equal(s.topic,'politics');assert.equal(s.musicEnabled,false);assert.equal(s.musicVolume,12);
  assert.equal(normalizeSettings({topic:'all',musicEnabled:true,musicVolume:99}).musicVolume,30);
  assert.equal(normalizeSettings({musicEnabled:'true'}).musicEnabled,false);
});
test('strict political feed excludes sport, lifestyle and incidental politician mentions',async()=>{
  const {isPolitics}=await import('../web/core.mjs');
  for(const title of ['Путин подписал закон о бюджете','Лавров встретился с министром иностранных дел','Макрон обсудил протесты во Франции','Republicans prepare for Senate elections','China and Russia hold diplomatic talks'])assert.equal(isPolitics({title}),true,title);
  for(const title of ['В Москве ожидаются заморозки','Теннисист проиграл на турнире в США','Новый вид кашалота найден в Японии','Звезда мема вышла замуж','Trump watches football match'])assert.equal(isPolitics({title,originalText:'Президент рассказал о выборах'}),false,title);
  assert.equal(isPolitics({title:'New government reform',categories:['Politics']}),true);
  assert.equal(isPolitics({title:'President visits football match',categories:['Sports']}),false);
  const a={...article('politics','RU'),title:'Парламент принял закон'};
  const b={...article('weather','RU'),title:'Погода на завтра'};
  assert.deepEqual(createQueue([a,b],['RU'],now,'politics').map(x=>x.id),['politics']);
  assert.deepEqual(createQueue([b],['RU'],now,'politics'),[]);
});
