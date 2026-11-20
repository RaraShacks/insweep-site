/* Historical close-point practice; virtual positions only. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const {openPosition,closePosition}=window.InsweepPosition;
  const {validateLevels,calculatePlan,exitSignal,conditionMet}=window.InsweepPlan;
  const learning=window.InsweepLearning;
  const rewards=window.InsweepRewards;
  const mascot=window.InsweepMascot;
  const INITIAL_CASH=1000,FEE=.001,START_INDEX=59;
  const fmt=(n,d=2)=>Number(n).toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
  const money=n=>`${n>0?'+':n<0?'−':''}${fmt(Math.abs(n))} USDT`;
  const sideName=s=>s==='short'?'Шорт':'Лонг';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateFmt=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric'});
  const timeFmt=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hour12:false});
  const reasons={manual:'Ручной выход',stop:'Учебный стоп',target:'Учебная цель',episode_end:'Конец исторического эпизода'};
  const LESSONS=['intro','plan','practice','assessment'];
  const files={intro:'market-data.json',plan:'market-data.json',practice:'market-data-practice.json',assessment:'market-data-assessment.json'};
  const titles={intro:'Первое знакомство',plan:'План и риск',practice:'Практика с помощью',assessment:'Самостоятельный план'};
  const STORAGE_KEY='insweep-learning-v1';
  const REWARDS_KEY='insweep-rewards-v1';
  let rewardIds=[],gameReady=false;
  let rewardQueue=[],activeReward=null,rewardSequence=0,rewardTotal=0;
  const draftFields=['amount','stop-price','target-price','risk-budget','entry-condition','condition-price','plan-rationale','direction-prediction','assessment-side','answer-entry','answer-cancel','answer-loss','answer-sizing'];
  let data=null,timer=null,geometry=null,levelDrag=null,priceCursor=null,numericContext='',storageWarning='',loaded=false;
  const datasets={},dataErrors={},lessons={},datasetIds={},unavailableSnapshots={};
  for(const lesson of LESSONS)lessons[lesson]=freshState(lesson);
  let state=lessons.intro;
  function freshState(lesson='intro'){
    const draft=Object.fromEntries(draftFields.map(id=>[id,'']));
    draft.amount='100';if(lesson==='intro'||lesson==='plan'){draft['risk-budget']='5';draft['entry-condition']='now';}
    return {index:START_INDEX,startIndex:START_INDEX,attempt:0,cash:INITIAL_CASH,side:lesson==='assessment'?null:'long',lesson,stage:lesson==='intro'?'entry':'setup',setupStep:0,position:null,plan:null,trades:[],decisions:[],lastDecision:null,answer:null,pick:null,draft,progress:{tried:false,checked:false,mastered:false},quiz:{topic:'direction',variant:0,direction:false,fees:false,feedback:''},helpOpen:false,helpUsed:false,feedback:null,retryTopics:[],completedPlan:null};
  }
  function captureDraft(){for(const id of draftFields)state.draft[id]=$(id).value;}
  function applyDraft(){for(const id of draftFields)$(id).value=state.draft[id];}
  function identity(payload,file){
    let hash=2166136261;
    for(const c of payload.candles){for(const ch of `${c.time}:${c.close};`){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}}
    return `${file}:${payload.candles.length}:${payload.candles[0].time}:${payload.candles.at(-1).time}:${hash>>>0}`;
  }
  function storageNote(text){storageWarning=text;$('storage-note').textContent=text;$('storage-note').hidden=!text;}
  function persist(){
    if(!loaded)return;captureDraft();
    const snapshots={...unavailableSnapshots};for(const lesson of LESSONS){const payload=datasets[files[lesson]];if(payload)snapshots[lesson]={dataset:datasetIds[files[lesson]],state:lessons[lesson]};}
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,active:state.lesson,lessons:snapshots}));}
    catch{storageNote('Браузер не разрешил локальное сохранение. Можно продолжать, но после перезагрузки прохождение может потеряться.');}
  }
  function validSnapshot(s,lesson,payload){
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v),finite=n=>typeof n==='number'&&Number.isFinite(n),positive=n=>finite(n)&&n>0;
    if(!object(s)||s.lesson!==lesson||!Number.isInteger(s.startIndex)||s.startIndex<START_INDEX||s.startIndex>299||!Number.isInteger(s.attempt)||s.attempt<0||!Number.isInteger(s.index)||s.index<s.startIndex||s.index>=payload.candles.length||!finite(s.cash)||s.cash<0||!['long','short',null].includes(s.side)||(!s.side&&lesson!=='assessment')||!['entry','setup','armed','hold','review','quiz','decision'].includes(s.stage)||!Number.isInteger(s.setupStep)||s.setupStep<0||s.setupStep>2||!Array.isArray(s.trades)||!Array.isArray(s.decisions)||!object(s.draft)||!draftFields.every(id=>typeof s.draft[id]==='string'&&s.draft[id].length<=1000)||!object(s.progress)||!['tried','checked','mastered'].every(k=>typeof s.progress[k]==='boolean')||!object(s.quiz)||!['direction','fees'].includes(s.quiz.topic)||!Number.isInteger(s.quiz.variant)||s.quiz.variant<0||!['direction','fees'].every(k=>typeof s.quiz[k]==='boolean')||typeof s.quiz.feedback!=='string'||typeof s.helpOpen!=='boolean'||typeof s.helpUsed!=='boolean'||!Array.isArray(s.retryTopics)||!s.retryTopics.every(v=>typeof v==='string'))return false;
    const same=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<.0000001;
    function validPlan(p){
      if(!object(p)||!Number.isInteger(p.createdIndex)||p.createdIndex<START_INDEX||p.createdIndex>s.index||!same(p.createdAt,payload.candles[p.createdIndex].time+60000)||!same(p.referenceEntry,payload.candles[p.createdIndex].close)||typeof p.rationale!=='string')return false;
      try{validateLevels(p);conditionMet(p.condition,p.entry);}catch{return false;}
      return ['entry','stop','target','riskBudget','qty','allocated','entryFee','plannedLoss','plannedReward','rewardRisk'].every(k=>positive(p[k]))&&p.plannedLoss<=p.riskBudget+.000001;
    }
    function validPosition(p,trade=false){
      if(!object(p)||!['long','short'].includes(p.side)||!Number.isInteger(p.index)||p.index<START_INDEX||p.index>s.index||!same(p.entry,payload.candles[p.index].close)||!same(p.time,payload.candles[p.index].time+60000)||!['allocated','qty','notional','entryFee'].every(k=>positive(p[k]))||(p.plan&&!validPlan(p.plan))||(p.originalPlan&&!validPlan(p.originalPlan)))return false;
      const open=openPosition({side:p.side,amount:p.allocated,entry:p.entry,feeRate:FEE});
      if(!same(p.qty,open.qty)||!same(p.entryFee,open.entryFee)||!same(p.notional,open.notional))return false;
      if(trade){
        if(!Number.isInteger(p.exitIndex)||p.exitIndex<p.index||p.exitIndex>s.index||!same(p.exit,payload.candles[p.exitIndex].close)||!same(p.exitTime,payload.candles[p.exitIndex].time+60000)||!Object.hasOwn(reasons,p.exitReason))return false;
        const result=closePosition(p,p.exit,FEE);if(!Object.keys(result).every(k=>same(result[k],p[k])))return false;
      }
      return true;
    }
    if((s.plan&&!validPlan(s.plan))||(s.position&&!validPosition(s.position))||!s.trades.every(t=>validPosition(t,true))||!s.decisions.every(d=>object(d)&&validPlan(d.plan)&&['cancelled','skipped','expired'].includes(d.kind)&&positive(d.price)&&finite(d.time)&&typeof d.conditionMet==='boolean'))return false;
    if((s.stage==='hold')!==!!s.position||s.stage==='armed'&&!s.plan||s.stage==='review'&&!s.trades.length||s.stage==='decision'&&!s.lastDecision||s.stage==='quiz'&&(!s.trades.length||lesson!=='intro'))return false;
    if(!same(s.cash,INITIAL_CASH+s.trades.reduce((sum,t)=>sum+t.pnl,0)-(s.position?.allocated||0)))return false;
    if(s.progress.mastered&&(!s.progress.checked||(lesson==='intro'&&(!s.quiz.direction||!s.quiz.fees))||(lesson==='assessment'&&s.helpUsed)))return false;
    if(lesson==='intro'&&!['entry','hold','review','quiz'].includes(s.stage)||lesson!=='intro'&&!['setup','armed','hold','review','decision'].includes(s.stage))return false;
    if(s.progress.mastered&&lesson!=='intro'){
      const p=s.plan;if(!p)return false;
      const result=learning.assessPlan({plan:p,answers:{entryKind:s.draft['answer-entry'],cancelAt:s.draft['answer-cancel'],loss:Number(s.draft['answer-loss']),sizing:s.draft['answer-sizing']},task:learning.taskFor(lesson,payload.candles[s.startIndex].close)});
      if(!result.passed)return false;
    }
    if(s.completedPlan!==null&&s.completedPlan!==undefined){
      const proof=s.completedPlan;
      if(!object(proof)||!validPlan(proof.plan)||!object(proof.answers)||!Number.isInteger(proof.referenceIndex)||proof.referenceIndex<START_INDEX||proof.referenceIndex>s.index||!learning.assessPlan({plan:proof.plan,answers:proof.answers,task:learning.taskFor(lesson,payload.candles[proof.referenceIndex].close)}).passed)return false;
    }
    if(s.feedback!==null&&(!object(s.feedback)||typeof s.feedback.passed!=='boolean'||!Array.isArray(s.feedback.checks)||!s.feedback.checks.every(c=>object(c)&&typeof c.id==='string'&&typeof c.ok==='boolean'&&typeof c.message==='string')||!Array.isArray(s.feedback.needs)))return false;
    return true;
  }
  function restore(){
    try{
      const raw=window.localStorage.getItem(STORAGE_KEY);if(!raw)return;
      const saved=JSON.parse(raw);
      if(!saved||saved.version!==1||!LESSONS.includes(saved.active)||!saved.lessons||typeof saved.lessons!=='object')throw new Error('schema');
      for(const [lesson,snapshot] of Object.entries(saved.lessons)){
        if(!LESSONS.includes(lesson)||!snapshot||typeof snapshot.dataset!=='string')throw new Error('schema');
        const payload=datasets[files[lesson]];
        if(payload){if(snapshot.dataset!==datasetIds[files[lesson]]||!validSnapshot(snapshot.state,lesson,payload))throw new Error('state');lessons[lesson]=snapshot.state;lessons[lesson].pick=null;}
        else unavailableSnapshots[lesson]=snapshot;
      }
      state=lessons[saved.active];
    }catch{for(const lesson of LESSONS){lessons[lesson]=freshState(lesson);delete unavailableSnapshots[lesson];}state=lessons.intro;storageNote('Сохранение повреждено, несовместимо или недоступно. Открыто новое прохождение; старые значения не применены.');}
  }
  const candle=()=>data.candles[state.index];
  const quote=()=>candle().close;
  const stamp=c=>c.time+60000;
  const ended=()=>state.index>=data.candles.length-1;
  const levelsEditable=()=>!!data&&['long','short'].includes(state.side)&&state.lesson!=='intro'&&state.stage==='setup'&&(state.lesson!=='plan'||state.setupStep===0);
  const replayAllowed=()=>data&&!(state.lesson!=='intro'&&state.stage==='setup')&&!(state.lesson==='intro'&&state.stage==='entry')&&!ended();
  function fail(text){$('action-error').textContent=text;$('action-error').hidden=false;renderCoach();}
  function clearError(){$('action-error').hidden=true;}
  function renderPersonalPractice(){
    const model=window.InsweepReview,store=window.InsweepReviewStore;
    if(!model||!store)return;
    const history=store.load(),next=model.recommend(history,Date.now());
    const topic=next&&model.TOPICS.find(t=>t.id===next.topicId);
    $('personal-practice-copy').textContent=next?.mode==='recheck'?`Пора проверить снова: ${topic.title}. Новая задача без подсказки после паузы.`:next?.mode==='practice'?`Недавняя проверка: ${topic.title}. Разберём тему на другом участке истории.`:history.events.some(e=>e.kind==='answer')?'Можно проверить другую тему или вернуться после паузы. Прогресс коротких проверок — внутри практики.':'Ошибок пока не записано. Можно начать с короткой проверки на другом участке истории.';
    $('personal-practice-warning').textContent=store.warning();$('personal-practice-warning').hidden=!store.warning();
  }
  function recordCheckError(topic,context){
    const store=window.InsweepReviewStore;if(!store)return;
    if(!state.reviewAttempt)state.reviewAttempt=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    store.recordError(topic,state.lesson,JSON.stringify([state.reviewAttempt,context]));persist();renderPersonalPractice();
  }
  function recordPlanChecks(p,result){
    const wrong=new Set(result.checks.filter(c=>!c.ok).map(c=>c.id)),a=answers();
    const context=[state.startIndex,state.stage,state.draft['assessment-side'],$('stop-price').value,$('target-price').value,$('risk-budget').value,$('entry-condition').value,$('condition-price').value,a];
    if(wrong.has('direction')&&['long','short'].includes(p.side))recordCheckError('direction',context);
    const numericLevels=[p.entry,p.stop,p.target].every(n=>Number.isFinite(n)&&n>0);
    if(wrong.has('levels')&&numericLevels)recordCheckError('levels',context);
    const validLevels=result.checks.some(c=>c.id==='levels'&&c.ok);
    if(validLevels&&wrong.has('condition')&&['above','below'].includes(p.condition?.kind)&&Number.isFinite(p.condition.price)&&p.condition.price>0)recordCheckError('condition',context);
    if(validLevels&&wrong.has('entry')&&a.entryKind&&result.checks.some(c=>c.id==='condition'&&c.ok))recordCheckError('condition',context);
    if(validLevels&&wrong.has('cancel')&&a.cancelAt)recordCheckError('levels',context);
    if(wrong.has('loss')&&Number.isFinite(p.plannedLoss)&&p.plannedLoss>0&&$('answer-loss').value.trim()&&Number.isFinite(a.loss))recordCheckError('loss',context);
    if(wrong.has('sizing')&&a.sizing)recordCheckError('sizing',context);
  }
  function stop(){if(timer)clearInterval(timer);timer=null;if(data)renderPlayback();}
  function play(){if(!replayAllowed())return;if(timer){stop();renderLesson();return;}timer=setInterval(advance,Number($('speed').value));renderPlayback();renderLesson();}
  function advance(){
    if(!replayAllowed())return;
    state.index++;
    if(state.position?.plan){const reason=exitSignal(state.position.plan,quote());if(reason){closeTrade(reason);return;}}
    if(state.stage==='armed'&&exitSignal(state.plan,quote())){recordDecision('cancelled');return;}
    if(ended()){
      stop();
      if(state.position){closeTrade('episode_end');return;}
      if(state.stage==='armed'){recordDecision('expired');return;}
    }
    render();
  }
  function beginLesson(lesson){
    if(!LESSONS.includes(lesson))return;
    stop();captureDraft();clearError();if(levelDrag){const pointerId=levelDrag.pointerId;levelDrag=null;if($('chart').hasPointerCapture(pointerId))$('chart').releasePointerCapture(pointerId);}
    state=lessons[lesson];
    data=datasets[files[lesson]]||null;geometry=null;priceCursor=null;applyDraft();render();persist();
  }
  function focusChart(kind){
    if(!levelsEditable())return;
    state.pick=kind||null;priceCursor=null;renderLesson();draw();
    $('chart-level-tools').scrollIntoView({behavior:'smooth',block:'start'});
    $('chart').focus({preventScroll:true});
  }
  function continueLevels(){
    const missing=!$('stop-price').value.trim()?'stop':!$('target-price').value.trim()?'target':null;
    if(missing)focusChart(missing);else advanceSetup();
  }
  function resetAttempt(lesson,moveCheckpoint=false){
    const old=lessons[lesson],next=freshState(lesson);
    // Keep observed account history within an episode; fresh control attempts
    // return to the hidden-future boundary and use a clean virtual account.
    if(lesson!=='assessment'){
      for(const k of ['index','startIndex','cash','trades','decisions','completedPlan','retryTopics'])next[k]=old[k];
      if(next.retryTopics.length){next.helpOpen=true;next.helpUsed=true;}
    }
    else if(moveCheckpoint){next.attempt=old.attempt+1;next.startIndex=START_INDEX+60*(next.attempt%5);next.index=next.startIndex;}
    lessons[lesson]=next;state=next;
  }
  function newPlan(){if(state.lesson==='assessment'){freshAssessment();return;}resetAttempt(state.lesson);applyDraft();clearError();render();}
  function freshAssessment(){stop();captureDraft();resetAttempt('assessment',true);data=datasets[files.assessment]||null;applyDraft();clearError();render();}
  function invalidatePlan(){if(state.lesson!=='intro'&&['setup','armed'].includes(state.stage)){state.feedback=null;state.progress.mastered=false;if(state.stage==='setup')state.plan=null;}}
  function task(){return learning.taskFor(state.lesson,data.candles[state.startIndex].close);}
  function answers(){return {entryKind:$('answer-entry').value,cancelAt:$('answer-cancel').value,loss:Number($('answer-loss').value),sizing:$('answer-sizing').value};}
  function candidate(){
    let p;try{p=draftPlan();}catch{p=levelInput();}
    return {...p,riskBudget:Number($('risk-budget').value),condition:entryCondition(),rationale:$('plan-rationale').value.trim()};
  }
  function assess(independent=false){
    const p=state.stage==='armed'?state.plan:candidate(),result=learning.assessPlan({plan:p,answers:answers(),task:task()});
    recordPlanChecks(p,result);
    state.progress.tried=true;state.progress.checked=true;state.feedback=result;
    if(result.passed){
      state.progress.mastered=!state.helpUsed;
      if(!independent&&state.stage==='setup')state.plan={...p,referenceEntry:quote(),createdAt:stamp(candle()),createdIndex:state.index};
      if(independent){state.plan=Object.freeze({...p,referenceEntry:quote(),createdAt:stamp(candle()),createdIndex:state.index});state.stage='armed';}
      if(state.progress.mastered)state.completedPlan={plan:{...state.plan},answers:{...answers()},referenceIndex:state.startIndex};
    }else{state.progress.mastered=false;if(state.lesson==='assessment')state.helpUsed=true;}
    render();
  }
  function answerQuiz(value){
    const q=learning.questionFor(state.quiz.topic,state.trades.at(-1).side,state.quiz.variant,state.trades.at(-1));
    state.progress.checked=true;
    if(value===q.correct){
      state.quiz[state.quiz.topic]=true;state.quiz.feedback='Верно. '+q.explanation;
      if(state.quiz.direction&&state.quiz.fees){state.progress.mastered=true;}
      else{state.quiz.topic='fees';state.quiz.variant=0;}
    }else{recordCheckError(state.quiz.topic,[state.trades.length,state.index,state.quiz.topic,state.quiz.variant,value]);state.quiz.feedback=q.explanation+' Попробуй изменённый похожий вопрос.';state.quiz.variant++;}
    render();
  }
  function levelInput(){return {side:state.side,entry:quote(),stop:Number($('stop-price').value),target:Number($('target-price').value)};}
  function draftPlan(){return calculatePlan({...levelInput(),riskBudget:Number($('risk-budget').value),availableCash:state.cash,feeRate:FEE});}
  function levelError(){return state.side==='long'?'Для лонга стоп должен быть ниже текущей цены, а цель — выше. Проверь оба уровня.':'Для шорта стоп должен быть выше текущей цены, а цель — ниже. Проверь оба уровня.';}
  function preview(){try{return draftPlan();}catch{return null;}}
  function entryCondition(){return {kind:$('entry-condition').value,price:$('entry-condition').value==='now'?null:Number($('condition-price').value)};}
  function conditionText(c){return c.kind==='now'?'На текущей раскрытой цене':`Цена ${c.kind==='above'?'не ниже':'не выше'} ${fmt(c.price)} USDT`;}
  function advanceSetup(){
    clearError();state.progress.tried=true;
    if(state.setupStep===0){try{validateLevels(levelInput());}catch{if([$('stop-price').value,$('target-price').value].every(v=>v.trim()&&Number(v)>0))recordCheckError('levels',[$('stop-price').value,$('target-price').value,state.side]);return fail(levelError());}state.setupStep=1;state.pick=null;}
    else if(state.setupStep===1){
      const p=preview();
      if(!p)return fail('Укажи положительный учебный бюджет риска. Для этих уровней должен получиться ненулевой объём.');
      if(p.plannedReward<=0){recordCheckError('fees',[p.entry,p.stop,p.target,p.riskBudget]);return fail('При этой цели комиссии превышают движение в твою пользу. Вернись к уровням и выбери цель с положительным результатом после расходов.');}
      state.setupStep=2;
    }else{
      const p=preview();if(!p||p.plannedReward<=0)return fail('Проверь уровни и учебный бюджет риска.');
      const condition=entryCondition();
      try{conditionMet(condition,quote());}catch{return fail('Введи положительную цену для условия входа.');}
      if(condition.kind!=='now'&&(condition.price<=Math.min(p.stop,p.target)||condition.price>=Math.max(p.stop,p.target))){recordCheckError('condition',[p.entry,p.stop,p.target,condition]);return fail('Цена условия входа должна быть между стопом и целью.');}
      state.plan=Object.freeze({...p,referenceEntry:quote(),condition:Object.freeze(condition),rationale:$('plan-rationale').value.trim(),createdAt:stamp(candle()),createdIndex:state.index});
      state.stage='armed';state.pick=null;
    }
    render();
  }
  function enter(){
    if(!data||state.position||ended())return;
    let position,plan=null;
    if(state.lesson!=='intro'){
      if(state.stage!=='armed'||!conditionMet(state.plan.condition,quote()))return fail('Условие входа ещё не выполнено. Можно подождать или пропустить этот план.');
      if(exitSignal(state.plan,quote())){recordDecision('cancelled');return;}
      try{plan=calculatePlan({...state.plan,entry:quote(),availableCash:state.cash,feeRate:FEE});}catch{return fail('По новой цене объём не помещается в учебные ограничения. Пропусти этот план и составь новый.');}
      if(plan.plannedReward<=0)return fail('После изменения цены до цели не хватает хода для покрытия комиссий. Пропусти этот план.');
      plan=Object.freeze({...state.plan,...plan,entryConditionMet:true});
      position=openPosition({side:plan.side,amount:plan.allocated,entry:quote(),feeRate:FEE});
      position.qty=plan.qty;
    }else{
      if($('direction-prediction').value!==(state.side==='long'?'higher':'lower')){if($('direction-prediction').value)recordCheckError('direction',[state.index,state.side,$('direction-prediction').value]);return fail('Для лонга помогает рост цены, для шорта — снижение. Исправь прогноз до открытия.');}
      state.progress.tried=true;
      const amount=Number($('amount').value);
      if(!Number.isFinite(amount)||amount<1)return fail('Для знакомства введи сумму от 1 учебного USDT.');
      if(amount>state.cash)return fail(`Доступно ${fmt(state.cash)} учебных USDT. Уменьши сумму.`);
      position=openPosition({side:state.side,amount,entry:quote(),feeRate:FEE});
    }
    clearError();stop();state.position={...position,plan,originalPlan:plan?state.plan:null,time:stamp(candle()),index:state.index};
    state.cash-=position.allocated;state.stage='hold';render();
  }
  function closeTrade(reason='manual'){
    if(!state.position||(!state.position.plan&&state.index<=state.position.index))return;
    stop();clearError();const p=state.position,result=closePosition(p,quote(),FEE);
    state.trades.push(Object.freeze({...p,...result,exit:quote(),exitTime:stamp(candle()),exitIndex:state.index,exitReason:reason}));
    state.cash+=result.settlement;state.position=null;state.stage='review';state.answer=null;render();
  }
  function recordDecision(kind){
    stop();clearError();const decision=Object.freeze({kind,plan:state.plan,price:quote(),time:stamp(candle()),conditionMet:conditionMet(state.plan.condition,quote())});
    state.decisions.push(decision);state.lastDecision=decision;state.stage='decision';render();
  }
  function sampleLevels(){
    invalidatePlan();const sign=state.side==='long'?1:-1;
    $('stop-price').value=(quote()*(1-sign*.004)).toFixed(2);$('target-price').value=(quote()*(1+sign*.008)).toFixed(2);
    $('levels-note').textContent='Это пример уровней для изучения механики. Он не оценивает рыночную ситуацию.';state.pick=null;clearError();render();
  }
  function renderPlayback(){
    const allowed=replayAllowed();
    $('play-button').textContent=timer?'Ⅱ':'▶';$('play-button').setAttribute('aria-label',timer?'Остановить историю':'Запустить историю');
    $('play-button').disabled=!allowed;$('step-button').disabled=!allowed;
    $('replay-label').textContent=ended()?'Эпизод завершён':!allowed?(state.lesson==='intro'?'Сначала выбери направление и прогноз':'Сначала составь план'):timer?'Идёт историческое время':'Время остановлено';
    $('replay-count').textContent=`${state.index-state.startIndex} из ${data.candles.length-1-state.startIndex} минут`;
  }
  function estimateIntro(){
    const amount=Number($('amount').value),n=amount/(1+FEE);
    $('order-estimate').textContent=Number.isFinite(amount)&&amount>0?`≈ ${fmt(n/quote(),8)} BTC · комиссия входа ${fmt(n*FEE)} USDT внутри суммы`:'Введи положительную учебную сумму.';
    document.querySelectorAll('[data-amount]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.amount)===amount));
  }
  function planSummary(p){return `<div><span>Плановый убыток на стопе</span><strong>−${fmt(p.plannedLoss)} USDT</strong></div><div><span>Результат на цели</span><strong>${money(p.plannedReward)}</strong></div><div><span>Объём · ${fmt(p.qty,8)} BTC</span><strong>${fmt(p.allocated)} USDT</strong></div><div><span>Прибыль / риск с расходами</span><strong>${fmt(p.rewardRisk)} : 1</strong></div>${p.capitalLimited?'<p>Объём ограничен доступными средствами без плеча. Поэтому используется часть бюджета риска.</p>':''}`;}
  function render(){
    if(!data){renderUnavailable();return;}
    $('chart-error').hidden=true;
    $('price').textContent=fmt(quote());$('market-date').textContent=dateFmt.format(stamp(candle()));$('market-time').textContent=`${timeFmt.format(stamp(candle()))} МСК · 1 минута`;
    $('cash').innerHTML=`${fmt(state.cash)} <small>учебных USDT</small>`;
    $('holding-label').textContent=state.position?`Выделено · ${sideName(state.position.side)}`:'Выделено на позицию';
    $('holding').innerHTML=`${fmt(state.position?.allocated||0)} <small>USDT</small>`;
    $('result-label').textContent=state.position?'Если закрыть сейчас':'Результат последней сделки';
    $('result').textContent=state.position?money(closePosition(state.position,quote(),FEE).pnl):state.trades.length?money(state.trades.at(-1).pnl):'—';
    $('amount').max=state.cash.toFixed(2);
    document.querySelectorAll('[data-lesson]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.lesson===state.lesson));b.disabled=false;});
    document.querySelectorAll('#direction-controls [data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===state.side)));
    renderPlayback();estimateIntro();renderLesson();renderHistory();renderReview();draw();persist();renderPersonalPractice();
  }
  function loadRewards(){
    try{const saved=JSON.parse(window.localStorage.getItem(REWARDS_KEY));rewardIds=saved?.version===1&&Array.isArray(saved.earned)?saved.earned:[];}
    catch{rewardIds=[];}
  }
  function leverageMastered(){
    try{const model=window.InsweepLeverage;return !!model&&model.isComplete(model.restoreState(window.localStorage.getItem(model.STORAGE_KEY)));}
    catch{return false;}
  }
  function showMascot(imageId,copyId,reaction,containerId){
    if(!reaction)return;
    $(imageId).src=reaction.image;$(copyId).textContent=reaction.text;
    if(containerId){const panel=$(containerId);panel.dataset.reaction=reaction.id;panel.dataset.emotion=reaction.emotion;panel.dataset.pose=reaction.pose;}
  }
  function renderCoach(){
    if(!mascot)return;
    const hasError=!$('action-error').hidden||state.feedback?.passed===false||(state.stage==='quiz'&&!!state.quiz.feedback&&!state.quiz.feedback.startsWith('Верно'));
    const conditionReady=!!data&&state.stage==='armed'&&conditionMet(state.plan.condition,quote());
    showMascot('coach-mascot','coach-copy',mascot.getCoach({lesson:state.lesson,stage:state.stage,setupStep:state.setupStep,mastered:!!state.progress.mastered,hasError,conditionReady}),'coach-card');
  }
  function presentReward(){
    if(activeReward||!rewardQueue.length)return;
    activeReward=rewardQueue.shift();rewardSequence++;
    const reaction=mascot?.getReaction(activeReward.id);
    $('reward-toast-title').textContent=`${activeReward.title} +${activeReward.xp} XP`;
    $('reward-toast-detail').textContent=activeReward.description;
    $('reward-praise').textContent='';
    showMascot('reward-mascot','reward-praise',reaction,'reward-toast');
    $('reward-mascot').hidden=!reaction;
    $('reward-count').textContent=rewardTotal>1?`${rewardSequence} / ${rewardTotal}`:'';
    $('dismiss-reward').setAttribute('aria-label',rewardQueue.length?'Следующая награда':'Закрыть уведомление о награде');
    $('reward-toast').hidden=false;
  }
  function renderGame(){
    const leverageDone=leverageMastered();
    const result=rewards.collect({...lessons,leverage:{progress:{mastered:leverageDone}}},rewardIds),changed=rewardIds.join('|')!==result.earned.join('|');
    rewardIds=result.earned;
    if(changed){try{window.localStorage.setItem(REWARDS_KEY,JSON.stringify({version:1,earned:rewardIds}));}catch{}}
    $('xp-total').textContent=String(result.xp);$('level-number').textContent=String(result.level);
    $('rank-name').textContent=result.levelName;
    $('rank-caption').textContent=result.nextLevelXP===null?`${result.xp} XP · все уровни открыты`:`${result.xp} / ${result.nextLevelXP} XP`;
    $('rank-progress').style.width=`${result.percent}%`;$('rank-meter').setAttribute('aria-valuenow',String(result.percent));
    const quest=Math.min(3,rewardIds.length);
    $('quest-label').textContent=quest===3?'Первый набор собран! Пополняй коллекцию.':'Твоя первая цель: собери 3 значка';
    $('quest-count').textContent=`${quest} / 3`;$('quest-progress').style.width=`${quest/3*100}%`;$('quest-meter').setAttribute('aria-valuenow',String(quest));
    const milestones={intro:'intro-mastered',plan:'frozen-plan',practice:'practice',assessment:'independent'};
    const descriptions={intro:'Направление и расходы',plan:'Стоп, цель и риск',practice:'Попробуй с опорой',assessment:'Новый участок. Твой план'};
    document.querySelectorAll('[data-lesson]').forEach(b=>{const lesson=b.dataset.lesson,done=rewardIds.includes(milestones[lesson]);b.classList.toggle('is-complete',done);b.innerHTML=`<span class="mission-number">${done?'✓':LESSONS.indexOf(lesson)+1}</span><span class="mission-copy"><strong>${esc(titles[lesson])}</strong><small>${done?(lesson==='plan'?'План записан':'Проверка пройдена'):descriptions[lesson]}</small></span><span class="mission-state" aria-hidden="true">${done?'✦':'→'}</span>`;});
    $('achievement-count').textContent=`${rewardIds.length} / ${rewards.catalog.length}`;
    $('leverage-status').textContent=leverageDone?'Проверки пройдены · можно повторить':'Три опыта: от количества BTC к денежному риску';
    $('leverage-link').classList.toggle('is-complete',leverageDone);
    $('achievement-list').innerHTML=rewards.catalog.map(item=>{const earned=rewardIds.includes(item.id);return `<article class="achievement-card${earned?' is-earned':''}"><span class="achievement-icon" aria-hidden="true">${item.icon}</span><strong>${esc(item.title)}</strong><p>${esc(item.description)}</p><span class="achievement-xp">${earned?'Получено · ':'+'}${item.xp} XP</span></article>`;}).join('');
    renderCoach();
    const won=!!data&&state.progress.mastered;
    $('victory-panel').hidden=!won;
    if(won){
      $('victory-title').textContent=state.lesson==='assessment'?'Миссия пройдена самостоятельно!':'Миссия пройдена!';
      $('victory-description').textContent=state.lesson==='intro'?'Направление и комиссии больше не загадка. Следующий шаг — твой первый план.':state.lesson==='assessment'?'Ты собрал и объяснил план на новом участке без подсказок. Дальше сравним размер позиции, плечо и маржу.':'Условия плана и расчёт проверены. Теперь можно попробовать с меньшим количеством подсказок.';
      $('victory-reward').textContent='✦ Достижение в коллекции';
      showMascot('victory-mascot','victory-praise',mascot?.getReaction(milestones[state.lesson]),'victory-panel');
      const next=LESSONS[(LESSONS.indexOf(state.lesson)+1)%LESSONS.length];
      $('victory-next').textContent=state.lesson==='assessment'?'К объёму и плечу →':'Следующая миссия →';
      $('victory-next').onclick=()=>{if(state.lesson==='assessment'){stop();persist();window.location.assign('leverage.html');return;}beginLesson(next);$('lesson-content').scrollIntoView({behavior:'smooth',block:'start'});};
    }
    if(gameReady&&result.newly.length){
      if(!activeReward&&!rewardQueue.length){rewardSequence=0;rewardTotal=0;}
      rewardQueue.push(...result.newly);rewardTotal+=result.newly.length;
      if(activeReward){$('reward-count').textContent=`${rewardSequence} / ${rewardTotal}`;$('dismiss-reward').setAttribute('aria-label','Следующая награда');}
      presentReward();
      if(won&&result.newly.some(item=>['intro-mastered','practice','independent'].includes(item.id)))$('victory-panel').scrollIntoView({behavior:'smooth',block:'center'});
    }
    $('start-mission').textContent=won?'К следующей миссии →':rewardIds.length?'Продолжить миссию →':'Начать миссию →';
    gameReady=true;
  }
  function primary(text,handler,disabled=false){const b=$('primary-action');b.textContent=text;b.onclick=handler;b.disabled=disabled;}
  function secondary(text,handler){const b=$('secondary-action');b.hidden=false;b.textContent=text;b.disabled=false;b.onclick=handler;}
  function tertiary(text,handler){const b=$('tertiary-action');b.hidden=false;b.textContent=text;b.onclick=handler;}
  function progress(step,total=state.lesson!=='intro'?6:4){$('lesson-step').textContent=`0${step} / 0${total}`;$('lesson-progress').style.width=`${step/total*100}%`;}
  function renderLesson(){
    for(const id of ['order-controls','direction-controls','planning-controls','locked-plan','quiz','secondary-action','tertiary-action','prediction-controls','assessment-fields','comprehension-controls','check-understanding','retry-practice','retry-assessment','assessment-feedback','mastery-card'])$(id).hidden=true;
    $('primary-action').hidden=false;$('primary-action').dataset.side=state.position?.side||state.side;
    $('lesson-title').textContent=titles[state.lesson].toUpperCase();$('path-caption').textContent=titles[state.lesson];
    $('learning-banner').textContent=state.lesson==='intro'?'Цель: понять направление и расходы сделки.':state.lesson==='assessment'?'Цель: самостоятельно собрать и объяснить план до будущих цен. Рекомендуем сначала пройти практику.':'Цель: собрать и объяснить план до входа.';
    $('task-card').hidden=state.lesson==='intro';if(state.lesson!=='intro')$('task-card').innerHTML=`<strong>${esc(task().title)}</strong><p>${esc(task().idea)}</p>${state.attempt?'<p class="field-note">Новая раскрытая точка той же даты. Повтор знакомой истории — тренировка; это не независимая аттестация.</p>':''}`;
    $('help-toggle').hidden=state.lesson!=='practice'||state.stage!=='setup';
    $('help-panel').hidden=state.lesson!=='practice'||!state.helpOpen;
    $('help-toggle').setAttribute('aria-expanded',String(state.helpOpen));
    $('help-panel').innerHTML=(state.retryTopics.length&&['armed','hold'].includes(state.stage)?'<p><strong>Сначала заверши текущую учебную позицию или пропусти ожидающий план.</strong> Затем составь следующий план: выбранная тема ошибки сохранится. Текущий план и позиция продолжаются без изменений.</p>':'')+(state.retryTopics.length?'<strong>Повтори после ошибки</strong>'+state.retryTopics.map(message=>`<p>${esc(message)}</p>`).join(''):'')+'<strong>Подсказка к плану</strong><p>Выбери направление по учебной идее. Для лонга стоп ниже входа, цель выше; для шорта наоборот. Стоп отменяет идею. Объём считается автоматически. При расчёте только по бюджету риска дальний стоп требует меньшего количества. Если объём уже ограничен доступными средствами, он может остаться прежним. Назови расчётный убыток с комиссиями, указанный в карточке.</p>';
    $('sample-levels').hidden=state.lesson==='assessment'||(state.lesson==='practice'&&!state.helpOpen);
    if(state.feedback){$('assessment-feedback').hidden=false;$('assessment-feedback').innerHTML=state.feedback.checks.map(c=>`<p>${c.ok?'✓':'↗'} ${esc(c.message)}</p>`).join('');$('retry-practice').hidden=state.lesson!=='assessment'||state.feedback.passed;}
    if(state.progress.mastered||state.completedPlan){$('mastery-card').hidden=false;$('mastery-card').textContent=state.lesson==='intro'?'Проверены направление и комиссии.':state.progress.mastered?'Проверены формальные условия и объяснение расчёта. Смысл рыночного обоснования автоматически не оценён.':'Ранее проверки пройдены. Текущий черновик или изменённые ответы нужно проверить отдельно.';}
    $('chart-level-tools').hidden=!levelsEditable();
    const chartFirst=state.lesson==='plan'&&state.stage==='setup'&&state.setupStep===0;
    $('workspace').dataset.chartFirst=String(chartFirst);
    const numberContext=`${state.lesson}:${state.stage}:${state.setupStep}`;
    if(numberContext!==numericContext){$('level-number-details').open=state.lesson!=='plan';numericContext=numberContext;}
    const selection=['stop','target'].map(key=>({key,name:key==='stop'?'Стоп':'Цель / тейк',price:Number($(`${key}-price`).value)}));
    $('selected-levels').setAttribute('aria-live',levelDrag?'off':'polite');
    $('selected-levels').innerHTML=selection.map(v=>`<div><span>${v.name}</span><strong class="${v.key}-value">${v.price>0?fmt(v.price)+' USDT':'Выбери на графике'}</strong></div>`).join('');
    const sides=state.side==='long'?'ниже текущей цены — стоп, выше — цель':'выше текущей цены — стоп, ниже — цель';
    $('chart-level-instruction').textContent=state.pick?`Поставь ${state.pick==='stop'?'стоп':'цель'} касанием графика. Точная цена видна при выборе. Готовую линию перетаскивай за подпись ↕.`:`Нажми на график: ${sides}. Линии и подписи ↕ можно перетаскивать.`;
    const content=$('lesson-content');
    if(state.stage==='entry'){
      progress(1);content.innerHTML='<h2>Выбери направление.</h2><p>Лонг — позиция на рост цены. Шорт — на снижение. Открой учебную сделку и посмотри, что произойдёт.</p>';
      $('direction-controls').hidden=false;$('order-controls').hidden=false;$('prediction-controls').hidden=false;
      primary(ended()?'Эпизод завершён':`Открыть ${state.side==='short'?'шорт':'лонг'} на ${fmt(Number($('amount').value)||0,0)} USDT →`,enter,ended()||!$('direction-prediction').value);
      $('lesson-note').textContent='Это первое знакомство с кнопками. На следующем шаге добавим план выхода и риск.';
    }else if(state.stage==='setup'){
      progress(state.setupStep+1);$('planning-controls').hidden=false;
      if(state.lesson!=='plan'){renderFullPlan(content);renderGame();persist();return;}
      $('levels-controls').hidden=state.setupStep!==0;$('risk-controls').hidden=state.setupStep!==1;$('condition-controls').hidden=state.setupStep!==2;
      $('direction-controls').hidden=state.setupStep!==0;
      const p=preview();$('plan-preview').hidden=state.setupStep===0;
      $('plan-preview').innerHTML=p?planSummary(p):'<p>Проверь бюджет и уровни. Нужны положительные числа и доступные средства.</p>';
      if(state.setupStep===0){
        content.innerHTML='<h2>Поставь выходы на графике.</h2><p>Нажми на график, чтобы поставить стоп и цель / тейк. Затем двигай линии за подпись ↕ — цена меняется сразу. Цифры можно уточнить ниже.</p>';
        const missing=!$('stop-price').value.trim()?'stop':!$('target-price').value.trim()?'target':null;
        if(missing)primary(`Выбрать ${missing==='stop'?'стоп':'цель'} на графике →`,continueLevels,ended());
        else primary('Дальше: размер риска →',advanceSetup,ended());
      }
      else if(state.setupStep===1){content.innerHTML='<h2>Сколько готов потерять?</h2><p>Задай учебный бюджет. Объём рассчитается от стопа с комиссиями входа и выхода внутри этого бюджета.</p>';primary('Дальше: условие входа →',advanceSetup);}
      else{content.innerHTML='<h2>Когда будешь входить?</h2><p>Зафиксируй условие до раскрытия следующих минут. Даже если оно выполнится, решение о входе останется за тобой.</p>';primary('Зафиксировать план →',advanceSetup);}
      if(state.setupStep>0)secondary('← Назад',()=>{state.setupStep--;clearError();render();});
      else tertiary('Вернуться к первой сделке',()=>beginLesson('intro'));
      $('condition-price-wrap').hidden=$('entry-condition').value==='now';
      $('lesson-note').textContent='Плановый риск — расчёт на выбранном уровне. Перескок уровня при следующем закрытии может увеличить фактический убыток.';
    }else if(state.stage==='armed'){
      progress(4);const p=state.plan,met=conditionMet(p.condition,quote());
      content.innerHTML=`<h2>${met?'Условие выполнено.':'Можно подождать.'}</h2><p>${esc(conditionText(p.condition))}. План зафиксирован в ${timeFmt.format(p.createdAt)} МСК. Уровни и бюджет сохраняются.</p>`;
      $('locked-plan').hidden=false;
      let live;try{live=calculatePlan({...p,entry:quote(),availableCash:state.cash,feeRate:FEE});}catch{live=null;}
      $('locked-plan').innerHTML=`<div class="locked-levels"><span>Стоп ${fmt(p.stop)}</span><span>Цель ${fmt(p.target)}</span></div>${live?planSummary(live):'<p>По этой цене план уже не подходит. Можно пропустить вход.</p>'}`;
      primary(met?`Войти в ${p.side==='short'?'шорт':'лонг'} →`:'Ждём условие входа',enter,!met||!live||live.plannedReward<=0||ended());
      secondary('Подождать 1 минуту',()=>{stop();advance();});$('secondary-action').disabled=ended();
      tertiary('Пропустить этот план',()=>recordDecision('skipped'));
      $('lesson-note').textContent='Объём сверяется с новой ценой перед входом. Автоматического открытия позиции нет.';
    }else if(state.stage==='hold'){
      const p=state.position;progress(p.plan?5:2);
      content.innerHTML=`<h2>${sideName(p.side)} открыт.</h2><p>${fmt(p.qty,8)} BTC по цене ${fmt(p.entry)} USDT. ${p.side==='short'?'Снижение цены улучшает результат шорта.':'Рост цены улучшает результат лонга.'}</p>`;
      if(p.plan){$('locked-plan').hidden=false;$('locked-plan').innerHTML=`<div class="locked-levels"><span>Стоп ${fmt(p.plan.stop)}</span><span>Цель ${fmt(p.plan.target)}</span></div><p>Плановый убыток на момент входа: <strong>${fmt(p.plan.plannedLoss)} USDT</strong>. Исходный план сохранён отдельно.</p>`;}
      primary(p.plan?'Закрыть раньше плана':state.index<=p.index?'Сначала раскрой хотя бы 1 минуту':`Закрыть ${p.side==='short'?'шорт':'лонг'}`,()=>closeTrade('manual'),!p.plan&&state.index<=p.index);
      secondary(timer?'Остановить историю':'Продолжить историю →',play);$('secondary-action').disabled=ended();
      $('lesson-note').textContent=p.plan?'Стоп и цель проверяются по следующим закрытиям минут. Ручной выход отметим отдельно в разборе.':'Результат меняется до закрытия. Комиссия есть и на входе, и на выходе.';
    }else if(state.stage==='review'){
      const t=state.trades.at(-1);progress(t.plan?6:3);
      const pricePercent=(t.exit/t.entry-1)*100;
      const percentText=`${pricePercent>0?'+':pricePercent<0?'−':''}${fmt(Math.abs(pricePercent),3)}%`;
      const feeExplanation=t.grossPnl>0&&t.pnl<0?'Движение цены принесло плюс, но его не хватило покрыть комиссии.':t.grossPnl>0?'Движение цены принесло плюс. Часть результата ушла на комиссии; остаток — твой чистый итог.':t.grossPnl<0?'Движение цены дало убыток. Комиссии входа и выхода добавились к нему.':'Без движения цены валовой результат равен нулю, но комиссии всё равно уменьшают итог.';
      content.innerHTML=`<h2>${sideName(t.side)} закрыт.</h2><p>${reasons[t.exitReason]}. Чистый результат: <strong>${money(t.pnl)}</strong>.</p><div class="result-breakdown"><p>Цена BTC: ${fmt(t.entry)} → ${fmt(t.exit)} USDT, изменение <strong>${percentText}</strong>. Вертикальный масштаб графика подстраивается под цены: высота линии сама по себе не показывает процент роста.</p><p>В позиции ${fmt(t.qty,8)} BTC стоимостью ${fmt(t.qty*t.entry)} USDT при входе. Движение цены ${money(t.exit-t.entry)} за целый BTC дало твоей доле <strong>${money(t.grossPnl)}</strong> до расходов.</p><p>Комиссия входа ${fmt(t.entryFee,4)} + комиссия выхода ${fmt(t.exitFee,4)} = ${fmt(t.totalFees,4)} USDT. Это учебные 0,1% от стоимости позиции за каждую операцию.</p><p>Валовой результат: ${money(t.grossPnl)}. Обе комиссии: ${fmt(t.totalFees)} USDT. Чистый итог = валовой результат − комиссии = <strong>${money(t.pnl)}</strong>.</p><p class="explain">${feeExplanation}</p></div><details class="help-panel"><summary>А при чём здесь плечо?</summary><p>Сейчас позиция обеспечена 1:1, плеча в упражнении нет. При том же количестве BTC и тех же ценах большее плечо уменьшает необходимое обеспечение, а денежный результат от движения цены остаётся тем же. При одинаковом обеспечении можно взять больше BTC — тогда вырастут и прибыль, и убыток, и комиссии. Сравни эти случаи в <a href="leverage.html">новом блоке «Размер позиции, плечо и маржа» →</a>.</p><p><a href="https://www.bybit.com/en/help-center/article/Profit-Loss-calculations-USDT-Contract" target="_blank" rel="noopener noreferrer">Справка Bybit об объёме и плече в USDT-контрактах ↗</a></p></details>`;
      if(t.plan){content.innerHTML+='<p class="explain">Результат и соблюдение плана разберём отдельно. Прибыль сама по себе не подтверждает качество решения.</p>';primary('Посмотреть разбор ↓',()=>$('review-panel').scrollIntoView({behavior:'smooth',block:'start'}));secondary('Составить следующий план',newPlan);$('secondary-action').disabled=ended();}
      else{primary('Проверить, что я понял →',()=>{state.stage='quiz';render();});}
      $('lesson-note').textContent=t.plan?'Первоначальный план, условие входа и причина выхода сохранены в учебной истории.':'Первый опыт показывает механику. Следующий урок добавит стоп, цель и денежный риск.';
    }else if(state.stage==='quiz'){
      progress(4);const q=learning.questionFor(state.quiz.topic,state.trades.at(-1).side,state.quiz.variant,state.trades.at(-1));
      content.innerHTML=`<h2>${state.progress.mastered?'Проверки пройдены.':state.quiz.variant?'Похожая задача.':'Проверь понимание.'}</h2><p>${esc(q.prompt)}</p>`;
      $('quiz').hidden=state.progress.mastered;primary('Следующий урок: план и риск →',()=>beginLesson('plan'));$('primary-action').hidden=!state.progress.mastered;
      $('quiz-feedback').textContent=state.quiz.feedback;
      document.querySelectorAll('[data-answer]').forEach(b=>{const option=q.options.find(o=>o.value===b.dataset.answer);b.textContent=option?.label||b.dataset.answer;b.classList.toggle('correct',false);b.classList.toggle('wrong',false);});
      $('lesson-note').textContent=state.progress.mastered?'Освоено: направление сделки и влияние комиссий, проверенные ответами.':'Направление и комиссии проверяются отдельно. Прибыль и переход на экран не означают освоения.';
    }else if(state.stage==='decision'){
      progress(6);const d=state.lastDecision;
      content.innerHTML=`<h2>${d.kind==='skipped'?'Вход пропущен.':d.kind==='expired'?'Эпизод закончился.':'Сценарий отменён.'}</h2><p>${d.kind==='cancelled'?'До входа цена пересекла стоп или цель. Исходный план больше не действует.':d.kind==='expired'?'История закончилась до открытия позиции.':'Ты сохранил план и выбрал не открывать позицию.'}</p><p class="explain">Сделки и комиссий не было. Учебные средства сохранены.</p>`;
      primary(ended()?'Начать эпизод заново':'Составить новый план',ended()?showRestart:newPlan);
      $('lesson-note').textContent=d.conditionMet?'Условие входа было выполнено. Пропуск и отмена показываются как решения без сделки.':'На момент решения условие входа не было выполнено.';
    }
    if(state.lesson!=='intro'&&state.stage==='armed'&&state.lesson==='plan'){$('planning-controls').hidden=false;$('levels-controls').hidden=true;$('risk-controls').hidden=true;$('condition-controls').hidden=true;$('plan-preview').hidden=true;$('comprehension-controls').hidden=false;$('check-understanding').hidden=false;}
    if(state.progress.mastered&&state.lesson!=='intro')$('lesson-note').textContent='Освоено: формальные условия простого плана и понимание расчёта. Это не подтверждает качество уровня или будущую прибыльность.';
    if((state.lesson==='practice'&&state.progress.checked)||(state.lesson==='assessment'&&state.helpUsed))$('retry-assessment').hidden=false;
    if(state.lesson==='assessment'&&state.helpUsed)$('lesson-note').textContent='Исправление после обратной связи — тренировка с помощью. Для проверки самостоятельного плана начни новую попытку на другой раскрытой точке.';
    persist();
    $('pick-stop').setAttribute('aria-pressed',String(state.pick==='stop'));$('pick-target').setAttribute('aria-pressed',String(state.pick==='target'));
    $('chart-hint').textContent=levelsEditable()?'Линии связаны с полями цены':'Следующие минуты скрыты';
    renderGame();
  }
  function renderHistory(){
    $('trade-history').hidden=!state.trades.length;
    $('history-list').innerHTML=state.trades.slice(-4).reverse().map(t=>`<div class="history-row"><span>${t.side==='short'?'↘ Шорт':'↗ Лонг'}</span><span>${timeFmt.format(t.time)} → ${timeFmt.format(t.exitTime)}</span><span>${t.plan?reasons[t.exitReason]:'Знакомство'}</span><span>${money(t.pnl)}</span></div>`).join('');
    $('decision-history').hidden=!state.decisions.length;
    $('decision-history').innerHTML=state.decisions.length?`<strong>Решения без входа</strong> ${state.decisions.slice(-3).map(d=>`${timeFmt.format(d.time)} — ${d.kind==='skipped'?'пропуск':d.kind==='expired'?'конец эпизода':'сценарий отменён'}`).join(' · ')}`:'';
  }
  function renderReview(){
    const t=state.trades.at(-1),visible=state.stage==='review'&&!!t?.plan;$('review-panel').hidden=!visible;if(!visible)return;
    const p=t.originalPlan||t.plan,entryPlan=t.plan,extraLoss=Math.max(0,-t.pnl-entryPlan.plannedLoss),early=t.exitReason==='manual';
    const rows=[['Направление',sideName(t.side),sideName(t.side)],['Стоп / цель',`${fmt(p.stop)} / ${fmt(p.target)}`,'Уровни не менялись'],['Вход',`${fmt(p.referenceEntry)} при фиксации плана`,`${fmt(t.entry)} при открытии`],['Объём',`${fmt(p.qty,8)} BTC`,`${fmt(t.qty,8)} BTC при входе`],['Денежный риск',`${fmt(p.plannedLoss)} USDT на стопе`,`${fmt(entryPlan.plannedLoss)} USDT на момент входа`],['Результат',`${money(p.plannedReward)} на цели`,money(t.pnl)],['Выход','Стоп или цель',`${reasons[t.exitReason]} · ${fmt(t.exit)} USDT`]];
    $('review-panel').innerHTML=`<div class="review-heading"><div><div class="eyebrow">ОТДЕЛЯЕМ РЕЗУЛЬТАТ ОТ РЕШЕНИЯ</div><h2>Что получилось с твоим планом</h2></div><strong class="review-pnl">${money(t.pnl)}</strong></div><div class="review-grid"><div class="review-table"><div class="review-table-head"><span>Что проверяем</span><span>Исходный план</span><span>Факт</span></div>${rows.map(r=>`<div>${r.map(v=>`<span>${esc(v)}</span>`).join('')}</div>`).join('')}</div><div class="review-checks"><p>✓ План записан до входа</p><p>✓ Условие входа выполнено</p><p>✓ Стартовый риск помещался в бюджет ${fmt(p.riskBudget)} USDT</p><p>${early?'↗ Ручной выход до условий плана':t.exitReason==='episode_end'?'↗ Закрытие по границе упражнения':'✓ Сработало выбранное условие выхода'}</p></div></div>${extraLoss>.005&&t.exitReason==='stop'?`<p class="report-explanation">Убыток превысил расчёт на ${fmt(extraLoss)} USDT: следующее закрытие минуты прошло стоп. Это свойство учебной модели исполнения, а не доказательство нарушения игрока.</p>`:''}${early?'<p class="report-explanation">Ты закрыл позицию вручную раньше стопа или цели. Это отличие от записанного условия выхода. Прибыль и убыток не меняют этот факт.</p>':''}<p class="review-rationale"><strong>Твоё обоснование стопа:</strong> ${p.rationale?esc(p.rationale):'пока не записано. В следующем плане попробуй объяснить, где отменяется идея.'}</p><p class="field-note">Здесь проверяются формальные условия и расчёты. Качество выбранного рыночного уровня автоматически не оценивается.</p>`;
  }
  function draw(){
    if(!data)return;const svg=$('chart'),w=Math.max(240,svg.getBoundingClientRect().width),h=Math.max(180,svg.getBoundingClientRect().height);
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);const l=12,r=73,t=18,b=32,pw=w-l-r,ph=h-t-b,start=Math.max(0,state.index-90),visible=data.candles.slice(start,state.index+1);
    const plan=state.position?.plan||(state.stage==='armed'?state.plan:state.lesson!=='intro'&&state.stage==='setup'?levelInput():null);
    const levels=plan?[{key:'stop',name:'Стоп',price:plan.stop,color:'#b68b75'},{key:'target',name:'Цель',price:plan.target,color:'#7e9463'}]:[];
    const values=visible.map(c=>c.close);if(state.position)values.push(state.position.entry);
    levels.forEach(v=>{if(Number.isFinite(v.price)&&v.price>quote()/5&&v.price<quote()*5)values.push(v.price);});
    let lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.18,quote()*.0006);lo-=pad;hi+=pad;
    if(levelDrag){lo=levelDrag.geometry.lo;hi=levelDrag.geometry.hi;}
    const x=i=>l+(i-start)/Math.max(90,state.index-start)*pw,y=v=>t+(hi-v)/(hi-lo)*ph;
    geometry={l,r,t,b,w,h,lo,hi,pw,ph};
    let s=`<defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8b83d5" stop-opacity=".17"/><stop offset="100%" stop-color="#8b83d5" stop-opacity="0"/></linearGradient><clipPath id="plot-clip"><rect x="${l}" y="${t}" width="${pw}" height="${ph}"/></clipPath></defs>`;
    const priceTicks=levelsEditable()?6:4;
    for(let i=0;i<priceTicks;i++){const val=lo+(hi-lo)*i/(priceTicks-1),yy=y(val);s+=`<line x1="${l}" y1="${yy}" x2="${w-r+4}" y2="${yy}" stroke="#eeefe9"/><text x="${w-r+10}" y="${yy+3}" fill="#a1a598" font-size="9" font-family="inherit">${fmt(val,levelsEditable()?2:0)}</text>`;}
    const path=visible.map((c,i)=>`${i?'L':'M'}${x(start+i).toFixed(2)},${y(c.close).toFixed(2)}`).join(' '),ex=x(state.index),ey=y(quote());
    s+=`<g clip-path="url(#plot-clip)"><path d="${path} L${ex},${t+ph} L${l},${t+ph}Z" fill="url(#area)"/><path d="${path}" fill="none" stroke="#7974c8" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if(levelsEditable())s+=`<g class="entry-reference" pointer-events="none"><line x1="${l}" y1="${ey}" x2="${w-r}" y2="${ey}" stroke="#262822" stroke-opacity=".45" stroke-dasharray="2 5"/><text x="${l+6}" y="${Math.max(t+11,ey-7)}" fill="#262822" font-size="10" font-family="inherit">Сейчас ${fmt(quote())}</text></g>`;
    levels.forEach(v=>{const yy=y(v.price);if(Number.isFinite(yy)&&v.price>0&&yy>=t&&yy<=t+ph){const editable=levelsEditable(),labelWidth=Math.min(132,pw),labelX=l+pw-labelWidth;s+=`<g data-level="${v.key}" data-price="${v.price.toFixed(2)}" class="chart-level${editable?' editable':''}${levelDrag?.kind===v.key?' dragging':''}"><title>${v.name} ${fmt(v.price)} USDT${editable?' · перетащи, чтобы изменить':''}</title>${editable?`<line class="level-hit" x1="${l}" y1="${yy}" x2="${w-r}" y2="${yy}" stroke="transparent" stroke-width="28"/>`:''}<line x1="${l}" y1="${yy}" x2="${w-r}" y2="${yy}" stroke="${v.color}" stroke-dasharray="5 4"/><rect x="${labelX}" y="${yy-13}" width="${labelWidth}" height="26" rx="6" fill="${v.key==='stop'?'#f4e8e0':'#eaf0df'}" stroke="${v.color}" stroke-opacity=".45"/><text x="${labelX+9}" y="${yy+3.5}" fill="${v.color}" font-size="10" font-family="inherit">${v.name} ${fmt(v.price)}${editable?' ↕':''}</text></g>`;}});
    if(state.position){const yy=y(state.position.entry);s+=`<line x1="${l}" y1="${yy}" x2="${ex}" y2="${yy}" stroke="#9aab76" stroke-dasharray="3 4"/><circle cx="${x(Math.max(start,state.position.index))}" cy="${yy}" r="4" fill="#727f50" stroke="white" stroke-width="2"/>`;}
    for(const tr of state.trades){if(tr.index>=start)s+=`<circle cx="${x(tr.index)}" cy="${y(tr.entry)}" r="3" fill="#869665"/>`;if(tr.exitIndex>=start)s+=`<rect x="${x(tr.exitIndex)-3}" y="${y(tr.exit)-3}" width="6" height="6" fill="#747b6c"/>`;}
    s+=`</g><circle cx="${ex}" cy="${ey}" r="4.5" fill="#7974c8" stroke="white" stroke-width="2"/>`;
    const ticks=w<420?3:4;for(let i=0;i<ticks;i++){const idx=start+Math.round((state.index-start)*i/(ticks-1));s+=`<text x="${x(idx)}" y="${h-7}" text-anchor="${i===0?'start':i===ticks-1?'end':'middle'}" fill="#a1a598" font-size="9" font-family="inherit">${timeFmt.format(stamp(data.candles[idx]))}</text>`;}
    if(!levelsEditable())priceCursor=null;
    $('chart-price-preview').hidden=!priceCursor;
    if(priceCursor){
      const label=`${priceCursor.kind==='stop'?'Стоп':'Цель / тейк'}: ${fmt(priceCursor.price)} USDT`,yy=Math.max(t,Math.min(t+ph,y(priceCursor.price)));
      $('chart-price-preview').textContent=label+(levelDrag?' ↕':'');
      s+=`<g class="chart-cursor" data-price-cursor="${priceCursor.price.toFixed(2)}" pointer-events="none"><line x1="${l}" y1="${yy}" x2="${w-r}" y2="${yy}" stroke="#426F96" stroke-dasharray="3 3"/><rect x="${w-r+2}" y="${yy-11}" width="${r-4}" height="22" rx="4" fill="#262822"/><text x="${w-r+7}" y="${yy+3}" fill="#FFFCF5" font-family="inherit" font-size="9">${fmt(priceCursor.price)}</text></g>`;
    }
    svg.innerHTML=s;svg.classList.toggle('picking',!!state.pick);svg.classList.toggle('editing',levelsEditable());svg.classList.toggle('dragging',!!levelDrag);
  }
  function chartPoint(e,g){
    const rect=$('chart').getBoundingClientRect();
    return {x:(e.clientX-rect.left)*g.w/rect.width,y:(e.clientY-rect.top)*g.h/rect.height};
  }
  function dragPrice(e,drag){
    const g=drag.geometry,p=chartPoint(e,g),yy=Math.max(g.t,Math.min(g.t+g.ph,p.y-drag.offset));
    return Math.max(.01,g.hi-(yy-g.t)/g.ph*(g.hi-g.lo)).toFixed(2);
  }
  function beginLevelDrag(e){
    if(!levelsEditable()||!geometry||levelDrag||e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;
    const g={...geometry},p=chartPoint(e,g);
    if(p.x<g.l||p.x>g.w-g.r||p.y<g.t||p.y>g.t+g.ph)return;
    const hit=e.target.closest('[data-level]')?.dataset.level;
    const price=g.hi-(p.y-g.t)/g.ph*(g.hi-g.lo);
    const kind=['stop','target'].includes(hit)?hit:state.pick||(price<quote()?(state.side==='long'?'stop':'target'):(state.side==='long'?'target':'stop'));
    const input=$(`${kind}-price`),original=input.value;
    const offset=hit&&Number(original)>0?p.y-(g.t+(g.hi-Number(original))/(g.hi-g.lo)*g.ph):0;
    levelDrag={kind,pointerId:e.pointerId,geometry:g,original,offset};
    $('chart').setPointerCapture(e.pointerId);e.preventDefault();state.pick=null;
    if(!hit)input.value=dragPrice(e,levelDrag);
    priceCursor={kind,price:Number(input.value)};
    invalidatePlan();clearError();renderLesson();draw();
  }
  function moveLevelDrag(e){
    if(!levelDrag){
      if(!levelsEditable()||!geometry)return;
      const p=chartPoint(e,geometry),g=geometry;
      if(p.x<g.l||p.x>g.w-g.r||p.y<g.t||p.y>g.t+g.ph){priceCursor=null;draw();return;}
      const price=Number(dragPrice(e,{geometry:g,offset:0}));
      const kind=state.pick||(price<quote()?(state.side==='long'?'stop':'target'):(state.side==='long'?'target':'stop'));
      priceCursor={kind,price};draw();return;
    }
    if(e.pointerId!==levelDrag.pointerId||!levelsEditable())return;
    $(`${levelDrag.kind}-price`).value=dragPrice(e,levelDrag);priceCursor={kind:levelDrag.kind,price:Number($(`${levelDrag.kind}-price`).value)};e.preventDefault();invalidatePlan();clearError();renderLesson();draw();
  }
  function finishLevelDrag(e,cancel=false){
    if(!levelDrag||e.pointerId!==levelDrag.pointerId)return;
    const drag=levelDrag;
    if(levelsEditable())$(`${drag.kind}-price`).value=cancel?drag.original:dragPrice(e,drag);
    levelDrag=null;priceCursor=null;
    if($('chart').hasPointerCapture(e.pointerId))$('chart').releasePointerCapture(e.pointerId);
    renderLesson();draw();
  }
  function renderFullPlan(content){
    for(const id of ['levels-controls','risk-controls','condition-controls','comprehension-controls'])$(id).hidden=false;
    $('assessment-fields').hidden=state.lesson!=='assessment';$('direction-controls').hidden=state.lesson==='assessment';
    $('condition-price-wrap').hidden=$('entry-condition').value==='now';
    $('plan-preview').hidden=false;const p=preview();$('plan-preview').innerHTML=p?planSummary(p):'<p>Объём рассчитается после выбора направления, стопа, цели и бюджета.</p>';
    content.innerHTML=state.lesson==='assessment'?'<h2>Собери свой план.</h2><p>Все поля и объяснения заполняешь самостоятельно. Будущие минуты откроются после проверки. Наличие обоснования обязательно; его рыночный смысл автоматически не оценивается.</p>':'<h2>Повтори на новой истории.</h2><p>Собери план и объясни расчёт. Если нужна опора, открой помощь. Такое выполнение останется тренировкой с помощью.</p>';
    primary('Проверить мой план →',()=>assess(state.lesson==='assessment'));
    $('check-understanding').hidden=state.lesson==='assessment';$('check-understanding').onclick=()=>assess(false);
    if(state.lesson==='practice'&&state.feedback?.passed){primary('Зафиксировать учебный план →',()=>{const p=candidate();state.plan={...p,referenceEntry:quote(),createdAt:stamp(candle()),createdIndex:state.index};state.stage='armed';render();});$('retry-assessment').hidden=false;}
    $('lesson-note').textContent=state.progress.mastered?'Освоено: проверенные условия плана и расчёт риска.':state.helpUsed?'Тренировка с помощью. Для самостоятельной проверки перейди к новой попытке контроля.':'Проверяется план до входа. Числа и баланс — учебные.';
    $('chart-hint').textContent='Будущие минуты скрыты до проверки плана';
  }
  function renderUnavailable(){
    stop();$('price').textContent='История недоступна';$('market-date').textContent='—';$('market-time').textContent='—';$('chart').innerHTML='';$('chart-error').hidden=false;
    $('chart-error').textContent=dataErrors[files[state.lesson]]||'Загружаем проверенную историю этого занятия…';
    for(const id of ['planning-controls','direction-controls','order-controls','prediction-controls','locked-plan','quiz','review-panel','trade-history','decision-history','chart-level-tools','secondary-action','tertiary-action','assessment-feedback','mastery-card','retry-practice','retry-assessment','check-understanding'])$(id).hidden=true;
    $('cash').textContent='—';$('holding').textContent='—';$('result').textContent='—';$('play-button').disabled=true;$('step-button').disabled=true;
    $('lesson-content').innerHTML='<h2>Сначала проверим историю.</h2><p>Для этого занятия нет проверенных данных. Другие занятия доступны по кнопкам над графиком.</p>';
    primary('Нет проверенных данных',()=>{},true);
    document.querySelectorAll('[data-lesson]').forEach(b=>{b.disabled=false;b.setAttribute('aria-pressed',String(b.dataset.lesson===state.lesson));});
    renderGame();
  }
  function openDialog(kind){
    stop();if(data)renderLesson();
    if(kind==='path'){
      const next=LESSONS.find(lesson=>!lessons[lesson].progress.mastered&&!lessons[lesson].completedPlan);
      const leverageDone=leverageMastered();
      $('dialog-content').innerHTML=`<h2>Твой путь к простому плану.</h2><ul>${LESSONS.map(lesson=>{const p=lessons[lesson].progress;return `<li>${esc(titles[lesson])}<span>${p.mastered?'Проверки пройдены':lessons[lesson].completedPlan?'Ранее проверки пройдены · новая тренировка':p.checked?'Проверено · есть что исправить':p.tried?'Попробовано · ещё не проверено':'Ещё не проверено'}</span></li>`;}).join('')}<li><a href="leverage.html">Размер позиции, плечо и маржа →</a><span>${leverageDone?'Проверки пройдены':'Три опыта · ещё не проверено'}</span></li></ul><p>${next?'Следующий шаг: '+esc(titles[next])+'.':!leverageDone?'Следующий шаг: размер позиции, плечо и маржа.':'Все проверки формальных навыков пройдены. Продолжай практику на новых историях.'}</p><p>Прибыль не даёт учебных наград. Даты видны; повтор знакомой истории является тренировкой. Это не независимая аттестация мастерства.</p>`;
    }else $('dialog-content').innerHTML='<h2>Исторические цены. Учебные решения.</h2><p>Четыре занятия: механика сделки, план с объяснениями, практика с помощью по запросу и самостоятельный план на другой истории. Даты всегда видны. Далее — <a href="leverage.html">отдельный блок об объёме, плече и марже</a> на заданных учебных ценах.</p><p>Стартовый баланс 1 000 USDT, обеспечение 1:1 и комиссия 0,1% на операцию — параметры упражнения. Биржевых сделок здесь нет. Объём округляется вниз до 8 знаков BTC.</p><p>Вход и выход моделируются по раскрытым закрытиям минут. Перескок стопа может увеличить убыток. Внутриминутное движение, плечо, funding и ликвидация не воспроизводятся.</p><p>Проверяются формальные условия и объяснение расчёта. Выбор рыночных уровней и смысл обоснования автоматически не оцениваются. Прохождение не доказывает будущую прибыльность.</p><p><a href="https://bybit-exchange.github.io/docs/v5/market/kline" target="_blank" rel="noopener noreferrer">Источник исторических данных ↗</a></p>';
    $('info-dialog').showModal();
  }
  function showRestart(){stop();$('dialog-content').innerHTML='<h2>Начать это занятие заново?</h2><p>Учебные средства, позиции, черновик и проверки этого занятия сбросятся. Остальные занятия сохранятся. Повтор знакомой истории — тренировка.</p><button id="confirm-restart" class="primary-action">Да, начать заново</button>';$('info-dialog').showModal();$('confirm-restart').onclick=()=>{const lesson=state.lesson;lessons[lesson]=freshState(lesson);state=lessons[lesson];applyDraft();clearError();$('info-dialog').close();render();};}
  $('play-button').onclick=play;$('step-button').onclick=()=>{stop();advance();};$('speed').onchange=()=>{if(timer){stop();play();}};
  $('amount').oninput=()=>{clearError();if(data){estimateIntro();renderLesson();}};
  for(const id of ['stop-price','target-price','risk-budget','condition-price','plan-rationale','answer-loss'])$(id).addEventListener('input',()=>{invalidatePlan();clearError();if(data){renderLesson();draw();}});
  for(const id of ['entry-condition','direction-prediction','answer-entry','answer-cancel','answer-sizing'])$(id).onchange=()=>{invalidatePlan();clearError();if(data)renderLesson();};
  $('assessment-side').onchange=()=>{invalidatePlan();state.side=$('assessment-side').value||null;clearError();if(data)render();};
  $('help-toggle').onclick=()=>{state.helpOpen=!state.helpOpen;if(state.helpOpen){state.helpUsed=true;state.progress.mastered=false;}render();};
  $('check-understanding').onclick=()=>assess(false);
  $('retry-practice').onclick=()=>{const topics=state.feedback?.checks.filter(c=>!c.ok).map(c=>c.message)||[];beginLesson('practice');state.retryTopics=topics;state.helpOpen=true;state.helpUsed=true;if(['review','decision'].includes(state.stage)){resetAttempt('practice');applyDraft();}if(state.stage==='setup'){state.feedback=null;state.plan=null;state.progress.mastered=false;}render();};
  $('retry-assessment').onclick=freshAssessment;
  $('glossary-button').onclick=()=>{const open=$('glossary-panel').hidden;$('glossary-panel').hidden=!open;$('glossary-button').setAttribute('aria-expanded',String(open));};
  $('glossary-panel').innerHTML='<dl>'+learning.glossary.map(item=>`<dt>${esc(item.term)}</dt><dd>${esc(item.definition)}</dd>`).join('')+'</dl>';
  document.querySelectorAll('#direction-controls [data-side]').forEach(b=>b.onclick=()=>{
    if(state.position||!['entry','setup'].includes(state.stage)||state.side===b.dataset.side)return;
    if(levelsEditable()){
      if(levelDrag){const pointerId=levelDrag.pointerId;levelDrag=null;if($('chart').hasPointerCapture(pointerId))$('chart').releasePointerCapture(pointerId);}
      const previousStop=$('stop-price').value;
      $('stop-price').value=$('target-price').value;$('target-price').value=previousStop;
      state.pick=null;
    }
    invalidatePlan();state.side=b.dataset.side;state.draft['direction-prediction']='';$('direction-prediction').value='';clearError();render();
  });
  document.querySelectorAll('[data-amount]').forEach(b=>b.onclick=()=>{$('amount').value=b.dataset.amount;clearError();if(data)render();});
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>answerQuiz(b.dataset.answer));
  document.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>beginLesson(b.dataset.lesson));
  $('sample-levels').onclick=sampleLevels;
  $('pick-stop').onclick=()=>focusChart(state.pick==='stop'?null:'stop');$('pick-target').onclick=()=>focusChart(state.pick==='target'?null:'target');
  $('chart').addEventListener('pointerdown',beginLevelDrag);$('chart').addEventListener('pointermove',moveLevelDrag);
  $('chart').addEventListener('pointerup',e=>finishLevelDrag(e));$('chart').addEventListener('pointercancel',e=>finishLevelDrag(e,true));$('chart').addEventListener('lostpointercapture',e=>finishLevelDrag(e,true));
  $('chart').addEventListener('pointerleave',()=>{if(!levelDrag){priceCursor=null;draw();}});
  $('about-button').onclick=()=>openDialog('about');$('path-button').onclick=()=>openDialog('path');$('close-dialog').onclick=()=>$('info-dialog').close();$('restart-button').onclick=showRestart;
  $('dismiss-reward').onclick=()=>{$('reward-toast').hidden=true;activeReward=null;presentReward();};
  $('start-mission').onclick=()=>{if(!$('victory-panel').hidden)$('victory-next').onclick();else $('lesson-content').scrollIntoView({behavior:'smooth',block:'start'});};
  $('info-dialog').onclick=e=>{if(e.target===$('info-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
  new ResizeObserver(draw).observe($('chart'));document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();if(data)renderLesson();}});
  function refreshExternalProgress(){loadRewards();if(loaded){renderGame();renderPersonalPractice();}}
  window.addEventListener('pageshow',refreshExternalProgress);
  window.addEventListener('storage',event=>{if(event.key===null||[REWARDS_KEY,window.InsweepLeverage?.STORAGE_KEY,window.InsweepReview?.STORAGE_KEY].includes(event.key))refreshExternalProgress();});
  function validateData(payload){
    if(payload.source?.exchange!=='Bybit'||payload.source?.symbol!=='BTCUSDT'||payload.source?.market!=='spot'||!Array.isArray(payload.candles)||payload.candles.length<START_INDEX+2)throw new Error('Неверный источник истории');
    if(!payload.candles.every((c,i)=>c.closed===true&&Number.isFinite(c.time)&&Number.isFinite(c.close)&&c.close>0&&(!i||c.time-payload.candles[i-1].time===60000)))throw new Error('Неполные исторические данные');
    return payload;
  }
  Promise.all(Object.values(files).filter((file,i,all)=>all.indexOf(file)===i).map(async file=>{
    try{const response=await fetch(file);if(!response.ok)throw new Error('История недоступна');datasets[file]=validateData(await response.json());datasetIds[file]=identity(datasets[file],file);}
    catch{dataErrors[file]='Не получилось загрузить проверенные исторические цены этого занятия.';}
  })).then(()=>{restore();loadRewards();loaded=true;data=datasets[files[state.lesson]]||null;applyDraft();render();});
})();
