/* Pure planning for the educational 1:1 position model; not exchange orders. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? require('./position.js') : root.InsweepPosition);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InsweepPlan = api;
})(typeof window === 'undefined' ? globalThis : window, function (positions) {
  'use strict';

  function positive(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a finite positive number`);
    }
  }

  function validateLevels({ side, entry, stop, target }) {
    if (side !== 'long' && side !== 'short') throw new RangeError('side must be long or short');
    positive(entry, 'entry'); positive(stop, 'stop'); positive(target, 'target');
    const ordered = side === 'long' ? stop < entry && entry < target : target < entry && entry < stop;
    if (!ordered) throw new RangeError('Stop and target must bracket entry in the chosen direction');
    return true;
  }

  function calculatePlan({ side, entry, stop, target, riskBudget, availableCash, feeRate }) {
    validateLevels({ side, entry, stop, target });
    positive(riskBudget, 'riskBudget'); positive(availableCash, 'availableCash');
    if (typeof feeRate !== 'number' || !Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
      throw new RangeError('feeRate must be numeric and between zero inclusive and one exclusive');
    }

    // Entry and stop-exit fees are both inside the monetary risk budget.
    const lossPerUnit = Math.abs(entry - stop) + entry * feeRate + stop * feeRate;
    const cashPerUnit = entry * (1 + feeRate);
    positive(lossPerUnit, 'lossPerUnit'); positive(cashPerUnit, 'cashPerUnit');
    const riskQty = riskBudget / lossPerUnit;
    const cashQty = availableCash / cashPerUnit;
    const maximumQty = Math.min(riskQty, cashQty);
    positive(maximumQty, 'maximumQty');
    const scale = 1e8;
    let units = Math.floor(maximumQty * scale);
    if (!Number.isFinite(units)) throw new RangeError('Rounded quantity must be finite');
    let qty = units / scale;
    // Floating multiplication must never round a quantity above the cap.
    if (qty > maximumQty) qty = --units / scale;
    positive(qty, 'qty');

    function amounts() {
      const position = positions.openPosition({ side, entry, amount: qty * cashPerUnit, feeRate });
      // Keep the explicitly rounded training quantity across floating division.
      position.qty = qty;
      const plannedLoss = -positions.closePosition(position, stop, feeRate).pnl;
      const plannedReward = positions.closePosition(position, target, feeRate).pnl;
      return { position, plannedLoss, plannedReward };
    }

    let values = amounts();
    // Account for a possible last-bit overshoot when converting back to cash/PnL.
    if (values.position.allocated > availableCash || values.plannedLoss > riskBudget) {
      qty = --units / scale;
      positive(qty, 'qty');
      values = amounts();
    }
    const { position, plannedLoss, plannedReward } = values;
    const rewardRisk = plannedReward / plannedLoss;
    if (![position.allocated, position.entryFee, plannedLoss, plannedReward, rewardRisk].every(Number.isFinite)
      || plannedLoss <= 0 || position.allocated > availableCash || plannedLoss > riskBudget) {
      throw new RangeError('Plan amounts must be finite and fit both risk and cash');
    }
    return {
      side, entry, stop, target, riskBudget,
      qty, allocated: position.allocated, entryFee: position.entryFee,
      plannedLoss, plannedReward, rewardRisk, capitalLimited: cashQty < riskQty,
    };
  }

  function exitSignal(plan, price) {
    validateLevels(plan);
    positive(price, 'price');
    if (plan.side === 'long') {
      if (price <= plan.stop) return 'stop';
      if (price >= plan.target) return 'target';
    } else {
      if (price >= plan.stop) return 'stop';
      if (price <= plan.target) return 'target';
    }
    return null;
  }

  function conditionMet({ kind, price }, currentPrice) {
    positive(currentPrice, 'currentPrice');
    if (kind === 'now') return true;
    if (kind !== 'above' && kind !== 'below') throw new RangeError('Unknown entry condition');
    positive(price, 'condition price');
    return kind === 'above' ? currentPrice >= price : currentPrice <= price;
  }

  return { validateLevels, calculatePlan, exitSignal, conditionMet };
});
