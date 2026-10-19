import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paginateArticle} from '../web/typeset.mjs';

const normalize=text=>text.replace(/\s+/g,' ').trim();
const options={width:80,height:70,lineHeight:10,fontSize:7,paragraphGap:3,measure:(text,weight)=>text.length*(weight===700?1.1:1)};
const copy=pages=>pages.flatMap(p=>[p.left,p.right]).flatMap(c=>c.chunks).flatMap(p=>p.lines).map(l=>l.text).join('');

test('pages preserve every word, paragraph and wide-word fragment exactly',()=>{
  const text=['First paragraph with emphasis. '.repeat(12),'X'.repeat(215),...Array.from({length:13},(_,i)=>Array.from({length:90},(_,j)=>`paragraph${i}word${j}`).join(' '))].join('\n\n');
  const pages=paginateArticle(text,options);
  assert(pages.length>2);assert.equal(normalize(copy(pages)),normalize(text));
  for(const page of pages)for(const c of [page.left,page.right])assert(c.height<=options.height+.01);
  assert.equal(pages.flatMap(p=>[p.left,p.right]).flatMap(c=>c.chunks).filter(p=>p.lead).length,1);
  assert(pages.flatMap(p=>[p.left,p.right]).flatMap(c=>c.chunks).some(p=>p.continuation));
  for(const p of pages.flatMap(p=>[p.left,p.right]).flatMap(c=>c.chunks))assert(!p.continuation||!p.lead);
});

test('justification never stretches a gap beyond 1.7 ordinary spaces',()=>{
  const pages=paginateArticle('Small words have spaces. '.repeat(150),options);
  const lines=pages.flatMap(p=>[p.left,p.right]).flatMap(c=>c.chunks).flatMap(p=>p.lines);
  assert(lines.some(l=>l.justified));for(const line of lines)if(line.justified)assert(line.ratio<=1.7);
  const left=paginateArticle('Small words have spaces. '.repeat(50),{...options,justify:false});
  assert(left.flatMap(p=>[p.left,p.right]).flatMap(c=>c.chunks).flatMap(p=>p.lines).every(l=>!l.justified));
});

test('short articles use two balanced columns without filling the screen',()=>{
  const text=Array.from({length:70},(_,i)=>`word${i}`).join(' ');
  const pages=paginateArticle(text,{...options,height:300});assert.equal(pages.length,1);
  assert(pages[0].left.chunks.length&&pages[0].right.chunks.length);
  assert(Math.max(pages[0].left.height,pages[0].right.height)<100);
  assert.equal(normalize(copy(pages)),normalize(text));
});
