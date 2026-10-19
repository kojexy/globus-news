import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,createQueue,moveIndex,safeUrl,validateFeed} from '../web/core.mjs';
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
