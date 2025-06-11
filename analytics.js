'use strict';

/**
 * Calculate the sum of an array of numbers or objects.
 * @param {Array<number|object>} data - Array of numbers or objects.
 * @param {Function} [selector] - Optional function to select numeric value from each element.
 * @returns {number} Sum of numeric values.
 */
function calculateTotal(data, selector) {
  if (!Array.isArray(data)) {
    throw new TypeError('Data must be an array');
  }
  const pick = typeof selector === 'function' ? selector : (x => x);
  return data.reduce((total, item) => {
    const value = Number(pick(item));
    if (!Number.isFinite(value)) {
      throw new TypeError('All values must be numeric');
    }
    return total + value;
  }, 0);
}

/**
 * Calculate the average of an array of numbers or objects.
 * @param {Array<number|object>} data - Array of numbers or objects.
 * @param {Function} [selector] - Optional function to select numeric value from each element.
 * @returns {number} Average of numeric values.
 */
function calculateAverage(data, selector) {
  if (data.length === 0) {
    return 0;
  }
  return calculateTotal(data, selector) / data.length;
}

/**
 * Class used to analyze simple trends in numeric data.
 */
class TrendAnalyzer {
  /**
   * @param {Array<number>} data - Array of numeric values.
   */
  constructor(data) {
    if (!Array.isArray(data)) {
      throw new TypeError('Data must be an array');
    }
    this.data = data.map(Number);
  }

  /**
   * Compute the moving average over a given period.
   * @param {number} period - Number of data points in each average window.
   * @returns {Array<number>} Array of moving average values.
   */
  movingAverage(period) {
    if (!Number.isInteger(period) || period <= 0) {
      throw new TypeError('Period must be a positive integer');
    }
    if (this.data.length < period) {
      return [];
    }
    const result = [];
    for (let i = 0; i <= this.data.length - period; i++) {
      const window = this.data.slice(i, i + period);
      const avg = window.reduce((sum, val) => sum + val, 0) / period;
      result.push(avg);
    }
    return result;
  }
}

module.exports = {
  calculateTotal,
  calculateAverage,
  TrendAnalyzer
};
