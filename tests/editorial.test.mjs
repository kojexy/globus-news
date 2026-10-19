import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanArticleText,isPhotoCaption} from '../web/editorial.mjs';

const player='To display this content from YouTube, you must enable advertisement tracking and audience measurement.';
const blocker='One of your browser extensions seems to be blocking the video player from loading. To watch this content, you may need to disable it on this site.';

test('France24 publisher controls and repeated headline are removed without shortening the report',()=>{
  const title='Four soldiers dead, dozens injured in fire at Canada military base';
  const body="Four soldiers were killed and dozens injured in a fire at a military base in Alberta province, Prime Minister Mark Carney said Sunday.";
  const text=[player,blocker,title,'Issued on:','19/10/2026 - 10:41','Share',body].join('\n\n');
  assert.equal(cleanArticleText(text,[title]),body);
});
test('old translated editions are cleaned immediately, including combined metadata labels',()=>{
  const title='Премьер Франции заявил о протестах';
  const text=['Чтобы отобразить этот контент с YouTube, вы должны включить отслеживание рекламы и измерение аудитории.',
    'Одно из расширений вашего браузера, похоже, блокирует загрузку видеоплеера. Чтобы посмотреть этот контент, вам может потребоваться отключить его на этом сайте.',
    title,'Выпущено: Изменено:','2026-10-19 12:30','Поделиться','Французский премьер выступил в парламенте.'].join('\n\n');
  assert.equal(cleanArticleText(text,[title]),'Французский премьер выступил в парламенте.');
});
test('real reporting about YouTube, blocking, sharing, and dates remains exact',()=>{
  const text=['Парламент обсуждает блокировку YouTube и рекламных сервисов.',
    'One of your browser extensions was cited in a government security report.',
    'Поделиться результатами переговоров министр обещал завтра.',
    '«Поделиться» — так называлась инициатива партии.',
    '19/10/2026','10:41','Subscribe to the opposition newspaper, the candidate urged.'].join('\n\n');
  assert.equal(cleanArticleText(text),text);
});
test('date cleanup is contextual, preserves subsequent paragraphs and is idempotent',()=>{
  const text='Issued on:\n\n19/10/2026 - 10:41\n\nReport.\n\n2026-10-19\n\nQuoted date.';
  const cleaned='Report.\n\n2026-10-19\n\nQuoted date.';
  assert.equal(cleanArticleText(text),cleaned);assert.equal(cleanArticleText(cleaned),cleaned);
  assert.equal(cleanArticleText(null),'');
});

test('short standalone visual credits are removed, while agency reporting and quotes remain',()=>{
  const captions=[
    'An election billboard featuring Israeli Prime Minister Benjamin Netanyahu is displayed in Ramat Gan, near Tel Aviv, Israel, on October 18, 2026. /VCG',
    'Избирательный билборд с участием премьер-министра Израиля Биньямина Нетаньяху выставлен в Рамат-Гане, недалеко от Тель-Авива, Израиль, 18 октября 2026 года. /VCG/',
    'Workers are pictured at a factory in Beijing. /CFP/',
    'A file photo of the parliament building. /Xinhua/',
    'На фото: здание парламента. /Синьхуа/',
  ];
  for(const caption of captions){assert.equal(isPhotoCaption(caption),true,caption);assert.equal(cleanArticleText(caption+'\n\nThe government announced a new policy.'),'The government announced a new policy.');}
  const reporting=[
    'Xinhua reported that lawmakers approved the budget.',
    '(With input from Xinhua)',
    '(перенаправлено с «Xinhua»)',
    'По данным агентства Синьхуа, переговоры продолжатся завтра.',
    'The government announced a new policy. /Xinhua/',
    'Стороны обсудили сотрудничество. /Синьхуа/',
    '«Это важное соглашение», — заявил министр. /VCG/',
    'Policy detail. '.repeat(45)+'/VCG/',
  ];
  for(const paragraph of reporting){assert.equal(isPhotoCaption(paragraph),false,paragraph);assert.equal(cleanArticleText(paragraph),paragraph);}
});
