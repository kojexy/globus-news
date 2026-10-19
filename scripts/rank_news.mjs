// Use the exact same topic rules in collection and in the reader.
import {isPolitics} from '../web/core.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const articles=JSON.parse(input).map(a=>({...a,topic:isPolitics(a)?'politics':'other'}));
articles.sort((a,b)=>Number(b.topic==='politics')-Number(a.topic==='politics')||(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
process.stdout.write(JSON.stringify(articles));
