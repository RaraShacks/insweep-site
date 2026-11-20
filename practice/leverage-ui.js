(function () {
  'use strict';
  const model = window.InsweepLeverage;
  const rewards = window.InsweepRewards;
  const mascot = window.InsweepMascot;
  const el = id => document.getElementById(id);
  const all = selector => Array.from(document.querySelectorAll(selector));
  const REWARDS_KEY = 'insweep-rewards-v1';
  const moneyFormat = new Intl.NumberFormat('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2});
  const quantityFormat = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:8});
  const money = value => moneyFormat.format(value).replace(/\u00a0/g, ' ') + ' USDT';
  const signed = value => (value < 0 ? '−' : value > 0 ? '+' : '') + money(Math.abs(value));
  const quantity = value => quantityFormat.format(value).replace(/\u00a0/g, ' ') + ' BTC';
  const copy = [
    {title:'Количество одинаковое',fixed:'0,01 BTC в обоих вариантах',copy:'Две позиции одного размера. Меняем только плечо и сравниваем обеспечение, расходы и оба исхода.',takeaway:'Те же BTC и те же цены → тот же денежный результат. Плечо меняет основную начальную маржу.'},
    {title:'Маржа одинаковая. Количество — разное.',fixed:'100 USDT основной маржи',copy:'В обоих вариантах по 100 учебных USDT основной начальной маржи. Большее плечо здесь означает больше BTC.',takeaway:'Больше BTC → больше прибыль при благоприятном движении, больше убыток при неблагоприятном и больше обе комиссии.'},
    {title:'Сохраняем денежный риск',fixed:'10 USDT риска с комиссиями',copy:'Стоп и бюджет уже заданы. Сначала рассчитываем количество с расходами внутри бюджета, затем сравниваем маржу.',takeaway:'Тот же стоп и тот же бюджет риска → то же количество. Плечо не даёт основания умножать рассчитанный объём.'},
  ];
  let state = model.initialState();
  let earnedIds = [];
  let storageWarning = '';
  let reviewAttempt = null;
  function renderPersonalPractice() {
    const review=window.InsweepReview,store=window.InsweepReviewStore;if(!review||!store)return;
    const next=review.recommend(store.load(),Date.now()),topic=next&&review.TOPICS.find(t=>t.id===next.topicId);
    el('personal-practice-copy').textContent=next?.mode==='recheck'?`Пора проверить снова: ${topic.title}. Короткая задача без подсказки.`:next?.mode==='practice'?`Недавняя проверка: ${topic.title}. Попробуй другой пример.`:'Новый участок истории и короткая проверка по одной теме.';
    el('personal-practice-warning').textContent=store.warning();el('personal-practice-warning').hidden=!store.warning();
  }

  function storageNotice(message) {
    storageWarning = message;
    el('storage-note').textContent = message;
    el('storage-note').hidden = !message;
  }
  function unavailableStorage() {
    storageNotice('Браузер не разрешает локальное сохранение. Можно пройти все опыты сейчас; после закрытия прогресс может не сохраниться.');
  }
  try {
    const raw = window.localStorage.getItem(model.STORAGE_KEY);
    const restored = model.restoreState(raw);
    if (restored) state = restored;
    else if (raw !== null) storageNotice('Сохранение этих опытов повреждено. Начинаем их заново; прежние уроки и достижения сохранены отдельно.');
  } catch (_) { unavailableStorage(); }
  try {
    const saved = JSON.parse(window.localStorage.getItem(REWARDS_KEY));
    if (saved?.version === 1 && Array.isArray(saved.earned)) earnedIds = saved.earned.filter(id => typeof id === 'string');
  } catch (_) { /* Missing or inaccessible reward storage must not block the lesson. */ }

  function save() {
    try { window.localStorage.setItem(model.STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { unavailableStorage(); }
  }
  function passed(step) {
    return state.answers[step] === model.questionFor(step, state.variants[step]).correct;
  }
  function canVisit(step) {
    return step === 0 || state.answers.slice(0, step).every((_, index) => passed(index));
  }
  function showMascot(imageId, copyId, panelId, reaction) {
    if (!reaction) return;
    el(imageId).src = reaction.image;
    el(copyId).textContent = reaction.text;
    el(panelId).dataset.reaction = reaction.id;
    el(panelId).dataset.emotion = reaction.emotion;
    el(panelId).dataset.pose = reaction.pose;
  }
  function renderCoach() {
    if (!mascot) return;
    const answered = state.answers[state.step] !== null;
    const correct = passed(state.step);
    const stage = answered ? (correct ? 'correct' : 'wrong') : state.variants[state.step] > 0 ? 'retry' : 'start';
    showMascot('leverage-coach-mascot', 'leverage-coach-copy', 'leverage-coach', mascot.getCoach({lesson:'leverage', stage, setupStep:state.step, mastered:model.isComplete(state), hasError:answered && !correct, conditionReady:false}));
    if (model.isComplete(state)) showMascot('completion-mascot', 'completion-praise', 'lesson-complete', mascot.getReaction('leverage-basics'));
  }
  function renderRewards() {
    if (!rewards) return;
    // A restored page or another open tab may have earned new replay badges.
    // Merge the current shared catalog before writing this lesson's result.
    try {
      const current = JSON.parse(window.localStorage.getItem(REWARDS_KEY));
      if (current?.version === 1 && Array.isArray(current.earned)) {
        earnedIds = Array.from(new Set([...earnedIds, ...current.earned.filter(id => typeof id === 'string')]));
      }
    } catch (_) { /* Keep the in-memory progress when storage is unavailable. */ }
    const complete = model.isComplete(state);
    const result = rewards.collect({leverage:{progress:{mastered:complete}}}, earnedIds);
    earnedIds = result.earned;
    el('xp-total').textContent = String(result.xp);
    el('level-number').textContent = String(result.level);
    if (complete) {
      const achievement = rewards.catalog.find(item => item.id === 'leverage-basics');
      el('completion-reward').textContent = achievement ? 'Достижение «' + achievement.title + '» · ' + achievement.xp + ' XP' : 'Три опыта пройдены';
      try { window.localStorage.setItem(REWARDS_KEY, JSON.stringify({version:1, earned:earnedIds})); }
      catch (_) { unavailableStorage(); }
    }
  }
  function setOutcome(prefix, outcome, entryFee) {
    el(prefix + '-gross').textContent = signed(outcome.grossPnl);
    el(prefix + '-entry-fee').textContent = money(entryFee);
    el(prefix + '-exit-fee').textContent = money(outcome.exitFee);
    el(prefix + '-fees').textContent = money(outcome.totalFees);
    const net = el(prefix + '-net');
    net.textContent = signed(outcome.pnl);
    net.className = outcome.pnl < 0 ? 'negative-value' : outcome.pnl > 0 ? 'positive-value' : '';
  }
  function renderPosition(prefix, row) {
    el(prefix + '-quantity').textContent = quantity(row.qty);
    el(prefix + '-notional').textContent = money(row.notional);
    el(prefix + '-margin').textContent = money(row.initialMargin);
    el(prefix + '-entry-fee').textContent = money(row.entryFee);
    if (state.step < 2) {
      setOutcome(prefix + '-up', row.up, row.entryFee);
      setOutcome(prefix + '-down', row.down, row.entryFee);
    } else {
      el(prefix + '-stop-gross').textContent = money(Math.abs(row.stop.grossPnl));
      el(prefix + '-stop-entry-fee').textContent = money(row.entryFee);
      el(prefix + '-stop-exit-fee').textContent = money(row.stop.exitFee);
      el(prefix + '-risk').textContent = money(row.plannedLoss);
      el(prefix + '-fee-reserve').textContent = money(row.feesReserve);
      el(prefix + '-margin-plus-fees').textContent = money(row.marginPlusFees);
    }
  }
  function renderComparison() {
    const options = {side:state.side,entry:100000,leverage:state.leverage,feeRate:0.001,movePct:1};
    let comparison;
    if (state.step === 0) comparison = model.compareQuantity({...options,qty:0.01});
    else if (state.step === 1) comparison = model.compareMargin({...options,margin:100});
    else {
      const stop = state.side === 'long' ? 99000 : 101000;
      comparison = model.compareRisk({...options,stop,riskBudget:10});
      el('stop-price-label').textContent = 'Стоп ' + money(stop);
      el('risk-sizing-note').textContent = 'Количество = 10 / (расстояние до стопа + комиссия входа за 1 BTC + комиссия выхода за 1 BTC). Бюджет 10 USDT уже включает обе комиссии.';
    }
    renderPosition('baseline', comparison.baseline);
    renderPosition('chosen', comparison.chosen);
    el('chosen-leverage').textContent = state.leverage + '×';
    all('.chosen-outcome-label').forEach(node => { node.textContent = 'При ' + state.leverage + '×'; });
    el('risk-chosen-label').textContent = 'При ' + state.leverage + '×';
    el('movement-outcomes').hidden = state.step === 2;
    el('risk-outcomes').hidden = state.step !== 2;
  }
  function renderQuiz() {
    const question = model.questionFor(state.step, state.variants[state.step]);
    const answer = state.answers[state.step];
    const answered = answer !== null;
    const correct = passed(state.step);
    el('quiz-question').textContent = question.prompt;
    question.options.forEach((option, index) => {
      const button = el('quiz-answer-' + index);
      button.textContent = option.label;
      button.disabled = answered;
      button.setAttribute('aria-pressed', String(answer === option.value));
      button.className = answer === option.value ? (correct ? 'correct' : 'wrong') : '';
      button.onclick = () => {
        if (state.answers[state.step] !== null) return;
        const wasComplete = model.isComplete(state);
        state.answers[state.step] = option.value;
        if(option.value!==question.correct&&window.InsweepReviewStore){
          if(!reviewAttempt)reviewAttempt=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
          window.InsweepReviewStore.recordError(state.step===2?'sizing':'leverage','leverage',JSON.stringify([reviewAttempt,state.step,state.variants[state.step],option.value]));
        }
        save(); render();
        if (!wasComplete && model.isComplete(state)) {
          el('completion-title').scrollIntoView({block:'start'});
          el('completion-title').focus({preventScroll:true});
        }
      };
    });
    const feedback = el('quiz-feedback');
    feedback.hidden = !answered;
    feedback.textContent = answered ? (correct ? 'Верно. ' : 'Разберёмся. ') + question.explanation : '';
    feedback.className = 'leverage-feedback ' + (correct ? 'is-correct' : 'is-wrong');
    el('retry-question').hidden = !answered || correct;
    el('previous-experiment').hidden = state.step === 0;
    el('next-experiment').hidden = state.step === 2;
    el('next-experiment').disabled = !correct;
    el('checks-count').textContent = state.answers.filter((_, index) => passed(index)).length + ' / 3 проверок';
  }
  function render() {
    const lesson = copy[state.step];
    el('experiment-count').textContent = 'ОПЫТ ' + (state.step + 1) + ' / 3';
    el('experiment-title').textContent = lesson.title;
    el('experiment-copy').textContent = lesson.copy;
    el('experiment-fixed').textContent = lesson.fixed;
    el('experiment-takeaway').textContent = lesson.takeaway;
    all('[data-step]').forEach(button => {
      const step = Number(button.dataset.step);
      button.disabled = !canVisit(step);
      button.setAttribute('aria-pressed', String(step === state.step));
      button.classList.toggle('is-complete', passed(step));
      el('experiment-status-' + step).textContent = passed(step) ? '✓' : step === state.step ? '●' : '○';
    });
    all('[data-side]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.side === state.side)));
    all('[data-leverage]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.leverage) === state.leverage)));
    renderComparison(); renderQuiz(); renderRewards(); renderCoach(); renderPersonalPractice();
    el('lesson-complete').hidden = !model.isComplete(state);
    if (storageWarning) storageNotice(storageWarning);
  }
  function visit(step) {
    if (!canVisit(step) || step < 0 || step > 2) return;
    state.step = step;
    save(); render();
    el('experiment-title').focus();
  }
  all('[data-step]').forEach(button => { button.onclick = () => visit(Number(button.dataset.step)); });
  all('[data-side]').forEach(button => { button.onclick = () => {
    const side = button.dataset.side;
    if (!['long','short'].includes(side)) return;
    state.side = side; save(); render();
  }; });
  all('[data-leverage]').forEach(button => { button.onclick = () => {
    const leverage = Number(button.dataset.leverage);
    if (![2,5,10].includes(leverage)) return;
    state.leverage = leverage; save(); render();
  }; });
  el('next-experiment').onclick = () => { if (passed(state.step)) visit(state.step + 1); };
  el('previous-experiment').onclick = () => visit(state.step - 1);
  el('retry-question').onclick = () => {
    if (state.answers[state.step] === null || passed(state.step)) return;
    // Questions alternate wording. Keep the persisted variant in the validated range.
    state.variants[state.step] = state.variants[state.step] === 1000 ? 1 : state.variants[state.step] + 1;
    state.answers[state.step] = null;
    save(); render(); el('quiz-question').focus();
  };
  el('reset-lesson').onclick = () => {
    if (!window.confirm('Начать эти три опыта заново? Прогресс прежних уроков и уже полученные достижения сохранятся.')) return;
    state = model.initialState();
    try { window.localStorage.removeItem(model.STORAGE_KEY); storageNotice(''); }
    catch (_) { unavailableStorage(); }
    render(); el('experiment-title').focus();
  };
  render();
  if(typeof window.addEventListener==='function'){
    window.addEventListener('pageshow',renderPersonalPractice);
    window.addEventListener('storage',event=>{if(event.key===null||event.key===window.InsweepReview?.STORAGE_KEY)renderPersonalPractice();});
  }
})();
