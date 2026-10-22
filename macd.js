"use strict";

(function () {
  function alpha(period) {
    if (!Number.isInteger(period) || period <= 0) {
      throw new Error("EMA period must be positive");
    }
    return 2 / (period + 1);
  }

  function compute(closes, options) {
    const config = options || {};
    const fast = config.fast == null ? 12 : Number(config.fast);
    const slow = config.slow == null ? 26 : Number(config.slow);
    const signal = config.signal == null ? 9 : Number(config.signal);
    if (!Array.isArray(closes)) {
      throw new Error("Close prices must be an array");
    }
    if (!closes.length) return [];
    if (fast >= slow) {
      throw new Error("Fast EMA period must be smaller than slow EMA period");
    }

    const values = closes.map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error("Close prices must be finite and positive");
    }

    const fastAlpha = alpha(fast);
    const slowAlpha = alpha(slow);
    const signalAlpha = alpha(signal);
    let fastEma = values[0];
    let slowEma = values[0];
    let dif = fastEma - slowEma;
    let dea = dif;
    const result = [{
      dif,
      dea,
      histogram: 2 * (dif - dea),
    }];

    for (let index = 1; index < values.length; index += 1) {
      const close = values[index];
      fastEma = fastAlpha * close + (1 - fastAlpha) * fastEma;
      slowEma = slowAlpha * close + (1 - slowAlpha) * slowEma;
      dif = fastEma - slowEma;
      dea = signalAlpha * dif + (1 - signalAlpha) * dea;
      result.push({
        dif,
        dea,
        histogram: 2 * (dif - dea),
      });
    }
    return result;
  }

  function fromBars(bars, options) {
    if (!Array.isArray(bars)) {
      throw new Error("History bars must be an array");
    }
    const closes = bars.map((bar) => {
      const value = bar ? Number(bar.adjusted_close) : NaN;
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Adjusted close is unavailable for this interval");
      }
      return value;
    });
    return compute(closes, options);
  }

  window.StockMacd = {
    compute,
    fromBars,
  };
}());
