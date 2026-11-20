/* Local educational evidence only. No telemetry or account access. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = {createStore:factory};
  else root.InsweepReviewStore = factory({model:root.InsweepReview,storage:()=>root.localStorage});
})(typeof window === 'undefined' ? globalThis : window, function createStore(options) {
  'use strict';
  const {model,storage,now=()=>Date.now()}=options;
  if (!model || typeof model.recordEvent !== 'function') throw new TypeError('Review model is required');
  let memory=model.initialState(),readWarning='',writeWarning='',corrupt=false,readFailed=false;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const access=()=>typeof storage==='function'?storage():storage;
  function merge(left,right) {
    const events=new Map();
    for(const event of [...left.events,...right.events]) if(!events.has(event.id))events.set(event.id,event);
    const ordered=Array.from(events.values()).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)).slice(-1000);
    const seenEpisodeIds=Array.from(new Set([...(left.seenEpisodeIds||[]),...(right.seenEpisodeIds||[]),...[...left.events,...right.events].filter(e=>e.kind==='seen'||e.kind==='answer').map(e=>e.episodeId)]));
    return model.restoreState(JSON.stringify({version:1,events:ordered,seenEpisodeIds}))||left;
  }
  function load() {
    readFailed=false;
    try {
      const raw=access().getItem(model.STORAGE_KEY),saved=model.restoreState(raw);
      corrupt=saved===null;
      if(corrupt)readWarning='Учебная история повреждена. Исходное сохранение оставлено; новые проверки доступны только в памяти до закрытия страницы.';
      else {readWarning='';memory=merge(saved,memory);}
    } catch (_) {
      readFailed=true;
      readWarning='Учебная история недоступна. Новые проверки остаются только в памяти до закрытия страницы.';
    }
    return copy(memory);
  }
  function append(event) {
    memory=model.recordEvent(load(),event);
    if(!corrupt&&!readFailed) {
      try {access().setItem(model.STORAGE_KEY,JSON.stringify(memory));writeWarning='';}
      catch (_) {writeWarning='Не удалось сохранить учебную историю. Новые проверки остаются только в памяти до закрытия страницы.';}
    }
    return copy(memory);
  }
  function recordError(topic,source,context) {
    const text=String(context);
    let hash=2166136261;
    for(const ch of text){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return append({id:`error:${source}:${topic}:${hash>>>0}:${text.length}`,kind:'error',topic,at:now(),source});
  }
  return Object.freeze({load,append,recordError,warning:()=>[readWarning,writeWarning].filter(Boolean).join(' ')});
});
