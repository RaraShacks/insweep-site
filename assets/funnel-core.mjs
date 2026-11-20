// Bounded local event vocabulary. These hooks do not send or persist analytics.
const EVENTS=new Set(['page_view','practice_start','practice_result','telegram_click','calculator_submit']);
const PLACEMENTS=new Set(['header','menu','hero','footer','article','result','calculator','inline']);
const PRACTICE_PATHS=new Set(['/practice/','/practice/leverage.html','/practice/review.html']);
const PATHS=new Set([
 '/','/glossary/','/learn/','/learn/start/','/learn/position-size/','/learn/trading-plan/',
 '/tools/position-size/',...PRACTICE_PATHS,
 ...[
  'svechi-ohlc-taymfreym','long-short-pnl','market-limit-proskalzyvanie',
  'stop-loss-take-profit','razmer-pozitsii-risk','komissii-funding','plecho-marzha',
  'likvidatsiya-mark-last','tehnicheskiy-analiz-urovni','smart-money-struktura','smart-money-zony'
 ].map(slug=>`/glossary/${slug}/`)
]);

/** Return only known labels, never form input, query strings or arbitrary paths. */
export function createFunnelEvent(input){
 if(!input||typeof input!=='object')return null;
 const {event,placement}=input;
 if(!EVENTS.has(event)||typeof input.path!=='string')return null;
 let path=input.path.split(/[?#]/,1)[0];
 if(path.endsWith('/index.html'))path=path.slice(0,-10);
 if(!PATHS.has(path))return null;
 if((event==='practice_start'||event==='practice_result')&&!PRACTICE_PATHS.has(path))return null;
 if(event==='calculator_submit'&&path!=='/tools/position-size/')return null;
 return Object.freeze(PLACEMENTS.has(placement)?{event,path,placement}:{event,path});
}
