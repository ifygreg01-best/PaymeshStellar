/**
 * Money formatting utilities for Stellar i128 amounts.
 *
 * CRITICAL: Never pass amounts through JS Number. i128 values can exceed
 * Number.MAX_SAFE_INTEGER (9_007_199_254_740_991). 10,000,000 XLM in stroops
 * alone is 100_000_000_000_000 – 11× that limit.
 *
 * All arithmetic is done with BigInt; only the final formatted string uses
 * regular string operations.
 */

import { DEFAULT_TOKEN_DECIMALS, TOKEN_DECIMALS } from '@/types/api';

/**
 * Return the decimal precision for a given asset code.
 * Defaults to 7 (Stellar standard / stroop denominator).
 */
export function getTokenDecimals(asset: string): number {
  return TOKEN_DECIMALS[asset.toUpperCase()] ?? DEFAULT_TOKEN_DECIMALS;
}

/**
 * Format an i128 decimal string as a human-readable amount.
 *
 * @param raw     - The raw amount string from the API (e.g. "12345678")
 * @param asset   - Asset code used to look up decimal places (default 7)
 * @param opts    - Optional Intl.NumberFormat-style options
 *
 * @example
 *   formatAmount("12345678", "XLM")          // "1.2345678"
 *   formatAmount("1000000000000000", "XLM")  // "100,000,000"  (never NaN)
 */
export function formatAmount(
  raw: string,
  asset: string,
  opts: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {}
): string {
  if (!raw || raw === '0') return `0 ${asset}`;

  const decimals = getTokenDecimals(asset);
  const divisor = 10n ** BigInt(decimals);

  // Parse safely – strip any leading/trailing whitespace
  let value: bigint;
  try {
    value = BigInt(raw.trim());
  } catch {
    // Malformed input: surface as "?" rather than crashing
    return `? ${asset}`;
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / divisor;
  const frac = abs % divisor;

  // Build fractional part with leading zeros preserved
  const fracStr = frac.toString().padStart(decimals, '0');

  // Trim trailing zeros unless caller asked for minimum fraction digits
  const minFrac = opts.minimumFractionDigits ?? 0;
  const maxFrac = opts.maximumFractionDigits ?? decimals;

  let trimmed = fracStr.slice(0, maxFrac);
  if (minFrac === 0) {
    trimmed = trimmed.replace(/0+$/, '');
  } else {
    // Ensure at least minFrac digits
    while (trimmed.length < minFrac) trimmed += '0';
  }

  // Format whole part with locale-aware thousands separator
  const wholeFormatted = whole.toLocaleString('en-US');

  const result = trimmed.length > 0 ? `${wholeFormatted}.${trimmed}` : wholeFormatted;
  return `${negative ? '-' : ''}${result} ${asset}`;
}

/**
 * Format for compact display (e.g. in chart tooltips).
 * Same as formatAmount but without the asset suffix.
 */
export function formatAmountCompact(raw: string, asset: string): string {
  return formatAmount(raw, asset).replace(` ${asset}`, '');
}

/**
 * Sum an array of i128 strings as BigInt (safe for large values).
 */
export function sumAmounts(amounts: string[]): bigint {
  return amounts.reduce((acc, a) => {
    try {
      return acc + BigInt(a.trim());
    } catch {
      return acc;
    }
  }, 0n);
}

/**
 * Add two i128 strings together, returning a string.
 * Useful for aggregating totals without converting to Number.
 */
export function addAmounts(a: string, b: string): string {
  try {
    return (BigInt(a.trim()) + BigInt(b.trim())).toString();
  } catch {
    return a;
  }
}

/**
 * Compare two i128 strings for sorting (returns negative/zero/positive).
 */
export function compareAmounts(a: string, b: string): number {
  try {
    const diff = BigInt(a.trim()) - BigInt(b.trim());
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  } catch {
    return 0;
  }
}

/**
 * Convert a raw i128 string to a float string for chart libraries.
 * Only use this for chart data where approximate representation is acceptable,
 * and the values are known to be within safe float range.
 *
 * @returns A decimal string like "1.234567" – NOT a JS number.
 */
export function toChartValue(raw: string, asset: string): number {
  const decimals = getTokenDecimals(asset);
  const divisor = 10n ** BigInt(decimals);

  try {
    const value = BigInt(raw.trim());
    const whole = value / divisor;
    const frac = value % divisor;
    const fracStr = frac.toString().padStart(decimals, '0');
    // This is intentional: chart libraries need numbers, and we've done the
    // integer division correctly. Values that exceed MAX_SAFE_INTEGER in the
    // whole part will lose precision in the chart only (acceptable).
    return Number(`${whole}.${fracStr}`);
  } catch {
    return 0;
  }
}
