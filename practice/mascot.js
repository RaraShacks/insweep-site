/* Pure mascot presentation: this module never grants rewards or changes progress. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InsweepMascot = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const baseImage = 'assets/mascot-variants/poses-v1/babushka-dance.png';
  const reactions = Object.freeze([
    { id: 'first-position', text: 'Есть контакт! Первая учебная позиция открыта. Давай посмотрим, как она меняется.', emotion: 'Радостное одобрение', pose: 'Протягивает кулак для дружеского приветствия' },
    { id: 'direction', text: 'Ага, поймал разницу! Лонг и шорт больше не путаются.', emotion: 'Радость открытия', pose: 'Поднимает палец, будто только что нашёл ответ' },
    { id: 'fees', text: 'Вот это внимательность! Комиссии теперь тоже в расчёте.', emotion: 'Довольная сосредоточенность', pose: 'Загибает пальцы, считая расходы' },
    { id: 'intro-mastered', text: 'Ну всё, первый танец наш! Направление и комиссии разобраны.', emotion: 'Восторг', pose: 'Танцевальный шаг с поднятой ногой' },
    { id: 'levels', text: 'Красиво расставил! Стоп и цель каждый на своём месте.', emotion: 'Уверенное одобрение', pose: 'Держит раскрытые ладони на двух разных высотах' },
    { id: 'risk', text: 'Вот теперь по делу: риск в цифрах, объём посчитан. Уважаю!', emotion: 'Сосредоточенная гордость', pose: 'Слегка присел и придерживает подбородок рукой' },
    { id: 'frozen-plan', text: 'План записан до движения цены. Сильно! Теперь есть с чем сверяться.', emotion: 'Спокойная уверенность', pose: 'Устойчиво стоит со скрещёнными руками и одобрительно кивает' },
    { id: 'patient-entry', text: 'Выдержал паузу и дождался условия. Вот это самообладание!', emotion: 'Спокойное уважение', pose: 'Сидит со скрещёнными ногами, расслабив плечи' },
    { id: 'planned-exit', text: 'Выход по плану — зачёт! Сработал стоп или цель: ты следовал своему условию.', emotion: 'Тёплое одобрение', pose: 'Показывает большой палец, другую руку держит на сердце' },
    { id: 'deliberate-skip', text: 'Не было условия — не стал входить. Чётко! Пропуск тоже решение.', emotion: 'Невозмутимость', pose: 'Выставляет раскрытую ладонь в спокойном жесте стоп' },
    { id: 'practice', text: 'Дай пять! План и объяснение прошли проверку. Следующий шаг — попробовать без подсказок.', emotion: 'Дружеская радость', pose: 'Тянется вперёд с поднятой ладонью, чтобы дать пять' },
    { id: 'independent', text: 'Это уже твоё! Новый план прошёл проверку без подсказок. Можно гордиться этим шагом.', emotion: 'Ликующая гордость', pose: 'Радостно подпрыгивает, подняв руки буквой V' },
    { id: 'leverage-basics', text: 'Разложил по полочкам! Количество, плечо и денежный риск теперь не одно и то же.', emotion: 'Удовлетворение от ясности', pose: 'Сравнивает две раскрытые ладони, как чаши весов' },
  ].map(item => Object.freeze({ ...item, image: item.id === 'intro-mastered' ? baseImage : `assets/mascot-reactions/v1/${item.id}.png` })));
  const byId = new Map(reactions.map(item => [item.id, item]));
  function getReaction(id) { return typeof id === 'string' ? byId.get(id) || null : null; }
  function coach(id, text, reactionId, emotion) {
    const model = getReaction(reactionId) || getReaction('intro-mastered');
    return Object.freeze({ id, text, image: model.image, emotion: emotion || model.emotion, pose: model.pose });
  }
  function getCoach(context) {
    const { lesson, stage, setupStep = 0, mastered = false, hasError = false, conditionReady = false } = context || {};
    // An old achievement is not evidence that the current draft or answer is correct.
    if (hasError || lesson === 'leverage' && stage === 'wrong') return coach('coach-error', 'Нормально, здесь и разбираемся. Прочитай объяснение, исправь один шаг и попробуй ещё раз.', 'risk', 'Бережная сосредоточенность');
    if (mastered) {
      const milestones = { intro: 'intro-mastered', plan: 'frozen-plan', practice: 'practice', assessment: 'independent', leverage: 'leverage-basics' };
      if (Object.hasOwn(milestones, lesson)) return getReaction(milestones[lesson]);
    }
    if (lesson === 'leverage') {
      const step = [0, 1, 2].includes(setupStep) ? setupStep : 0;
      const guides = [
        'Сравни две позиции: что одинаково, а что меняется? Посмотри на количество BTC и денежный результат.',
        'Сравни варианты с одинаковой начальной маржой. Посмотри на количество, оба исхода и расходы.',
        'Сначала проверь стоп и бюджет риска. Затем сравни количество и расчётное обеспечение.',
      ];
      if (stage === 'retry') return coach('coach-leverage-retry', `Новый пример, та же задача. ${guides[step]}`, 'risk', 'Терпеливое внимание');
      if (stage === 'correct') return coach('coach-leverage-correct', [
        'Есть! Проверка связи количества и денежного результата пройдена. Пойдём к следующему опыту.',
        'Точно! Проверка опыта с одинаковой маржой пройдена. Теперь посмотрим на бюджет риска.',
        'Чётко! Проверка расчёта от стопа и бюджета пройдена. Можно собрать выводы трёх опытов.',
      ][step], 'direction', 'Радость понятого шага');
      return coach(['coach-leverage-quantity', 'coach-leverage-margin', 'coach-leverage-risk'][step], guides[step], step === 2 ? 'risk' : 'leverage-basics', 'Исследовательское любопытство');
    }
    if (lesson === 'assessment' && stage === 'setup') return coach('coach-independent', 'Теперь твой ход. Собери план сам и объясни свои решения. Я рядом, а выбор за тобой.', 'frozen-plan', 'Спокойное доверие');
    if (stage === 'armed') return conditionReady === true
      ? coach('coach-ready', 'Условие выполнено. Войти или пропустить — решаешь ты. Сверься со своим планом.', 'frozen-plan', 'Внимательная готовность')
      : coach('coach-wait', 'Не торопимся. Условие пока не выполнено. Ждать или пропустить — тоже часть плана.', 'patient-entry', 'Терпеливое спокойствие');
    if (stage === 'setup' && lesson === 'plan') {
      if (setupStep === 0) return coach('coach-levels', 'Начни прямо с графика: нажми, чтобы поставить стоп и цель. Потом двигай линии за подпись ↕ — точная цена будет рядом. Вводить цифры сразу не нужно.', 'levels', 'Внимательное участие');
      if (setupStep === 1) return coach('coach-risk', 'Теперь бюджет риска. Посмотри, как стоп и расходы влияют на размер позиции.', 'risk', 'Сосредоточенность');
      return coach('coach-condition', 'Последний штрих: запиши условие входа. Планируем до продолжения истории.', 'frozen-plan', 'Деловая сосредоточенность');
    }
    if (stage === 'setup') return coach('coach-practice', 'Собирай план по шагам. Если застрянешь, открой подсказку — для этого и тренируемся.', 'risk', 'Дружеское внимание');
    if (stage === 'entry') return coach('coach-entry', 'Попробуй учебный лонг или шорт. Потом раскрой движение цены и посмотри, что изменилось.', 'direction', 'Любопытство');
    if (stage === 'hold') return coach('coach-hold', 'Позиция открыта. Продолжи историю и наблюдай за ценой. Денежный результат разберём отдельно.', 'frozen-plan', 'Внимательное наблюдение');
    if (stage === 'review') return coach('coach-review', 'Давай разберём этот ход: что произошло с ценой, расходами и твоим планом?', 'fees', 'Любопытство к разбору');
    if (stage === 'quiz') return coach('coach-quiz', 'Проверим, что стало понятнее. Выбери ответ — а если ошибёшься, разберём похожий пример.', 'risk', 'Поддерживающее внимание');
    if (stage === 'decision') return coach('coach-decision', 'Решение записано. Посмотри, чем оно обосновано, и переходи к следующему плану.', 'deliberate-skip', 'Спокойное внимание');
    return coach('coach-welcome', 'Я Сви. Разберёмся по ходу: один шаг, короткое объяснение — и сразу пробуем.', 'intro-mastered', 'Дружелюбие');
  }
  return Object.freeze({ reactions, getReaction, getCoach });
});
