const LAMPORTS_PER_SOL = 1_000_000_000n;

function assertNotNullish(value) {
  if (value === null || value === undefined) {
    throw new TypeError('Value cannot be null or undefined');
  }
}

function padRight(str, length) {
  if (str.length >= length) return str.slice(0, length);
  return str + '0'.repeat(length - str.length);
}

function sanitizeDecimal(value) {
  return value.replace(/_/g, '').trim();
}

export function lamportsFrom(value) {
  assertNotNullish(value);

  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot convert non-finite number to lamports');
    }
    return lamportsFrom(value.toString());
  }

  if (typeof value === 'string') {
    const sanitized = sanitizeDecimal(value);
    if (!sanitized) {
      return 0n;
    }

    const negative = sanitized.startsWith('-');
    const unsigned = negative ? sanitized.slice(1) : sanitized;

    if (!unsigned.includes('.')) {
      const whole = BigInt(unsigned || '0');
      return negative ? -whole : whole;
    }

    const [wholePart, fractionPartRaw = ''] = unsigned.split('.', 2);
    const fractionPart = padRight(fractionPartRaw.replace(/[^0-9]/g, ''), 9);

    const whole = BigInt(wholePart || '0') * LAMPORTS_PER_SOL;
    const fraction = fractionPart ? BigInt(fractionPart) : 0n;
    const sum = whole + fraction;
    return negative ? -sum : sum;
  }

  if (typeof value === 'object' && value !== null) {
    if (value.lamports !== undefined) {
      return lamportsFrom(value.lamports);
    }

    if (value.sol !== undefined) {
      return lamportsFrom(String(value.sol));
    }
  }

  throw new TypeError(`Cannot convert value of type ${typeof value} to lamports`);
}

export function solToLamports(value) {
  return lamportsFrom(value);
}

function splitLamports(value) {
  const lamports = lamportsFrom(value);
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const fraction = abs % LAMPORTS_PER_SOL;
  return { negative, whole, fraction };
}

export function formatLamports(value, {
  decimals = 9,
  trimTrailingZeros = true,
} = {}) {
  if (decimals < 0 || decimals > 9) {
    throw new RangeError('decimals must be between 0 and 9');
  }

  const { negative, whole, fraction } = splitLamports(value);
  if (decimals === 0) {
    return `${negative ? '-' : ''}${whole.toString()}`;
  }

  const fractionStr = fraction.toString().padStart(9, '0').slice(0, decimals);
  const trimmedFraction = trimTrailingZeros ? fractionStr.replace(/0+$/, '') : fractionStr;
  const suffix = trimmedFraction.length ? `.${trimmedFraction}` : (trimTrailingZeros ? '' : '.0');
  return `${negative ? '-' : ''}${whole.toString()}${suffix}`;
}

export function formatSol(value, options = {}) {
  const { decimals = 6, trimTrailingZeros = true } = options;
  return formatLamports(value, { decimals, trimTrailingZeros });
}

export function lamportsToNumber(value) {
  const text = formatLamports(value, { decimals: 9, trimTrailingZeros: false });
  return Number(text);
}

export { LAMPORTS_PER_SOL };
