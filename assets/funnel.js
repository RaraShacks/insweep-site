import {createFunnelEvent} from './funnel-core.mjs';

const initialized=new WeakSet();
const TELEGRAM='https://t.me/+OGSgiII0NUNjNTI6';
const RESULT_IDS={
 '/practice/':['victory-panel','assessment-feedback'],
 '/practice/index.html':['victory-panel','assessment-feedback'],
 '/practice/leverage.html':['lesson-complete'],
 '/practice/review.html':['review-feedback']
};

function visible(element,view){
 for(let current=element;current;current=current.parentElement){
  if(current.hidden)return false;
  const style=view.getComputedStyle(current);
  if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;
 }
 return true;
}

/** Install once per document. Events stay on this document; no collector is connected. */
export function initFunnel(doc=globalThis.document){
 if(!doc||initialized.has(doc))return false;
 initialized.add(doc);
 const ready=()=>{
  const view=doc.defaultView;
  if(!view)return;
  const path=doc.location.pathname;
  const emit=(event,placement)=>{
   const detail=createFunnelEvent({event,path,placement});
   if(detail)doc.dispatchEvent(new view.CustomEvent('insweep:analytics',{detail}));
  };
  emit('page_view');
  doc.addEventListener('click',event=>{
   const target=event.target;
   if(typeof target?.closest!=='function')return;
   const anchor=target.closest('a');
   if(anchor&&(anchor.hasAttribute('data-telegram')||anchor.getAttribute('href')===TELEGRAM)){
    emit('telegram_click',anchor.closest('[data-placement]')?.getAttribute('data-placement'));
   }
   if(target.closest('#start-mission'))emit('practice_start');
  },true);
  doc.addEventListener('submit',event=>{
   if(event.target?.matches?.('form[data-calculator]'))emit('calculator_submit');
  },true);

  const cta=doc.getElementById('practice-next-step');
  const panels=(RESULT_IDS[path]??[]).map(id=>doc.getElementById(id)).filter(Boolean);
  if(!cta||!panels.length)return;
  const activePanel=()=>{
   // Specific assessment feedback takes precedence over the general mission
   // panel when both are visible. The CTA stays outside rerendered content.
   let active=null;
   for(const panel of panels)if(visible(panel,view))active=panel;
   return active;
  };
  const placeAfter=panel=>{
   if(!panel)return;
   // Keep the review's next exercise action ahead of the optional channel invite.
   const anchor=path==='/practice/review.html'?(doc.getElementById('review-next')??panel):panel;
   if(cta.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',cta);
  };
  const initialPanel=activePanel();
  let wasVisible=Boolean(initialPanel);
  placeAfter(initialPanel);
  cta.hidden=!wasVisible;
  const observer=new view.MutationObserver(()=>{
   const panel=activePanel();
   const isVisible=Boolean(panel);
   placeAfter(panel);
   if(cta.hidden===isVisible)cta.hidden=!isVisible;
   // A display transition may be any exercise outcome. Existing saved feedback
   // on first render reveals the CTA without claiming a new result/completion.
   if(isVisible&&!wasVisible)emit('practice_result','result');
   wasVisible=isVisible;
  });
  const observed=new Set();
  for(const panel of panels){
   for(let current=panel;current;current=current.parentElement){
    if(observed.has(current))continue;
    observed.add(current);
    observer.observe(current,{attributes:true,attributeFilter:['hidden','class','style']});
   }
  }
 };
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',ready,{once:true});
 else ready();
 return true;
}

if(typeof document!=='undefined')initFunnel(document);
