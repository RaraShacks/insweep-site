const QUANTITY_SCALE = 100_000_000;

const fail = (error) => ({ ok: false, error });
const positiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validFee = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 100;

/**
 * Hypothetical linear cash model. Eight decimal places are an educational
 * quantity step, not an exchange instrument specification.
 */
export function calculatePosition(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail('Укажите цену входа, стоп и бюджет риска числами.');
  }

  const {
    entry, stop, riskBudget, entryFeePercent = 0, exitFeePercent = 0, side = 'long',
  } = input;

  if (!positiveNumber(entry)) return fail('Цена входа должна быть конечным числом больше нуля.');
  if (!positiveNumber(stop)) return fail('Цена стопа должна быть конечным числом больше нуля.');
  if (!positiveNumber(riskBudget)) return fail('Бюджет риска должен быть конечным числом больше нуля.');
  if (!validFee(entryFeePercent) || !validFee(exitFeePercent)) {
    return fail('Комиссии должны быть числами от 0 до 100%, не включая 100%.');
  }
  if (side !== 'long' && side !== 'short') return fail('Выберите направление: лонг или шорт.');
  if (side === 'long' && stop >= entry) return fail('Для лонга стоп должен быть ниже цены входа.');
  if (side === 'short' && stop <= entry) return fail('Для шорта стоп должен быть выше цены входа.');

  const unitPriceLoss = Math.abs(entry - stop);
  const unitEntryFee = entry * (entryFeePercent / 100);
  const unitExitFee = stop * (exitFeePercent / 100);
  const unitCost = unitPriceLoss + unitEntryFee + unitExitFee;
  const scaledQuantity = (riskBudget / unitCost) * QUANTITY_SCALE;
  if (!Number.isFinite(unitCost) || unitCost <= 0 || !Number.isFinite(scaledQuantity)) {
    return fail('Числа слишком велики или малы для конечного расчёта.');
  }
  let quantitySteps = Math.floor(scaledQuantity);
  if (!Number.isSafeInteger(quantitySteps)) {
    return fail('Количество выходит за пределы точности расчёта с шагом 0,00000001.');
  }

  // A sum of separately displayed components can round slightly above the
  // budget even after flooring the quotient. Remove quantity steps to keep
  // the returned cash total inside the budget, rather than clipping the total.
  for (let correction = 0; correction < 16; correction += 1) {
    if (quantitySteps <= 0) return fail('Бюджета недостаточно даже для шага количества 0,00000001.');
    const quantity = quantitySteps / QUANTITY_SCALE;
    const notional = quantity * entry;
    const priceLoss = quantity * unitPriceLoss;
    const entryFee = quantity * unitEntryFee;
    const exitFee = quantity * unitExitFee;
    const totalRisk = priceLoss + entryFee + exitFee;
    if (![quantity, notional, priceLoss, entryFee, exitFee, totalRisk].every(Number.isFinite)) {
      return fail('Результат выходит за пределы конечных чисел. Уменьшите исходные значения.');
    }
    if (totalRisk <= riskBudget) {
      return {
        ok: true, quantity, notional, priceLoss, entryFee, exitFee, totalRisk,
        unusedBudget: riskBudget - totalRisk,
      };
    }
    quantitySteps -= 1;
  }
  return fail('Не удалось сохранить бюджет с доступной точностью. Измените исходные значения.');
}
