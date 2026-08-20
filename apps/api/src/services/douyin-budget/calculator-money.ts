const BIGINT_ONE = BigInt(1);
const BIGINT_TEN_THOUSAND = BigInt(10_000);
const BIGINT_FIFTY = BigInt(50);
const BIGINT_ONE_HUNDRED = BigInt(100);

export type FenRange = {
  readonly minimum: bigint;
  readonly maximum: bigint;
};

export type DecimalFraction = {
  readonly numerator: bigint;
  readonly denominator: bigint;
};

export type FenConversionResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: 'invalid' | 'overflow' };

export function decimalNumberToFraction(
  value: number,
): DecimalFraction | null {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(
    value.toString(),
  );
  if (!match?.[1]) return null;
  const fractionalDigits = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  const digits = BigInt(`${match[1]}${fractionalDigits}`);
  const scale = fractionalDigits.length - exponent;
  return scale <= 0
    ? { numerator: digits * powerOfTen(-scale), denominator: BIGINT_ONE }
    : { numerator: digits, denominator: powerOfTen(scale) };
}

export function calculateFenRange(input: {
  readonly minimumAmountFen: number;
  readonly maximumAmountFen: number;
  readonly unit: 'sqm' | 'fixed';
  readonly area: DecimalFraction;
  readonly coefficientBps?: readonly number[];
}): FenRange {
  const isSquareMetre = input.unit === 'sqm';
  const areaNumerator = isSquareMetre ? input.area.numerator : BIGINT_ONE;
  const areaDenominator = isSquareMetre ? input.area.denominator : BIGINT_ONE;
  const coefficients = input.coefficientBps ?? [];
  const coefficientNumerator = coefficients.reduce(
    (product, coefficient) => product * BigInt(coefficient),
    BIGINT_ONE,
  );
  const coefficientDenominator = coefficients.reduce(
    (product) => product * BIGINT_TEN_THOUSAND,
    BIGINT_ONE,
  );
  const denominator = areaDenominator * coefficientDenominator;
  return {
    minimum: divideHalfUp(
      BigInt(input.minimumAmountFen) * areaNumerator * coefficientNumerator,
      denominator,
    ),
    maximum: divideHalfUp(
      BigInt(input.maximumAmountFen) * areaNumerator * coefficientNumerator,
      denominator,
    ),
  };
}

export function addFenRangeToMap<Key>(
  ranges: Map<Key, FenRange>,
  key: Key,
  range: FenRange,
): void {
  const current = ranges.get(key) ?? {
    minimum: BigInt(0),
    maximum: BigInt(0),
  };
  ranges.set(key, addFenRanges(current, range));
}

function addFenRanges(left: FenRange, right: FenRange): FenRange {
  return {
    minimum: left.minimum + right.minimum,
    maximum: left.maximum + right.maximum,
  };
}

export function safeBigIntToNumber(value: bigint): number | null {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

export function fenToIntegerYuan(value: unknown): FenConversionResult {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return { ok: false, reason: 'invalid' };
  }
  if (!Number.isSafeInteger(value)) return { ok: false, reason: 'overflow' };
  return {
    ok: true,
    value: Number((BigInt(value) + BIGINT_FIFTY) / BIGINT_ONE_HUNDRED),
  };
}

function powerOfTen(exponent: number): bigint {
  return BigInt(`1${'0'.repeat(exponent)}`);
}

function divideHalfUp(value: bigint, divisor: bigint): bigint {
  return (value + divisor / BigInt(2)) / divisor;
}
