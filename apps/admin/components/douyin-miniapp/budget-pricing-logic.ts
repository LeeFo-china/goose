import {
  type DouyinBudgetCategoryCode,
  type DouyinBudgetOptionCode,
  type DouyinDecorationTier,
  type DouyinPropertyCondition,
} from "@gooes/domain";

import {
  calculateDouyinBudget,
  projectDouyinBudgetToPublicYuan,
  type DouyinBudgetPricingItem,
} from "../../../api/src/services/douyin-budget/calculator";
import {
  BASE_ITEM_CODES,
  BUDGET_ITEM_LABELS,
  BUDGET_PRICING_MAX_ITEMS,
  isBaseItemCode,
  type BudgetItemCode,
  type BudgetPricingDraftInput,
  type BudgetPricingEditorItem,
  type BudgetPricingItem,
  type BudgetPricingPage,
  type BudgetPricingStatus,
} from "./budget-pricing-contract";

export * from "./budget-pricing-contract";

export function yuanInputToFen(value: string):
  | { ok: true; value: number }
  | { ok: false; message: string } {
  const normalized = value.trim();
  if (!normalized) return { ok: false, message: "请填写金额" };
  if (/^\d+\.\d{3,}$/.test(normalized)) {
    return { ok: false, message: "金额最多保留两位小数" };
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, message: "请输入不小于 0 的有效金额" };
  }
  const [yuan = "0", cents = ""] = normalized.split(".");
  const fen = BigInt(yuan) * BigInt(100) + BigInt(cents.padEnd(2, "0"));
  if (fen > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, message: "金额超出可保存范围" };
  }
  return { ok: true, value: Number(fen) };
}

export function pricingItemToEditor(item: BudgetPricingItem): BudgetPricingEditorItem {
  const shared = {
    item_code: item.item_code,
    category_code: item.category_code,
    label: item.label,
    unit: item.unit,
    minimum_amount_yuan: fenToYuanInput(item.minimum_amount_fen),
    maximum_amount_yuan: fenToYuanInput(item.maximum_amount_fen),
    sort_order: item.sort_order,
    status: item.status,
  };
  return item.role === "base"
    ? {
        ...shared,
        property_condition: item.property_condition,
        decoration_tier: item.decoration_tier,
        property_condition_coefficient_bps: item.property_condition_coefficient_bps,
        whole_house_coefficient_bps: item.whole_house_coefficient_bps,
        partial_coefficient_bps: item.partial_coefficient_bps,
      }
    : {
        ...shared,
        property_conditions: [...item.property_conditions],
        decoration_tiers: [...item.decoration_tiers],
        decoration_scopes: [...item.decoration_scopes],
      };
}

export function createEmptyPricingEditorItem(
  itemCode: BudgetItemCode,
  sortOrder: number,
): BudgetPricingEditorItem {
  if (isBaseItemCode(itemCode)) {
    const [, decorationTier, propertyCondition] = itemCode.split(".") as [
      "base",
      DouyinDecorationTier,
      DouyinPropertyCondition,
    ];
    return {
      item_code: itemCode,
      category_code: "base",
      label: BUDGET_ITEM_LABELS[itemCode],
      unit: "sqm",
      minimum_amount_yuan: "",
      maximum_amount_yuan: "",
      property_condition: propertyCondition,
      decoration_tier: decorationTier,
      property_condition_coefficient_bps: 10_000,
      whole_house_coefficient_bps: 10_000,
      partial_coefficient_bps: 10_000,
      sort_order: sortOrder,
      status: "active",
    };
  }
  const optionDefaults: Record<DouyinBudgetOptionCode, {
    category: DouyinBudgetCategoryCode;
    unit: "sqm" | "fixed";
  }> = {
    demolition: { category: "other", unit: "sqm" },
    water_electricity_upgrade: { category: "water_electricity", unit: "sqm" },
    custom_cabinet: { category: "custom", unit: "fixed" },
  };
  const option = optionDefaults[itemCode];
  return {
    item_code: itemCode,
    category_code: option.category,
    label: BUDGET_ITEM_LABELS[itemCode],
    unit: option.unit,
    minimum_amount_yuan: "",
    maximum_amount_yuan: "",
    property_conditions: [],
    decoration_tiers: [],
    decoration_scopes: [],
    sort_order: sortOrder,
    status: "active",
  };
}

export function getPricingDraftWarnings(input: BudgetPricingDraftInput): string[] {
  const warnings: string[] = [];
  const effectiveFrom = parseLocalDateTime(input.effective_from);
  const effectiveTo = input.effective_to ? parseLocalDateTime(input.effective_to) : null;
  if (effectiveFrom === null) warnings.push("请填写报价生效时间");
  if (input.effective_to && effectiveTo === null) warnings.push("报价失效时间格式无效");
  if (effectiveFrom !== null && effectiveTo !== null && effectiveTo <= effectiveFrom) {
    warnings.push("报价失效时间必须晚于生效时间");
  }
  const disclaimer = input.disclaimer.trim();
  if (!disclaimer) warnings.push("请填写免责声明");
  else if (disclaimer.length > 500) warnings.push("免责声明最多 500 个字符");
  return warnings;
}

