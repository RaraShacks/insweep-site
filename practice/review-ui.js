(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.InsweepReviewUI = api;
    if (root.document) api.mount(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TASK_KEY = 'insweep-review-task-v1';
  const STATUS = {unseen:'Ещё не проверяли', 'needs-practice':'Нужна практика', waiting:'Проверено сейчас · ждём паузу', due:'Пора проверить', rechecked:'Повторно проверено'};
  const isNumber = n => typeof n === 'number' && Number.isFinite(n);
  function validateData(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.episodes) || !data.episodes.length) throw Error('Нет исторических участков.');
    const ids = new Set(); const times = new Set();
    data.episodes.forEach(ep => {
      if (!ep || typeof ep.id !== 'string' || !ep.id || ids.has(ep.id) || ep.symbol !== 'BTCUSDT' || ep.category !== 'spot' || !ep.source || !Number.isFinite(Date.parse(ep.fetchedAt)) || !Array.isArray(ep.candles) || ep.candles.length < 60) throw Error('Неверное описание исторического участка.');
      ids.add(ep.id);
      ep.candles.forEach((c, i) => {
        if (!c || c.closed !== true || !['time','open','high','low','close'].every(k=>isNumber(c[k])) || !['open','high','low','close'].every(k=>c[k] > 0) || c.high < Math.max(c.open,c.close) || c.low > Math.min(c.open,c.close) || c.high < c.low || (i && c.time-ep.candles[i-1].time !== 60000) || times.has(c.time)) throw Error('Свечи неполные, пересекаются или не закрыты.');
        times.add(c.time);
      });
    });
    return data.episodes;
  }
  function createController(deps) {
    const {model,store,storage,episodes} = deps;
    const now = deps.now || Date.now;
    const makeId = deps.id || (() => 'review-'+now()+'-'+Math.random().toString(36).slice(2));
    let active = null; let state; let blocked = ''; let localWarning = ''; let memoryOnly = false;
    function load() { state = store.load(); return state; }
    function save() {
      try { storage.setItem(TASK_KEY,JSON.stringify(active)); }
      catch (_) { memoryOnly = true; localWarning = 'Задача сохраняется только в этой вкладке. После закрытия факт помощи и ответ могут не сохраниться; знакомый участок останется тренировкой.'; }
    }
    function question() {
      const ep=active && episodes.find(e=>e.id===active.episodeId);
      return ep && model.questionFor(active.topicId,ep,active.variant);
    }
    function parse(raw) {
      const s=JSON.parse(raw);
      if (!s || s.version!==1 || typeof s.id!=='string' || !s.id || !model.TOPICS.some(t=>t.id===s.topicId) || !episodes.some(e=>e.id===s.episodeId) || !Number.isInteger(s.variant) || s.variant<0 || typeof s.fresh!=='boolean' || typeof s.assisted!=='boolean' || !Number.isSafeInteger(s.at) || s.at<0 || (s.answer!==null && !['string','number'].includes(typeof s.answer)) || (s.answer!==null && (!Number.isSafeInteger(s.answeredAt) || s.answeredAt<s.at))) throw Error('Invalid active task');
      const q=model.questionFor(s.topicId,episodes.find(e=>e.id===s.episodeId),s.variant);
      if (!q || !q.options || (s.answer!==null && !q.options.some(o=>String(o.value)===String(s.answer)))) throw Error('Invalid saved answer');
      return {version:1,id:s.id,topicId:s.topicId,episodeId:s.episodeId,variant:s.variant,fresh:s.fresh,assisted:s.assisted,at:s.at,answer:s.answer,answeredAt:s.answer===null?null:s.answeredAt};
    }
    function fresh() {
      return !!active && active.fresh && !state.events.some(e=>e.id===active.id+'-answer' && !e.fresh) && !state.events.some(e => e.episodeId===active.episodeId && (e.kind==='seen' || e.kind==='answer') && e.id!==active.id+'-seen' && e.id!==active.id+'-answer');
    }
    function reconcile() {
      if (!active) return;
      const own=state.events.find(e=>e.id===active.id+'-answer');
      const seen=state.events.find(e=>e.id===active.id+'-seen');
      const q=question();
      const selected=active.answer===null?null:q.options.find(o=>String(o.value)===String(active.answer));
      const wrongIdentity=e=>e.topic!==active.topicId || e.episodeId!==active.episodeId || e.exerciseId!==active.id || e.source!=='review';
      if ((seen && (seen.kind!=='seen' || wrongIdentity(seen))) || (own && (own.kind!=='answer' || wrongIdentity(own) || !selected || own.correct!==(selected.value===q.correct)))) {
        active=null;blocked='Сохранённая задача расходится с записанным результатом. Продолжение остановлено; начни другую задачу явно.';return;
      }
      if (own) active.assisted = active.assisted || own.assisted;
      // Stable IDs recover interrupted writes without replaying a completed attempt.
      if (!state.events.some(e=>e.id===active.id+'-seen')) state=store.append({id:active.id+'-seen',kind:'seen',topic:active.topicId,at:active.at,source:'review',episodeId:active.episodeId,exerciseId:active.id});
      if (active.answer!==null && !own) {
        const q=question(); const option=q.options.find(o=>String(o.value)===String(active.answer));
        state=store.append({id:active.id+'-answer',kind:'answer',topic:active.topicId,at:active.answeredAt,source:'review',correct:option.value===q.correct,assisted:active.assisted,exerciseId:active.id,episodeId:active.episodeId,fresh:fresh()});
      }
    }
    function readSaved() {
      if (memoryOnly) return;
      let raw;
      try { raw=storage.getItem(TASK_KEY); }
      catch (_) { memoryOnly=true;localWarning='Браузер не разрешает локальное сохранение. Результат доступен в этой вкладке; после закрытия он может не сохраниться.';return; }
      if (raw===null) {
        if (active) {blocked='Сохранённая задача исчезла. Продолжение остановлено, чтобы не выдать знакомую задачу за новую.';active=null;}
        return;
      }
      try {
        const restored=parse(raw);
        if (active && active.id===restored.id) {
          restored.assisted = restored.assisted || active.assisted;
          if (active.answer!==null && restored.answer===null) {restored.answer=active.answer;restored.answeredAt=active.answeredAt;}
        }
        active=restored;
      } catch (_) {active=null;blocked='Сохранённая задача повреждена или больше не соответствует данным. Исходная запись сохранена; начни другую задачу явно.';}
    }
    function select(topicId) {
      load(); const rec=topicId ? {topicId,mode:'practice'} : model.recommend(state,now());
      // All topics may be waiting: an early exercise is still available, without moving the due date.
      const topic=rec ? rec.topicId : model.TOPICS[0].id;
      const selection=model.selectEpisode(state,episodes);
      if (!selection || !selection.episode) {blocked='Сейчас нет доступного исторического участка. Вернись к учебному маршруту.';active=null;return view();}
      active={version:1,id:makeId(),topicId:topic,episodeId:selection.episode.id,variant:state.events.filter(e=>e.kind==='answer').length,fresh:selection.fresh===true,assisted:false,at:now(),answer:null,answeredAt:null};
      blocked='';save();reconcile();return view();
    }
    function view() {
      if (!state) load();
      const summaries=model.summarize(state,now());
      const history=state.events.filter(e=>(e.kind==='error'||(e.kind==='answer'&&!e.correct)) && e.at<=now()).slice(-8).reverse();
      return {unavailable:!!blocked || !active,message:blocked,warning:[localWarning,store.warning ? store.warning() : ''].filter(Boolean).join(' '),summaries,history,active,question:question(),episode:active&&episodes.find(e=>e.id===active.episodeId),fresh:fresh(),assisted:!!active&&active.assisted,answer:active&&active.answer,correct:active&&active.answer!==null ? question().options.find(o=>String(o.value)===String(active.answer)).value===question().correct : null};
    }
    function refresh() {load();readSaved();if (!blocked) reconcile();return view();}
    return {
      start() {load();readSaved();if (!active && !blocked) return select();if (!blocked) reconcile();return view();},
      refresh,view,
      help() {const displayedId=active&&active.id;refresh();if (!active || active.id!==displayedId) return view();if (active && active.answer===null) {active.assisted=true;save();}return view();},
      submit(value) {
        const displayedId=active&&active.id;
        refresh();if (!active || active.id!==displayedId || blocked || active.answer!==null) return view();
        const option=question().options.find(o=>String(o.value)===String(value));
        if (!option || value==='') return view();
        active.answer=option.value;active.answeredAt=now();save();reconcile();return view();
      },
      next(topicId) {refresh();if (blocked || !active || active.answer!==null) return select(topicId);return view();},
      restart() {return select();}
    };
  }
  function escape(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function date(at) {return new Date(at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' МСК';}
  function chart(episode) {
    const candles=episode.candles.slice(0,60); const lo=Math.min(...candles.map(c=>c.low)); const hi=Math.max(...candles.map(c=>c.high));
    const y=p=>142-(p-lo)/(hi-lo || 1)*122;
    let body='';
    for (let i=0;i<4;i++) body+='<path d="M 10 '+(20+i*40)+' H 590" class="chart-grid"/>';
    candles.forEach((c,i)=>{const x=14+i*9.6;const top=y(Math.max(c.open,c.close));body+='<g class="'+(c.close>=c.open?'candle-up':'candle-down')+'"><path d="M '+x+' '+y(c.high)+' V '+y(c.low)+'"/><rect x="'+(x-2.6)+'" y="'+top+'" width="5.2" height="'+Math.max(1,Math.abs(y(c.open)-y(c.close)))+'"/></g>';});
    return '<svg viewBox="0 0 600 164" role="img" aria-label="Первые 60 закрытых минут исторического участка BTCUSDT. Цена в конце '+candles[59].close+' USDT.">'+body+'</svg>';
  }
  async function mount(win) {
    const doc=win.document;const root=doc.getElementById('review-root');
    if (!root || root.dataset.mounted) return;
    root.dataset.mounted='true';
    const byId=id=>doc.getElementById(id);
    let controller;
    function render(v,focus) {
      byId('review-warning').textContent=v.warning || '';byId('review-warning').hidden=!v.warning;
      byId('review-loading').hidden=true;
      byId('review-unavailable').hidden=!v.unavailable;byId('review-task').hidden=v.unavailable;
      if (v.unavailable) {byId('review-unavailable-copy').textContent=v.message || 'Исторические данные недоступны.';byId('review-restart').hidden=!v.message.includes('задач');}
      byId('review-history-empty').hidden=v.history.length>0;
      byId('review-history').innerHTML=v.history.map(e=>'<li><strong>'+escape(win.InsweepReview.TOPICS.find(t=>t.id===e.topic).title)+'</strong><span>Проверка не пройдена · '+escape(date(e.at))+'</span></li>').join('');
      byId('review-topics').innerHTML=v.summaries.map(s=>'<li><div><strong>'+escape(s.title)+'</strong><span>'+escape(STATUS[s.status] || s.status)+'</span></div><small>'+(s.nextAt ? 'Следующая проверка: '+escape(date(s.nextAt)) : (s.lastAt ? 'Последняя проверка: '+escape(date(s.lastAt)) : 'Ответов пока нет'))+'</small></li>').join('');
      if (v.unavailable) return;
      const q=v.question;const answered=v.answer!==null;
      byId('review-topic').textContent=win.InsweepReview.TOPICS.find(t=>t.id===q.topicId).title;
      byId('review-fresh').textContent=v.fresh ? (v.assisted ? 'Новый участок · практика с подсказкой' : 'Новый участок · самостоятельная проверка') : (v.assisted ? 'Знакомый участок — тренировка с подсказкой' : 'Знакомый участок — тренировка');
      byId('review-prompt').textContent=q.prompt;
      byId('review-context').innerHTML=q.context.filter(c=>!c.includes('Следующие цены, уровни')).map(c=>'<li>'+escape(c)+'</li>').join('');
      byId('review-chart').innerHTML=chart(v.episode);
      const candles=v.episode.candles;
      byId('review-chart-caption').textContent='BTCUSDT · Bybit Spot · 1 мин · '+date(candles[0].time)+' — '+date(candles[59].time)+'. Показаны первые 60 закрытых свечей.';
      const source=v.episode.source;
      const endpoint=typeof source==='object' && typeof source.endpoint==='string' && /^https:\/\/(api\.bybit\.com|api\.bytick\.com)\//.test(source.endpoint) ? source.endpoint : 'https://bybit-exchange.github.io/docs/v5/market/kline';
      byId('review-source').innerHTML='<span>Bybit Spot · BTCUSDT · <a href="'+escape(endpoint)+'" target="_blank" rel="noopener">Источник данных ↗</a></span><details><summary>О получении данных</summary><p>Получено '+escape(date(Date.parse(v.episode.fetchedAt)))+'. Публичные исторические свечи.</p></details>';
      byId('review-options').innerHTML=q.options.map((o,i)=>'<label class="answer-option"><input type="radio" name="review-answer" value="'+escape(o.value)+'"'+(String(v.answer)===String(o.value)?' checked':'')+(answered?' disabled':'')+'><span><b>'+String.fromCharCode(65+i)+'</b>'+escape(o.label)+'</span></label>').join('');
      byId('review-submit').disabled=answered;byId('review-help').disabled=answered || v.assisted;
      byId('review-help-panel').hidden=!v.assisted;byId('review-help-panel').textContent=v.assisted?q.explanation:'';
      byId('review-feedback').hidden=!answered;
      byId('review-next').hidden=!answered;
      if (answered) {
        const result=!v.correct?'Пока не сошлось. Разберём один шаг.':v.assisted?'Верно с помощью. Следующий шаг — другая задача без подсказки.':!v.fresh?'Верно на знакомом участке. Это тренировка; перенос ещё не проверен.':'Верно без подсказки на новом участке.';
        byId('review-feedback-title').textContent=result;
        byId('review-feedback-copy').textContent=q.explanation;
        const summary=v.summaries.find(s=>s.id===q.topicId);
        byId('review-feedback-date').textContent=summary.nextAt ? 'Следующая самостоятельная проверка: '+date(summary.nextAt)+'. Ранние повторы не меняют эту дату.' : !v.correct?'Попробуй другую задачу по этой теме.':'Результат сохранён в локальной истории.';
        byId('review-next').textContent=v.correct?'Следующая задача →':'Другая задача по этой теме →';
      }
      byId('review-coach-image').src='assets/mascot-reactions/v1/'+(answered?(v.correct?(v.assisted?'practice':'direction'):'risk'):'risk')+'.png';
      byId('review-coach-copy').textContent=answered ? (v.correct?'Вот этот шаг проверен. Дальше — новый пример.':'Ошибка — повод разобраться. Посмотри на объяснение и попробуй другой пример.') : 'Сначала свой ответ. Если застрянешь — разберём шаг вместе.';
      if (focus && answered) byId('review-feedback').focus();
    }
    function fail() {
      byId('review-loading').hidden=true;byId('review-unavailable').hidden=false;byId('review-task').hidden=true;
      byId('review-unavailable-copy').textContent='Не удалось загрузить или проверить исторические участки. Обнови страницу, чтобы попробовать снова. Учебный маршрут остаётся доступен.';
      byId('review-restart').hidden=true;
    }
    try {
      if (!win.InsweepReview || !win.InsweepReviewStore) throw Error('Modules missing');
      const response=await win.fetch('review-market-data.json',{cache:'no-cache'});
      if (!response.ok) throw Error('Historical data unavailable');
      const episodes=validateData(await response.json());
      // Access to localStorage itself may throw in private/blocked browser contexts.
      let storage;try {storage=win.localStorage;} catch (_) {storage={getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');}};}
      controller=createController({model:win.InsweepReview,store:win.InsweepReviewStore,storage,episodes});
      render(controller.start());
      byId('review-answer-form').addEventListener('submit',event=>{
        event.preventDefault();const selected=doc.querySelector('input[name="review-answer"]:checked');
        if (!selected) {byId('review-answer-note').hidden=false;return;}
        byId('review-answer-note').hidden=true;render(controller.submit(selected.value),true);
      });
      byId('review-help').addEventListener('click',()=>render(controller.help()));
      byId('review-next').addEventListener('click',()=>{const v=controller.view();render(controller.next(v.correct?undefined:v.active.topicId));byId('review-prompt').focus();});
      byId('review-restart').addEventListener('click',()=>render(controller.restart()));
      const refresh=()=>{try {render(controller.refresh());} catch (_) {fail();}};
      win.addEventListener('pageshow',refresh);
      win.addEventListener('storage',event=>{if (!event.key || event.key===TASK_KEY || event.key===win.InsweepReview.STORAGE_KEY) refresh();});
    } catch (_) {fail();}
  }
  return {TASK_KEY,createController,validateData,mount};
});
