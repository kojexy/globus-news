// Explicit lines keep word spacing bounded. Cursor offsets also preserve a word
// that is wider than a narrow TV/browser column without adding a fake hyphen.
export function paginateArticle(text,{width,height,lineHeight,fontSize,paragraphGap,measure,justify=true}) {
  const paragraphs=text.trim().split(/\n\s*\n/).map(p=>p.trim().split(/\s+/)).filter(p=>p[0]);
  const end=c=>c.p>=paragraphs.length;
  const cache=new Map();
  const size=(text,weight)=>{const key=weight+':'+text;if(!cache.has(key))cache.set(key,measure(text,weight));return cache.get(key);};
  function line(cursor,available,weight){
    const words=paragraphs[cursor.p],start=cursor.w,offset=cursor.o||0;
    let text=words[start].slice(offset),next={p:cursor.p,w:start+1,o:0};
    if(size(text,weight)>available){
      const chars=Array.from(text);let lo=1,hi=chars.length,fit=1;
      while(lo<=hi){const n=(lo+hi)>>1;if(size(chars.slice(0,n).join(''),weight)<=available){fit=n;lo=n+1;}else hi=n-1;}
      text=chars.slice(0,fit).join('');next={p:cursor.p,w:start,o:offset+text.length};
      if(next.o>=words[start].length)next={p:cursor.p,w:start+1,o:0};
    }else{
      while(next.w<words.length){const candidate=text+' '+words[next.w];if(size(candidate,weight)>available)break;text=candidate;next.w++;}
    }
    const complete=next.w===words.length;
    const spaces=(text.match(/ /g)||[]).length,natural=size(text,weight),space=size(' ',weight);
    const ratio=spaces?1+Math.max(0,available-natural)/(spaces*space):Infinity;
    const justified=justify&&!complete&&spaces>0&&ratio<=1.7;
    // Separators belong to the source word/paragraph, not to a visual line/page.
    const suffix=complete?'\n\n':next.o?'':' ';
    if(complete)next={p:cursor.p+1,w:0,o:0};
    return {text:text+suffix,justified,ratio,next};
  }
  function column(from,limit){
    let cursor={...from},used=0;const chunks=[];
    while(!end(cursor)){
      const gap=chunks.length?paragraphGap:0;
      if(used+gap+lineHeight>limit+.01)break;
      const first=cursor.w===0&&!cursor.o,lead=cursor.p===0&&first&&paragraphs.length>1;
      const chunk={p:cursor.p,lead,continuation:!first,lines:[]};
      used+=gap;
      while(!end(cursor)&&cursor.p===chunk.p&&used+lineHeight<=limit+.01){
        const indent=chunk.lines.length===0&&first&&!lead?fontSize:0;
        const row=line(cursor,Math.max(1,width-indent-1),lead?700:400);
        chunk.lines.push(row);cursor=row.next;used+=lineHeight;
      }
      chunks.push(chunk);
    }
    return {chunks,height:used,next:cursor};
  }
  const pages=[];let cursor={p:0,w:0,o:0};
  // At least one line fits even on an unusually small display.
  height=Math.max(lineHeight,height);
  while(!end(cursor)){
    const start={...cursor},left=column(cursor,height),right=column(left.next,height);
    pages.push({left,right,start});cursor=right.next;
  }
  const last=pages[pages.length-1];
  if(last){
    const words=paragraphs.slice(last.start.p).reduce((n,p)=>n+p.length,0)-last.start.w;
    if(words>=45){
      let low=lineHeight,high=height,best=last;
      for(let i=0;i<14;i++){
        const target=(low+high)/2,left=column(last.start,target),right=column(left.next,target);
        if(end(right.next)){if(left.chunks.length&&right.chunks.length)best={left,right,start:last.start};high=target;}else low=target;
      }
      pages[pages.length-1]=best;
    }
  }
  return pages;
}
