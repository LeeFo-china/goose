const QUANTITY_SCALE = BigInt(10_000);
const CENTS_SCALE = BigInt(100);
const QUANTITY_MAX_INTEGER_DIGITS = 14;
const UNIT_PRICE_MAX_INTEGER_DIGITS = 12;

export type ProcurementSummaryLine = {
  supplierId?: string | null;
  quantity: string;
  unitPrice?: string | null;
  costCategoryId: string;
};

export type ProcurementSummary = {
  itemCount: number;
  supplierCount: number;
  missingCategoryCount: number;
  referenceAmount: string;
};

export type PurposeCustomState = {
  custom: boolean;
  requestedValue: string | null;
};

export function procurementSummary(
  lines: readonly ProcurementSummaryLine[],
): ProcurementSummary {
  const supplierIds = new Set(
    lines.map(({ supplierId }) => supplierId).filter(
      (value): value is string => Boolean(value),
    ),
  );
  const cents = lines.reduce((total, line) => {
    const quantity = scaledDecimal(
      line.quantity,
      4,
      QUANTITY_MAX_INTEGER_DIGITS,
    );
    const unitPrice = scaledDecimal(
      line.unitPrice ?? "",
      2,
      UNIT_PRICE_MAX_INTEGER_DIGITS,
    );
    if (quantity === null || unitPrice === null) return total;
    return total + roundDivide(quantity * unitPrice, QUANTITY_SCALE);
  }, BigInt(0));

  return {
    itemCount: lines.length,
    supplierCount: supplierIds.size,
    missingCategoryCount: lines.filter(({ costCategoryId }) =>
      !costCategoryId
    ).length,
    referenceAmount: `${cents / CENTS_SCALE}.${
      (cents % CENTS_SCALE).toString().padStart(2, "0")
    }`,
  };
}

export function shouldConfirmContextChange(
  selectedItemCount: number,
): boolean {
  return selectedItemCount > 0;
}

export function shouldRequestPurposeChange(
  currentValue: string,
  nextValue: string,
): boolean {
  return currentValue !== nextValue;
}

export function synchronizePurposeCustomState({
  currentCustom,
  value,
  isPreset,
  requestedValue,
}: {
  currentCustom: boolean;
  value: string;
  isPreset: boolean;
  requestedValue: string | null;
}): PurposeCustomState {
  return {
    custom: requestedValue === value
      ? currentCustom
      : Boolean(value) && !isPreset,
    requestedValue: null,
  };
}

function scaledDecimal(
  value: string,
  scale: number,
  maxIntegerDigits: number,
): bigint | null {
  if (value.length > maxIntegerDigits + scale + 1) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (
    !match ||
    (match[1]?.length ?? 0) > maxIntegerDigits ||
    (match[2]?.length ?? 0) > scale
  ) return null;
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(scale, "0");
  return BigInt(`${whole}${fraction}`);
}

function roundDivide(value: bigint, divisor: bigint): bigint {
  return (value + divisor / BigInt(2)) / divisor;
}
