/* Pure feedback for the educational insweep model. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InsweepLearning = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const positive = value => finite(value) && value > 0;
  const sideKnown = side => side === 'long' || side === 'short';
  const amount = value => finite(value) ? value.toFixed(2) : 'не задано';
  const closeEnough = (actual, expected) => finite(actual) && finite(expected)
    && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));

  function taskFor(lesson, referencePrice) {
    const titles = { plan: 'План с объяснениями', practice: 'Практика плана', assessment: 'Самостоятельный план' };
    if (!Object.hasOwn(titles, lesson) || !positive(referencePrice)) {
      throw new RangeError('A known lesson and a finite positive reference price are required');
    }
    const expectedSide = lesson === 'assessment' ? 'short' : 'long';
    const movement = expectedSide === 'long' ? 'рост цены (лонг)' : 'снижение цены (шорт)';
    return {
      id: lesson,
      title: titles[lesson],
      idea: `Учебная идея: рассмотреть ${movement} от раскрытой цены ${referencePrice} USDT. `
        + 'Самостоятельно задай условие входа, стоп, цель и бюджет риска. '
        + 'Это задание по составлению плана, не торговый сигнал. Единственного правильного рыночного уровня здесь нет.',
      expectedSide,
    };
  }

  function decimal(value) {
    if (finite(value)) return value;
    if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value.trim())) return NaN;
    const number = Number(value.trim().replace(',', '.'));
    return finite(number) ? number : NaN;
  }

  function conditionText(condition) {
    if (condition.kind === 'now') return 'на текущей раскрытой цене';
    if (condition.kind === 'above') return `когда цена не ниже ${amount(condition.price)} USDT`;
    if (condition.kind === 'below') return `когда цена не выше ${amount(condition.price)} USDT`;
    return 'условие входа пока не задано';
  }

  function assessPlan(input) {
    const plan = input && input.plan || {};
    const answers = input && input.answers || {};
    const task = input && input.task || {};
    const condition = plan.condition || {};
    const checks = [];
    function add(id, ok, success, failure) {
      checks.push({ id, ok: Boolean(ok), message: ok ? success : failure });
    }

    const direction = sideKnown(plan.side) && sideKnown(task.expectedSide) && plan.side === task.expectedSide;
    const expectedName = task.expectedSide === 'long' ? 'рост — лонг' : task.expectedSide === 'short' ? 'снижение — шорт' : null;
    add('direction', direction,
      'Выбранное направление соответствует заданной учебной идее.',
      expectedName ? `В задании рассматривается ${expectedName}. Выбери направление для этой идеи.`
        : 'Нужно задать учебную идею и выбрать лонг или шорт.');

    const levels = sideKnown(plan.side) && [plan.entry, plan.stop, plan.target].every(positive)
      && (plan.side === 'long' ? plan.stop < plan.entry && plan.entry < plan.target
        : plan.target < plan.entry && plan.entry < plan.stop);
    add('levels', levels,
      'Стоп и цель находятся по нужным сторонам входа. Это проверка порядка цен, а не качества рыночных уровней.',
      plan.side === 'short'
        ? `Для шорта цель должна быть ниже входа ${amount(plan.entry)} USDT, а стоп выше. Равные цены не подходят.`
        : `Для лонга стоп должен быть ниже входа ${amount(plan.entry)} USDT, а цель выше. Цены должны быть положительными числами.`);

    const kindKnown = ['now', 'above', 'below'].includes(condition.kind);
    const thresholdValid = [plan.stop, plan.target].every(positive) && positive(condition.price)
      && condition.price > Math.min(plan.stop, plan.target) && condition.price < Math.max(plan.stop, plan.target);
    const conditionValid = levels && kindKnown && (condition.kind === 'now' || thresholdValid);
    add('condition', conditionValid,
      `Условие входа задано: ${conditionText(condition)}. Для порога подходит и равенство цене.`,
      `Выбери вход сейчас или условие «не ниже / не выше». Цена порога должна быть положительным числом строго между стопом ${amount(plan.stop)} и целью ${amount(plan.target)} USDT.`);

    // calculatePlan returns entryFee rather than feeRate. Recover the model rate
    // to check its own quantities and both closing costs without exchange data.
    const monetaryFields = [plan.riskBudget, plan.qty, plan.allocated, plan.plannedLoss, plan.plannedReward, plan.rewardRisk];
    const baseValid = levels && monetaryFields.every(positive) && finite(plan.entryFee) && plan.entryFee >= 0;
    const feeRate = baseValid ? plan.entryFee / (plan.qty * plan.entry) : NaN;
    const expectedLoss = plan.qty * Math.abs(plan.entry - plan.stop) + plan.entryFee + plan.qty * plan.stop * feeRate;
    const expectedReward = plan.qty * Math.abs(plan.target - plan.entry) - plan.entryFee - plan.qty * plan.target * feeRate;
    const budget = baseValid && finite(feeRate) && feeRate >= 0 && feeRate < 1
      && plan.plannedLoss <= plan.riskBudget
      && closeEnough(plan.allocated, plan.qty * plan.entry + plan.entryFee)
      && closeEnough(plan.plannedLoss, expectedLoss)
      && closeEnough(plan.plannedReward, expectedReward)
      && closeEnough(plan.rewardRisk, plan.plannedReward / plan.plannedLoss);
    let budgetFailure = 'Нужны положительные числовые бюджет риска, объём и суммы плана. Пересчитай объём и расходы для этих уровней.';
    if (positive(plan.plannedLoss) && positive(plan.riskBudget) && plan.plannedLoss > plan.riskBudget) {
      budgetFailure = `Плановый убыток ${amount(plan.plannedLoss)} USDT превышает бюджет ${amount(plan.riskBudget)} USDT. Уменьши объём или пересмотри план до входа.`;
    } else if (finite(plan.plannedReward) && plan.plannedReward <= 0) {
      budgetFailure = `На цели результат после расходов ${amount(plan.plannedReward)} USDT. Для этого задания нужна цель с положительным чистым результатом; проверь расстояние и комиссии.`;
    }
    add('budget', budget,
      `Плановый убыток с расходами ${amount(plan.plannedLoss)} USDT внутри бюджета ${amount(plan.riskBudget)} USDT; результат на цели положителен. Стоп не гарантирует фактический предел убытка.`,
      budgetFailure);

    add('entry', conditionValid && answers.entryKind === condition.kind,
      `Условие объяснено верно: вход ${conditionText(condition)}. Это учебное решение, а не биржевая заявка.`,
      `Сверь ответ со своим планом: вход ${conditionText(condition)}. Условия «не ниже» и «не выше» включают равенство порогу.`);
    add('cancel', levels && answers.cancelAt === 'stop',
      `Стоп ${amount(plan.stop)} USDT выбран границей отмены идеи.`,
      `Граница отмены этой идеи — стоп ${amount(plan.stop)} USDT. Цель описывает благоприятный выход, а не отмену идеи.`);

    const statedLoss = decimal(answers.loss);
    const lossCorrect = positive(plan.plannedLoss) && positive(statedLoss)
      && Math.abs(statedLoss - plan.plannedLoss) <= 0.02 + Number.EPSILON * Math.max(1, plan.plannedLoss) * 4;
    add('loss', lossCorrect,
      `Верно: плановый убыток ${amount(plan.plannedLoss)} USDT включает движение до стопа и комиссии входа и выхода. Это расчёт, а не гарантия исполнения.`,
      `Укажи денежный убыток на стопе с расходами: в этом плане ${amount(plan.plannedLoss)} USDT. Нужны движение до стопа и комиссии входа и выхода; это не вся стоимость позиции.`);
    add('sizing', answers.sizing === 'smaller',
      'При расчёте только по бюджету риска, без ограничения доступными средствами, более далёкий стоп требует меньшего количества: риск каждой единицы растёт. Если объём ограничен доступными средствами, фактическое количество может остаться прежним.',
      'При расчёте только по бюджету риска, без ограничения доступными средствами, дальний стоп увеличивает риск каждой единицы. Поэтому количество нужно уменьшить при том же бюджете. Если калькулятор ограничен доступными средствами, фактическое количество может остаться прежним.');
    const hasRationale = typeof plan.rationale === 'string' && plan.rationale.trim().length >= 12;
    add('rationale', hasRationale,
      'Обоснование записано. Проверено наличие текста; его смысл и качество рыночного анализа автоматически не оцениваются.',
      'Запиши в плане обоснование хотя бы из 12 символов: почему рассматриваешь идею и где она отменяется. Здесь проверяется наличие текста, а не смысл анализа.');

    const needs = checks.filter(item => !item.ok).map(item => item.id);
    return { passed: needs.length === 0, checks, needs };
  }

  function questionFor(topic, side, variant = 0, trade = null) {
    if (!['direction', 'fees'].includes(topic) || !sideKnown(side) || !Number.isInteger(variant) || variant < 0) {
      throw new RangeError('A known topic, side and non-negative integer variant are required');
    }
    const retry = variant % 2 === 1;
    const name = side === 'long' ? 'лонг' : 'шорт';
    if (topic === 'direction') {
      const higherClose = retry;
      const improves = side === 'long' ? higherClose : !higherClose;
      const correct = improves ? 'higher' : 'lower';
      return {
        prompt: `У тебя ${name}. Если при том же входе и количестве цена закрытия окажется ${higherClose ? 'выше' : 'ниже'}, как изменится денежный результат?`,
        options: [
          { value: 'lower', label: 'Результат станет ниже' },
          { value: 'higher', label: 'Результат станет выше' },
          { value: 'same', label: 'Результат не изменится' },
        ],
        correct,
        explanation: `${side === 'long' ? 'Лонг выигрывает от роста цены закрытия: его валовой результат — количество × (закрытие − вход).'
          : 'Шорт выигрывает от снижения цены закрытия: его валовой результат — количество × (вход − закрытие).'} `
          + `Поэтому при закрытии ${higherClose ? 'выше' : 'ниже'} результат станет ${improves ? 'выше' : 'ниже'}. Комиссии отдельно уменьшают чистый итог.`,
      };
    }
    if (!retry && trade && finite(trade.grossPnl) && finite(trade.totalFees)) {
      const gross = trade.grossPnl;
      const fees = trade.totalFees;
      const net = gross - fees;
      const displayedGross = Number(gross.toFixed(2));
      const displayedFees = Number(fees.toFixed(2));
      const displayedNet = displayedGross - displayedFees;
      // Use actual trades only when cent rounding still teaches the same sign.
      // Near zero, the unchanged-price example avoids a misleading comparison.
      const eligible = Math.abs(gross) >= 0.01 && fees >= 0.01 && finite(net) && Math.abs(net) >= 0.015
        && finite(displayedNet) && Math.sign(displayedNet) === Math.sign(net);
      if (eligible) {
        const shownGross = gross.toFixed(2).replace('.', ',');
        const shownFees = fees.toFixed(2).replace('.', ',');
        const outcome = net > 0
          ? 'В этой позиции движение цены покрывает обе комиссии, поэтому чистый итог положительный.'
          : gross > 0
            ? 'Движение цены было благоприятным, но не покрывает обе комиссии: чистый итог отрицательный.'
            : 'Движение цены уже дало убыток; обе комиссии дополнительно уменьшают чистый итог.';
        return {
          prompt: `Твой закрытый учебный ${name}: валовой результат ${shownGross} USDT, сумма комиссий входа и выхода ${shownFees} USDT. Каков чистый итог по сравнению с 0 USDT?`,
          options: [
            { value: 'lower', label: 'Ниже нуля: убыток' },
            { value: 'higher', label: 'Выше нуля: прибыль' },
            { value: 'same', label: 'Ровно ноль' },
          ],
          correct: net > 0 ? 'higher' : 'lower',
          explanation: `Чистый итог = валовой результат − обе комиссии (вход и выход). Здесь ${shownGross} − ${shownFees} ${net > 0 ? '>' : '<'} 0 USDT. `
            + outcome + ' Даже благоприятное движение может не покрыть обе комиссии. Суммы показаны с округлением до центов.',
        };
      }
    }
    return {
      prompt: retry
        ? `Учебный ${name}: 1 единица по 100 USDT, закрытие тоже по 100 USDT. Комиссия 0,1% на вход и выход. Каков чистый итог по сравнению с 0 USDT?`
        : `Учебный ${name} закрыт по той же цене, что и вход. Есть комиссия на вход и выход. Каков чистый итог по сравнению с нулевым валовым результатом?`,
      options: [
        { value: 'lower', label: 'Ниже нуля: убыток' },
        { value: 'higher', label: 'Выше нуля: прибыль' },
        { value: 'same', label: 'Ровно ноль' },
      ],
      correct: 'lower',
      explanation: retry
        ? 'Движение цены дало 0 USDT. Комиссия входа 0,10 USDT + комиссия выхода 0,10 USDT = 0,20 USDT расходов. Чистый итог: 0 − 0,20 = −0,20 USDT. Это учебные цены и тариф.'
        : 'При одинаковой цене входа и закрытия валовой результат равен нулю. Комиссии платятся и на входе, и на выходе: чистый итог = 0 − обе комиссии, поэтому получается убыток для лонга и шорта.',
    };
  }

  const glossary = [
    { term: 'USDT', definition: 'Криптовалюта, в единицах которой здесь показаны учебные цены, бюджет и результат. В тренажёре используются виртуальные средства.' },
    { term: 'Лонг и шорт', definition: 'Лонг выигрывает от роста цены закрытия, шорт — от снижения при том же входе и количестве. Комиссии уменьшают итог обоих направлений.' },
    { term: 'Стоп', definition: 'Стоп — выбранная граница отмены идеи. Здесь выход проверяется по следующему раскрытому минутному закрытию; фактический убыток может быть больше планового.' },
    { term: 'Цель', definition: 'Цель — выбранная цена благоприятного выхода. Она задаётся до будущих данных и не обещает, что цена её достигнет.' },
    { term: 'Бюджет риска', definition: 'Бюджет риска — сколько учебных USDT отведено на плановый убыток с расходами. Это не стоимость позиции и не гарантия максимального фактического убытка.' },
    { term: 'Количество BTC', definition: 'Количество — объём учебной позиции в BTC. Тренажёр рассчитывает его по стопу, бюджету риска и доступным средствам, округляя вниз.' },
    { term: 'Комиссия', definition: 'Комиссия — расход на каждое открытие и закрытие. Чистый итог равен валовому результату за вычетом обеих комиссий; здесь тариф учебный.' },
    { term: 'Условие входа', definition: 'Условие входа — когда разрешено принять учебное решение: сейчас, при цене не ниже порога или не выше порога. Равенство порогу подходит; само условие не открывает позицию.' },
    { term: 'Закрытие свечи и позиции', definition: 'Закрытие свечи (CLOSE) — последняя цена её минуты. Закрытие позиции — выход из учебной сделки; здесь он происходит по раскрытой цене минутного CLOSE.' },
  ];

  return { taskFor, assessPlan, questionFor, glossary };
});