export function getPricingItemWarnings(
  items: readonly BudgetPricingEditorItem[],
  options: { requireActivationCoverage: boolean },
): string[] {
  const warnings: string[] = [];
  if (items.length === 0) return ["请至少添加 1 条报价项目"];
  if (items.length > BUDGET_PRICING_MAX_ITEMS) warnings.push("报价项目最多 100 条");
  const codes = new Set<BudgetItemCode>();
  const labels = items.map((item) => item.label.trim()).filter(Boolean);
  if (new Set(labels).size !== labels.length) warnings.push("报价项目名称不能重复");
  for (const item of items) {
    if (codes.has(item.item_code)) warnings.push(`${BUDGET_ITEM_LABELS[item.item_code]}不能重复`);
    codes.add(item.item_code);
    if (!item.label.trim()) warnings.push(`${BUDGET_ITEM_LABELS[item.item_code]}请填写项目名称`);
    else if (item.label.trim().length > 40) warnings.push(`${BUDGET_ITEM_LABELS[item.item_code]}名称最多 40 个字符`);
    const minimum = yuanInputToFen(item.minimum_amount_yuan);
    const maximum = yuanInputToFen(item.maximum_amount_yuan);
    if (!minimum.ok) warnings.push(`${item.label || BUDGET_ITEM_LABELS[item.item_code]}：${minimum.message}`);
    if (!maximum.ok) warnings.push(`${item.label || BUDGET_ITEM_LABELS[item.item_code]}：${maximum.message}`);
    if (minimum.ok && maximum.ok && minimum.value > maximum.value) {
      warnings.push(`${item.label || BUDGET_ITEM_LABELS[item.item_code]}的最低价不能高于最高价`);
    }
    if (item.item_code.startsWith("base.")) {
      for (const [coefficient, label] of [
        [item.property_condition_coefficient_bps, "房屋现状系数"],
        [item.whole_house_coefficient_bps, "全屋系数"],
        [item.partial_coefficient_bps, "局部系数"],
      ] as const) {
        if (!Number.isSafeInteger(coefficient) || (coefficient ?? 0) <= 0) {
          warnings.push(`${item.label || BUDGET_ITEM_LABELS[item.item_code]}的${label}必须大于 0`);
        } else if ((coefficient ?? 0) > 100_000) {
          warnings.push(`${item.label || BUDGET_ITEM_LABELS[item.item_code]}的${label}超出可保存范围`);
        }
      }
    }
  }
  if (options.requireActivationCoverage) {
    const activeCodes = new Set(items.filter((item) => item.status === "active").map((item) => item.item_code));
    if (!BASE_ITEM_CODES.every((code) => activeCodes.has(code))) {
      warnings.push("启用前需配置经济、舒适、品质档在毛坯和旧房翻新下的 6 条基础报价");
    }
  }
  return [...new Set(warnings)];
}

export function buildPricingItemsPayload(
  expectedUpdatedAt: string,
  items: readonly BudgetPricingEditorItem[],
): { expected_updated_at: string; items: BudgetPricingItem[] } {
  return {
    expected_updated_at: expectedUpdatedAt,
    items: items.map(editorItemToWire),
  };
}

export function buildPricingDraftPayload(input: BudgetPricingDraftInput): {
  effective_from: string;
  effective_to: string | null;
  disclaimer: string;
} {
  const effectiveFrom = localDateTimeToIso(input.effective_from);
  const effectiveTo = input.effective_to ? localDateTimeToIso(input.effective_to) : null;
  if (!effectiveFrom || (input.effective_to && !effectiveTo)) {
    throw new Error("报价生效时间无效");
  }
  return {
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    disclaimer: input.disclaimer.trim(),
  };
}

export function calculatePricingPreview(items: readonly BudgetPricingEditorItem[]):
  | { ok: true; minimumTotalYuan: number; maximumTotalYuan: number }
  | { ok: false; message: string } {
  try {
    const wireItems = items.map(editorItemToWire).filter((item) => item.status === "active");
    const calculatorItems = wireItems.map(toCalculatorItem);
    const result = calculateDouyinBudget({
      versionId: "00000000-0000-4000-8000-000000000000",
      versionNo: 1,
      disclaimer: "预算配置预览",
      items: calculatorItems,
    }, {
      area: 100,
      property_condition: "rough",
      decoration_tier: "comfortable",
      decoration_scope: "whole_house",
      option_codes: [],
    });
    const projected = projectDouyinBudgetToPublicYuan(result);
    return {
      ok: true,
      minimumTotalYuan: projected.minimum_total,
      maximumTotalYuan: projected.maximum_total,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "当前报价无法预览",
    };
  }
}

export function pricingStatusDisplay(
  status: BudgetPricingStatus,
  isCurrent: boolean,
): {
  label: string;
  variant: "success" | "secondary" | "outline";
} {
  if (status === "active") {
    return isCurrent
      ? { label: "使用中", variant: "success" }
      : { label: "已启用但当前失效", variant: "outline" };
  }
  if (status === "draft") return { label: "草稿", variant: "secondary" };
  return { label: "已归档", variant: "outline" };
}

