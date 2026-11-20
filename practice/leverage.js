/* Synthetic linear USDT arithmetic. No exchange, account or liquidation model. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InsweepLeverage = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const STORAGE_KEY = 'insweep-leverage-v1';
  const QUANTITY_SCALE = 1e8;

  function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${name} must be finite and numeric`);
    return value;
  }
  function positive(value, name) {
    finite(value, name);
    if (value <= 0) throw new RangeError(`${name} must be positive`);
    return value;
  }
  function validate(options, movement) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Options must be an object');
    if (options.side !== 'long' && options.side !== 'short') throw new RangeError('side must be long or short');
    positive(options.entry, 'entry');
    finite(options.leverage, 'leverage');
    if (options.leverage < 1) throw new RangeError('leverage must be at least one');
    finite(options.feeRate, 'feeRate');
    if (options.feeRate < 0 || options.feeRate >= 1) throw new RangeError('feeRate must be between zero inclusive and one exclusive');
    if (movement) {
      finite(options.movePct, 'movePct');
      if (options.movePct < 0 || options.movePct >= 100) throw new RangeError('movePct must be between zero inclusive and one hundred exclusive');
    }
  }
  function row(side, entry, qty, leverage, feeRate) {
    positive(qty, 'qty');
    const notional = positive(entry * qty, 'notional');
    const initialMargin = positive(notional / leverage, 'initialMargin');
    const entryFee = finite(notional * feeRate, 'entryFee');
    return {side, entry, qty, notional, leverage, initialMargin, entryFee};
  }
  function outcome(position, exit, feeRate) {
    positive(exit, 'exit');
    const sign = position.side === 'long' ? 1 : -1;
    const grossPnl = finite(sign * position.qty * (exit - position.entry), 'grossPnl');
    const exitFee = finite(position.qty * exit * feeRate, 'exitFee');
    const totalFees = finite(position.entryFee + exitFee, 'totalFees');
    const pnl = finite(grossPnl - totalFees, 'pnl');
    return {exit, grossPnl, exitFee, totalFees, pnl};
  }
  function movementRow(options, qty, leverage) {
    const position = row(options.side, options.entry, qty, leverage, options.feeRate);
    position.up = outcome(position, options.entry * (1 + options.movePct / 100), options.feeRate);
    position.down = outcome(position, options.entry * (1 - options.movePct / 100), options.feeRate);
    return position;
  }
  function compareQuantity(options) {
    validate(options, true);
    positive(options.qty, 'qty');
    return {
      mode:'quantity',
      baseline:movementRow(options, options.qty, 1),
      chosen:movementRow(options, options.qty, options.leverage)
    };
  }
  function compareMargin(options) {
    validate(options, true);
    positive(options.margin, 'margin');
    const chosenNotional = positive(options.margin * options.leverage, 'notional');
    return {
      mode:'margin',
      baseline:movementRow(options, options.margin / options.entry, 1),
      chosen:movementRow(options, chosenNotional / options.entry, options.leverage)
    };
  }
  function riskRow(options, qty, leverage) {
    const position = row(options.side, options.entry, qty, leverage, options.feeRate);
    position.stop = outcome(position, options.stop, options.feeRate);
    position.plannedLoss = positive(-position.stop.pnl, 'plannedLoss');
    position.feesReserve = position.stop.totalFees;
    position.marginPlusFees = positive(position.initialMargin + position.feesReserve, 'marginPlusFees');
    return position;
  }
  function compareRisk(options) {
    validate(options, false);
    positive(options.stop, 'stop');
    positive(options.riskBudget, 'riskBudget');
    if ((options.side === 'long' && options.stop >= options.entry) ||
        (options.side === 'short' && options.stop <= options.entry)) throw new RangeError('stop must be on the adverse side of entry');
    const unitLoss = positive(Math.abs(options.entry - options.stop) +
      options.entry * options.feeRate + options.stop * options.feeRate, 'unitLoss');
    let units = Math.floor(options.riskBudget / unitLoss * QUANTITY_SCALE);
    if (!Number.isSafeInteger(units) || units <= 0) throw new RangeError('riskBudget must yield a representable positive eight-decimal quantity');
    let baseline = riskRow(options, units / QUANTITY_SCALE, 1);
    // Floating division can round upward at an exact boundary. Verify the same
    // cash-loss calculation displayed to the learner, then remove one increment.
    while (baseline.plannedLoss > options.riskBudget) {
      units -= 1;
      if (units <= 0) throw new RangeError('riskBudget is smaller than one quantity increment');
      baseline = riskRow(options, units / QUANTITY_SCALE, 1);
    }
    return {mode:'risk', baseline, chosen:riskRow(options, baseline.qty, options.leverage)};
  }

  function integer(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }
  function questionFor(step, variant) {
    if (!integer(step, 0, 2) || !integer(variant, 0, 1000)) throw new RangeError('Question step or variant is out of range');
    const alternate = variant % 2 === 1;
    const questions = [
      {
        prompt:alternate
          ? 'В обеих учебных позициях 0,02 BTC. Плечо меняется с 1× на 10×, цены и тариф одинаковы. Как изменится денежный результат?'
          : 'Количество остаётся 0,01 BTC. Меняем плечо с 1× на 5× при тех же ценах и тарифе. Как изменится денежный результат?',
        options:[
          {value:'same', label:'Останется тем же'},
          {value:'more', label:'Увеличится вместе с плечом'},
          {value:'less', label:'Уменьшится вместе с маржой'}
        ],
        correct:'same',
        explanation:'При одинаковом количестве BTC и тех же ценах денежный PnL и обе комиссии одинаковы. Плечо меняет расчётную начальную маржу: стоимость позиции делится на плечо.'
      },
      {
        prompt:alternate
          ? 'Начальная маржа остаётся 200 учебных USDT. При той же цене плечо 10× позволяет взять больше BTC, чем 1×. Что увеличится?'
          : 'При одинаковой начальной марже 100 учебных USDT плечо 5× увеличивает количество BTC относительно 1×. Что меняется при одинаковом движении цены?',
        options:[
          {value:'both', label:'И прибыль, и убыток, и обе комиссии растут'},
          {value:'profit-only', label:'Растёт только прибыль'},
          {value:'unchanged', label:'Денежные исходы остаются прежними'}
        ],
        correct:'both',
        explanation:'При той же начальной марже большее плечо здесь означает больше BTC и большую стоимость позиции. Поэтому увеличиваются благоприятный и неблагоприятный денежные исходы, комиссия входа и комиссия выхода.'
      },
      {
        prompt:alternate
          ? 'Стоп и бюджет риска 20 учебных USDT сохраняются. Выбираем плечо 10× вместо 1×. Как поступить с рассчитанным количеством?'
          : 'Стоп и бюджет риска 10 учебных USDT уже заданы. Плечо меняется с 1× на 5×. Что нужно сделать с количеством BTC?',
        options:[
          {value:'keep', label:'Сохранить количество и денежный риск'},
          {value:'multiply', label:'Умножить количество на новое плечо'},
          {value:'move-stop', label:'Отодвинуть стоп, чтобы увеличить количество'}
        ],
        correct:'keep',
        explanation:'Количество рассчитывается от расстояния до стопа и бюджета риска с обеими комиссиями внутри бюджета. Смена плеча сама по себе не увеличивает количество или риск; уменьшается только расчётная начальная маржа. Расходы резервируются отдельно от неё.'
      }
    ];
    return questions[step];
  }
  function initialState() {
    return {version:1, step:0, leverage:5, side:'long', variants:[0,0,0], answers:[null,null,null]};
  }
  function validatedState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state) || state.version !== 1 ||
        !integer(state.step, 0, 2) || ![2,5,10].includes(state.leverage) ||
        !['long','short'].includes(state.side) || !Array.isArray(state.variants) ||
        state.variants.length !== 3 || !state.variants.every(value => integer(value, 0, 1000)) ||
        !Array.isArray(state.answers) || state.answers.length !== 3) return null;
    let earlierPassed = true;
    for (let step = 0; step < 3; step += 1) {
      const question = questionFor(step, state.variants[step]);
      const answer = state.answers[step];
      if (answer !== null && !question.options.some(option => option.value === answer)) return null;
      if (!earlierPassed && (state.step >= step || answer !== null)) return null;
      earlierPassed = earlierPassed && answer === question.correct;
    }
    return {version:1, step:state.step, leverage:state.leverage, side:state.side,
      variants:state.variants.slice(), answers:state.answers.slice()};
  }
  function restoreState(raw) {
    if (typeof raw !== 'string') return null;
    try { return validatedState(JSON.parse(raw)); }
    catch (_) { return null; }
  }
  function isComplete(state) {
    try {
      const restored = validatedState(state);
      return !!restored && restored.answers.every((answer, step) => answer === questionFor(step, restored.variants[step]).correct);
    } catch (_) { return false; }
  }
  return {compareQuantity, compareMargin, compareRisk, questionFor, initialState, restoreState, isComplete, STORAGE_KEY};
});
