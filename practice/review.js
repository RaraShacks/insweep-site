/* Local educational checks and arithmetic. No trading or proficiency claims. */
(function (root, factory) {
  const commonJS = typeof module === 'object' && module.exports;
  const api = factory(commonJS ? require('./position.js') : root.InsweepPosition,
    commonJS ? require('./plan.js') : root.InsweepPlan);
  if (commonJS) module.exports = api;
  else root.InsweepReview = api;
})(typeof window === 'undefined' ? globalThis : window, function (positions, plans) {
  'use strict';
  const STORAGE_KEY = 'insweep-review-v1';
  const RECHECK_DELAY_MS = 86400000;
  const FEE = 0.001;
  const TOPICS = Object.freeze([
    {id:'direction', title:'Направление', explanation:'Лонг получает положительный результат до расходов при росте цены, шорт — при снижении. Комиссии считаются отдельно.'},
    {id:'fees', title:'Комиссии', explanation:'Расходы возникают на входе и на выходе. Даже при неизменной цене они уменьшают результат.'},
    {id:'levels', title:'Стоп и цель', explanation:'Для лонга стоп ниже входа, цель выше; для шорта стоп выше входа, цель ниже. Это проверка порядка уровней, а не качества торговой идеи.'},
    {id:'condition', title:'Условие входа', explanation:'Сначала проверяют заранее заданное условие. В упражнении «не ниже» включает равенство, «не выше» тоже включает равенство.'},
    {id:'loss', title:'Плановый убыток', explanation:'Плановый убыток включает движение до стопа и комиссии входа и выхода. Стоп не гарантирует фактическую цену исполнения.'},
    {id:'sizing', title:'Размер позиции', explanation:'Количество ограничивают бюджетом риска с расходами и доступными средствами. Округление количества делают вниз.'},
    {id:'leverage', title:'Плечо и риск', explanation:'При тех же количестве, входе и стопе изменение плеча меняет требуемую маржу, но не денежный результат движения цены. Ликвидация и биржевые расходы требуют отдельной проверки.'},
  ].map(Object.freeze));
  const topicIds = new Set(TOPICS.map(t => t.id));
  const sources = new Set(['intro','plan','practice','assessment','leverage','review']);
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return typeof value === 'string' && value.trim().length > 0; }
  function time(value) { return Number.isSafeInteger(value) && value >= 0; }
  function json(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (!object(value) && !Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const valid = Object.values(value).every(v => json(v, seen));
    seen.delete(value);
    return valid;
  }
  function validEvent(e) {
    return object(e) && json(e) && text(e.id) && ['error','answer','seen'].includes(e.kind)
      && topicIds.has(e.topic) && time(e.at) && sources.has(e.source)
      && (e.kind !== 'seen' || text(e.episodeId))
      && (e.kind !== 'answer' || (typeof e.correct === 'boolean' && typeof e.assisted === 'boolean'
        && typeof e.fresh === 'boolean' && text(e.exerciseId) && text(e.episodeId)));
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function initialState() { return {version:1, events:[], seenEpisodeIds:[]}; }
  function normalized(raw) {
    if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.events) || !raw.events.every(validEvent)) return null;
    const exposures = Object.prototype.hasOwnProperty.call(raw,'seenEpisodeIds') ? raw.seenEpisodeIds : [];
    if (!Array.isArray(exposures) || !exposures.every(text) || new Set(exposures).size !== exposures.length) return null;
    const seenEpisodeIds = new Set(exposures);
    const ids = new Set();
    const events = raw.events.filter(e => { if (ids.has(e.id)) return false; ids.add(e.id); return true; });
    events.sort((a,b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // Exposure is durable even after its detailed event leaves the rolling log.
    for (const event of events) if (event.kind === 'seen' || event.kind === 'answer') seenEpisodeIds.add(event.episodeId);
    return {version:1, events:clone(events.slice(-1000)), seenEpisodeIds:[...seenEpisodeIds]};
  }
  function restoreState(raw) {
    if (raw === null) return initialState();
    try { return normalized(typeof raw === 'string' ? JSON.parse(raw) : raw); }
    catch (_) { return null; }
  }
  function requireState(state) {
    const valid = normalized(state);
    if (!valid) throw new TypeError('Invalid review state');
    return valid;
  }
  function recordEvent(state, event) {
    const valid = requireState(state);
    if (!validEvent(event)) throw new TypeError('Invalid review event');
    return normalized({version:1, events:valid.events.concat(event), seenEpisodeIds:valid.seenEpisodeIds});
  }
  function summarize(state, now) {
    if (!time(now)) throw new RangeError('now must be Unix milliseconds');
    const events = requireState(state).events.filter(e => e.at <= now);
    const summaries = TOPICS.map(t => ({id:t.id, title:t.title, status:'unseen', errors:0, correct:0, lastAt:null, nextAt:null}));
    const byTopic = new Map(summaries.map(t => [t.id,t]));
    const answeredEpisodes = new Set(), answeredExercises = new Set(), seenExercises = new Map();
    for (const e of events) {
      if (e.kind === 'seen') {
        if (text(e.exerciseId)) {
          if (!seenExercises.has(e.episodeId)) seenExercises.set(e.episodeId,new Set());
          seenExercises.get(e.episodeId).add(e.exerciseId);
        }
        continue;
      }
      const row = byTopic.get(e.topic);
      row.lastAt = e.at;
      if (e.kind === 'error' || !e.correct) {
        row.errors++;
        row.status = 'needs-practice';
        row.nextAt = null;
      } else {
        row.correct++;
        const views = seenExercises.get(e.episodeId);
        const shownInAnotherExercise = views && [...views].some(id => id !== e.exerciseId);
        const independent = !e.assisted && e.fresh && !shownInAnotherExercise
          && !answeredEpisodes.has(e.episodeId) && !answeredExercises.has(e.exerciseId);
        if (independent) {
          if (row.nextAt !== null && e.at >= row.nextAt) {
            row.status = 'rechecked'; row.nextAt = null;
          } else if (row.status !== 'rechecked' && row.nextAt === null) {
            row.status = 'waiting'; row.nextAt = e.at + RECHECK_DELAY_MS;
          }
        } else if (row.status === 'unseen') row.status = 'needs-practice';
      }
      if (e.kind === 'answer') {
        answeredEpisodes.add(e.episodeId);
        answeredExercises.add(e.exerciseId);
      }
    }
    for (const row of summaries) if (row.status === 'waiting' && now >= row.nextAt) row.status = 'due';
    return summaries;
  }
  function recommend(state, now) {
    const rows = summarize(state,now);
    for (const [status,mode] of [['due','recheck'],['needs-practice','practice'],['unseen','diagnostic']]) {
      const row = rows.find(r => r.status === status);
      if (row) return {topicId:row.id, mode};
    }
    return null;
  }
  function validEpisode(episode) {
    return object(episode) && text(episode.id) && Array.isArray(episode.candles) && episode.candles.length >= 60
      && episode.candles.every(c => object(c) && c.closed === true
        && ['open','high','low','close'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k]) && c[k] > 0)
        && c.low <= Math.min(c.open,c.close) && c.high >= Math.max(c.open,c.close) && c.low <= c.high);
  }
  function selectEpisode(state, episodes) {
    const valid = requireState(state);
    if (!Array.isArray(episodes)) throw new TypeError('episodes must be an array');
    const available = episodes.filter(validEpisode);
    if (!available.length) return null;
    const familiar = new Set(valid.seenEpisodeIds);
    const fresh = available.find(e => !familiar.has(e.id));
    return {episode:fresh || available[0], fresh:!!fresh};
  }
  function questionFor(topicId, episode, variant = 0) {
    if (!topicIds.has(topicId)) throw new RangeError('Unknown review topic');
    if (!validEpisode(episode)) throw new TypeError('Episode needs at least 60 verified closed OHLC candles');
    if (!Number.isSafeInteger(variant) || variant < 0) throw new RangeError('variant must be a nonnegative integer');
    const price = episode.candles[59].close;
    const short = variant % 2 === 1;
    const side = short ? 'short' : 'long';
    const qty = 1 + variant % 3;
    const entry = price;
    const distance = entry * (0.02 + Math.floor(variant / 2) % 3 * 0.005);
    // Use exactly the displayed two-decimal levels for every calculation.
    const stop = Number((entry + (short ? distance : -distance)).toFixed(2));
    const target = Number((entry + (short ? -2*distance : 2*distance)).toFixed(2));
    const num = n => n.toFixed(2);
    const topic = TOPICS.find(t => t.id === topicId);
    let prompt, correct, options, explanation = topic.explanation;
    const context = [
      `Исторический контекст: цена закрытия 60-й показанной минуты — ${price} USDT.`,
      'Следующие цены, уровни и движения заданы только для упражнения; это не описание будущего исторического движения.',
      'Учебная комиссия: 0,1% на входе и 0,1% на выходе; это не актуальный тариф биржи.',
    ];
    const option = (value,label=value) => ({value:String(value),label:String(label)});
    function amounts(value, others, unit) {
      correct = num(value);
      options = [value,...others].map(n => option(num(n), `${num(n)} ${unit}`));
    }
    if (topicId === 'direction') {
      prompt = `В условном движении цена ${short ? 'снижается' : 'растёт'} на ${num(distance)} USDT. Какое направление даёт положительный результат до комиссий?`;
      correct = side;
      options = [option('long','Лонг'), option('short','Шорт'), option('neither','Ни одно')];
    } else if (topicId === 'fees') {
      const position = positions.openPosition({side,entry,amount:qty*entry*(1+FEE),feeRate:FEE});
      const fees = positions.closePosition(position,entry,FEE).totalFees;
      prompt = `Учебная позиция ${side}, ${qty} BTC: вход и выход по ${entry} USDT. Какова сумма двух комиссий? Округли до 0,01 USDT.`;
      amounts(fees,[fees/2,0,fees*2],'USDT');
      explanation += ` ${qty} × ${entry} × 0,001 × 2 = ${num(fees)} USDT.`;
    } else if (topicId === 'levels') {
      prompt = `Для учебного ${side === 'long' ? 'лонга' : 'шорта'} со входом ${entry} USDT выбери правильный порядок стопа и цели.`;
      correct = 'valid';
      options = [option('valid',`Стоп ${num(stop)}; цель ${num(target)}`), option('reversed',`Стоп ${num(target)}; цель ${num(stop)}`), option('equal',`Стоп ${num(entry)}; цель ${num(target)}`)];
    } else if (topicId === 'condition') {
      const threshold = entry * (short ? 0.99 : 1.01);
      const kind = short ? 'below' : 'above';
      const met = plans.conditionMet({kind,price:threshold},entry);
      prompt = `Условие: входить только по цене ${short ? 'не выше' : 'не ниже'} ${num(threshold)} USDT. Проверяемая цена — ${entry} USDT. Условие выполнено?`;
      correct = met ? 'enter' : 'wait';
      options = [option('enter','Да, условие выполнено'),option('wait','Нет, пока ждать')];
    } else if (topicId === 'loss') {
      const position = positions.openPosition({side,entry,amount:qty*entry*(1+FEE),feeRate:FEE});
      const loss = -positions.closePosition(position,stop,FEE).pnl;
      const grossLoss = qty*Math.abs(entry-stop);
      prompt = `Учебный ${side === 'long' ? 'лонг' : 'шорт'}, ${qty} BTC: вход ${entry}, стоп ${num(stop)} USDT. Рассчитай плановый убыток с двумя комиссиями до 0,01 USDT.`;
      amounts(loss,[grossLoss,loss+qty*entry*FEE,loss/2],'USDT');
      explanation += ` Движение до стопа: ${num(grossLoss)}; обе комиссии: ${num(loss-grossLoss)}; всего ${num(loss)} USDT.`;
    } else if (topicId === 'sizing') {
      const riskBudget = 10 + variant % 3 * 5;
      const availableCash = Math.max(10000, entry*100);
      const plan = plans.calculatePlan({side,entry,stop,target,riskBudget,availableCash,feeRate:FEE});
      correct = plan.qty.toFixed(8);
      const noFees = Math.floor(riskBudget/Math.abs(entry-stop)*1e8)/1e8;
      options = [option(correct,`${correct} BTC`),option(noFees.toFixed(8),`${noFees.toFixed(8)} BTC`),option((plan.qty*2).toFixed(8),`${(plan.qty*2).toFixed(8)} BTC`)];
      prompt = `Учебный ${side === 'long' ? 'лонг' : 'шорт'}: вход ${entry}, стоп ${num(stop)} USDT. Бюджет планового убытка ${riskBudget} USDT, доступно ${availableCash} USDT. Какое наибольшее количество укладывается в риск с двумя комиссиями? Округли вниз до 8 знаков.`;
      explanation += ` Убыток на 1 BTC: |${entry} − ${num(stop)}| + ${entry} × 0,001 + ${num(stop)} × 0,001. Количество: ${correct} BTC.`;
    } else {
      const from = 2 + variant % 3;
      prompt = `Условная позиция: ${qty} BTC, вход ${entry}, стоп ${num(stop)} USDT. Если изменить плечо с ${from}× на ${from*2}× при тех же количестве и ценах, как изменится денежный результат движения до стопа (без ликвидации)?`;
      correct = 'same';
      options = [option('same','Останется тем же'),option('double','Удвоится'),option('half','Уменьшится вдвое')];
    }
    // Rotate rather than randomize: reload reproduces the same options and answer.
    const shift = variant % options.length;
    options = options.slice(shift).concat(options.slice(0,shift));
    return {id:`review:${topicId}:${encodeURIComponent(episode.id)}:${variant}`,topicId,episodeId:episode.id,prompt,options,correct,explanation,context};
  }
  return {STORAGE_KEY,RECHECK_DELAY_MS,TOPICS,initialState,restoreState,recordEvent,summarize,recommend,selectEpisode,questionFor};
});
