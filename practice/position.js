/* Educational, fully collateralized directional positions; not an exchange engine. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InsweepPosition = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function positive(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number`);
  }
  function fee(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('feeRate must be numeric and between zero inclusive and one exclusive');
  }
  function direction(side) {
    if (side !== 'long' && side !== 'short') throw new RangeError('side must be long or short');
    return side === 'long' ? 1 : -1;
  }
  function openPosition({side, amount, entry, feeRate}) {
    direction(side); positive(amount, 'amount'); positive(entry, 'entry'); fee(feeRate);
    const notional = amount / (1 + feeRate);
    const qty = notional / entry;
    positive(qty, 'qty');
    return {side, allocated:amount, entry, qty, notional, entryFee:notional * feeRate};
  }
  function closePosition(position, exit, feeRate) {
    const sign = direction(position.side);
    positive(exit, 'exit'); positive(position.qty, 'qty'); positive(position.entry, 'entry');
    positive(position.allocated, 'allocated'); fee(feeRate);
    const grossPnl = sign * position.qty * (exit - position.entry);
    const exitFee = position.qty * exit * feeRate;
    const totalFees = position.entryFee + exitFee;
    const pnl = grossPnl - totalFees;
    const settlement = position.allocated + pnl;
    if (![grossPnl, exitFee, totalFees, pnl, settlement].every(Number.isFinite)) throw new RangeError('Position result must be finite');
    return {grossPnl, exitFee, totalFees, pnl, settlement};
  }
  return {openPosition, closePosition};
});
