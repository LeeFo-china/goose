import type { BudgetPricingBaseItem, BudgetPricingItem } from "./budget-pricing-contract";

const PREVIEW_AREA_SQM = 100;
const BASIS_POINTS = BigInt(10_000);
const FEN_PER_YUAN = BigInt(100);

export type BudgetPricingPreviewResult =
  | { ok: true; minimumTotalYuan: number; maximumTotalYuan: number }
  | { ok: false; message: string };

export function calculateBudgetPricingPreviewFromWire(
  items: readonly BudgetPricingItem[],
): BudgetPricingPreviewResult {
  try {
    const activeItems = items.filter((item) => item.status === "active");
    const matchingBases = activeItems.filter((item): item is BudgetPricingBaseItem =>
      item.role === "base" &&
      item.property_condition === "rough" &&
      item.decoration_tier === "comfortable");
    if (matchingBases.length === 0) return { ok: false, message: "缺少匹配的基础报价规则" };
    if (matchingBases.length > 1) return { ok: false, message: "匹配到多条基础报价规则" };

    const base = matchingBases[0];
    if (!base) return { ok: false, message: "缺少匹配的基础报价规则" };
    assertValidAmountRange(base.minimum_amount_fen, base.maximum_amount_fen);
    assertValidCoefficient(base.property_condition_coefficient_bps);
    assertValidCoefficient(base.whole_house_coefficient_bps);

    const minimumFen = calculateSquareMetreAmountFen(
      base.minimum_amount_fen,
      base.property_condition_coefficient_bps,
      base.whole_house_coefficient_bps,
    );
    const maximumFen = calculateSquareMetreAmountFen(
      base.maximum_amount_fen,
      base.property_condition_coefficient_bps,
      base.whole_house_coefficient_bps,
    );
    return {
      ok: true,
      minimumTotalYuan: fenToIntegerYuan(minimumFen),
      maximumTotalYuan: fenToIntegerYuan(maximumFen),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "当前报价无法预览",
    };
  }
}

function calculateSquareMetreAmountFen(
  unitAmountFen: number,
  propertyCoefficientBps: number,
  scopeCoefficientBps: number,
): bigint {
  const numerator = BigInt(unitAmountFen)
    * BigInt(PREVIEW_AREA_SQM)
    * BigInt(propertyCoefficientBps)
    * BigInt(scopeCoefficientBps);
  const denominator = BASIS_POINTS * BASIS_POINTS;
  return divideHalfUp(numerator, denominator);
}

function fenToIntegerYuan(value: bigint): number {
  const yuan = (value + FEN_PER_YUAN / BigInt(2)) / FEN_PER_YUAN;
  if (yuan > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("预算金额超出安全整数范围");
  return Number(yuan);
}

function assertValidAmountRange(minimumFen: number, maximumFen: number): void {
  if (
    !Number.isSafeInteger(minimumFen) ||
    !Number.isSafeInteger(maximumFen) ||
    minimumFen < 0 ||
    maximumFen < 0 ||
    minimumFen > maximumFen
  ) {
    throw new Error("预算金额分值无效");
  }
}

function assertValidCoefficient(coefficient: number): void {
  if (!Number.isSafeInteger(coefficient) || coefficient <= 0 || coefficient > 100_000) {
    throw new Error("报价系数配置无效");
  }
}

function divideHalfUp(value: bigint, divisor: bigint): bigint {
  return (value + divisor / BigInt(2)) / divisor;
}