export type BudgetPricingRequestTicket = { id: number; controller: AbortController };

export function createBudgetPricingRequestAuthority() {
  let sequence = 0;
  let current: BudgetPricingRequestTicket | null = null;
  return {
    begin(): BudgetPricingRequestTicket {
      current?.controller.abort();
      current = { id: sequence + 1, controller: new AbortController() };
      sequence = current.id;
      return current;
    },
    isCurrent(ticket: BudgetPricingRequestTicket): boolean {
      return current?.id === ticket.id && !ticket.controller.signal.aborted;
    },
    invalidate(): void {
      current?.controller.abort();
      current = null;
      sequence += 1;
    },
  };
}

export function createBudgetPricingPageTarget(initialPage: number) {
  let page = initialPage;
  return {
    current(): number {
      return page;
    },
    update(nextPage: number): void {
      page = nextPage;
    },
  };
}

export function createBudgetPricingFailurePage(input: {
  page: number;
  pageSize: number;
}): BudgetPricingPage {
  return {
    active_version: null,
    list: [],
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: 0,
      totalPages: 0,
    },
  };
}

export function getBudgetPricingViewState(input: {
  loading: boolean;
  error: string | null;
  count: number;
}): "loading" | "error" | "empty" | "ready" {
  if (input.error) return "error";
  if (input.loading && input.count === 0) return "loading";
  return input.count === 0 ? "empty" : "ready";
}

export function isBudgetPricingAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function toggleCanonicalCondition<const Values extends readonly string[]>(
  current: readonly Values[number][],
  value: Values[number],
  checked: boolean,
  order: Values,
): Values[number][] {
  const selected = new Set(current);
  if (checked) selected.add(value);
  else selected.delete(value);
  return order.filter((item) => selected.has(item));
}

function editorItemToWire(item: BudgetPricingEditorItem): BudgetPricingItem {
  const minimum = yuanInputToFen(item.minimum_amount_yuan);
  const maximum = yuanInputToFen(item.maximum_amount_yuan);
  if (!minimum.ok || !maximum.ok) throw new Error("报价金额无效");
  const shared = {
    category_code: item.category_code,
    item_code: item.item_code,
    label: item.label.trim(),
    unit: item.unit,
    minimum_amount_fen: minimum.value,
    maximum_amount_fen: maximum.value,
    sort_order: item.sort_order,
    status: item.status,
  };
  if (isBaseItemCode(item.item_code)) {
    if (
      !item.property_condition
      || !item.decoration_tier
      || !item.property_condition_coefficient_bps
      || !item.whole_house_coefficient_bps
      || !item.partial_coefficient_bps
    ) throw new Error("基础报价系数无效");
    return {
      ...shared,
      role: "base",
      category_code: "base",
      item_code: item.item_code,
      unit: "sqm",
      property_condition: item.property_condition,
      decoration_tier: item.decoration_tier,
      property_condition_coefficient_bps: item.property_condition_coefficient_bps,
      whole_house_coefficient_bps: item.whole_house_coefficient_bps,
      partial_coefficient_bps: item.partial_coefficient_bps,
    };
  }
  return {
    ...shared,
    role: "option",
    item_code: item.item_code,
    property_conditions: item.property_conditions ?? [],
    decoration_tiers: item.decoration_tiers ?? [],
    decoration_scopes: item.decoration_scopes ?? [],
  };
}

function toCalculatorItem(item: BudgetPricingItem): DouyinBudgetPricingItem {
  if (item.role === "base") {
    return {
      role: "base",
      code: item.item_code,
      category: "base",
      label: item.label,
      unit: "sqm",
      minimumAmountFen: item.minimum_amount_fen,
      maximumAmountFen: item.maximum_amount_fen,
      condition: {
        propertyConditions: [item.property_condition],
        decorationTiers: [item.decoration_tier],
        decorationScopes: ["whole_house", "partial"],
      },
      propertyConditionCoefficientBps: item.property_condition_coefficient_bps,
      decorationScopeCoefficientBps: {
        whole_house: item.whole_house_coefficient_bps,
        partial: item.partial_coefficient_bps,
      },
    };
  }
  return {
    role: "option",
    code: item.item_code,
    category: item.category_code,
    label: item.label,
    unit: item.unit,
    minimumAmountFen: item.minimum_amount_fen,
    maximumAmountFen: item.maximum_amount_fen,
    condition: {
      ...(item.property_conditions.length > 0 ? { propertyConditions: item.property_conditions } : {}),
      ...(item.decoration_tiers.length > 0 ? { decorationTiers: item.decoration_tiers } : {}),
      ...(item.decoration_scopes.length > 0 ? { decorationScopes: item.decoration_scopes } : {}),
    },
  };
}

function fenToYuanInput(fen: number): string {
  const yuan = Math.floor(fen / 100);
  const cents = fen % 100;
  return cents === 0 ? String(yuan) : `${yuan}.${String(cents).padStart(2, "0")}`;
}

function parseLocalDateTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function localDateTimeToIso(value: string): string | null {
  const timestamp = parseLocalDateTime(value);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}
