import type {
  DouyinBudgetEstimateRequest,
  DouyinBudgetOptionCode,
  DouyinBudgetPublicConfig,
  DouyinBudgetPublicOption,
  DouyinDecorationScope,
  DouyinDecorationTier,
  DouyinPropertyCondition,
} from "../../models";

const PROPERTY_CONDITIONS = new Set<DouyinPropertyCondition>(["rough", "old_house"]);
const DECORATION_TIERS = new Set<DouyinDecorationTier>(["economy", "comfortable", "quality"]);
const DECORATION_SCOPES = new Set<DouyinDecorationScope>(["whole_house", "partial"]);
const OPTION_CODES = new Set<DouyinBudgetOptionCode>([
  "demolition", "water_electricity_upgrade", "custom_cabinet",
]);

export type BudgetFormValue = {
  areaText: string;
  propertyCondition: DouyinPropertyCondition;
  decorationTier: DouyinDecorationTier;
  decorationScope: DouyinDecorationScope;
  layout: string;
  style: string;
  selectedOptions: DouyinBudgetOptionCode[];
  demand: string;
};

export type BudgetChoiceField =
  | "propertyCondition"
  | "decorationTier"
  | "decorationScope";

export class BudgetFormValidationError extends Error {
  constructor(readonly field: keyof BudgetFormValue, message: string) {
    super(message);
    this.name = "BudgetFormValidationError";
  }
}

export function buildEstimateRequest(form: BudgetFormValue): DouyinBudgetEstimateRequest {
  if (!/^\d+(?:\.\d+)?$/.test(form.areaText.trim())) {
    throw new BudgetFormValidationError("areaText", "请填写正确的建筑面积");
  }
  const area = Number(form.areaText.trim());
  if (!Number.isFinite(area) || area < 10 || area > 1_000) {
    throw new BudgetFormValidationError("areaText", "建筑面积需在 10 至 1000㎡之间");
  }
  if (!PROPERTY_CONDITIONS.has(form.propertyCondition)) {
    throw new BudgetFormValidationError("propertyCondition", "请选择房屋现状");
  }
  if (!DECORATION_TIERS.has(form.decorationTier)) {
    throw new BudgetFormValidationError("decorationTier", "请选择装修档次");
  }
  if (!DECORATION_SCOPES.has(form.decorationScope)) {
    throw new BudgetFormValidationError("decorationScope", "请选择装修范围");
  }
  const optionCodes = [...new Set(form.selectedOptions)];
  if (optionCodes.length > 20 || optionCodes.some((code) => !OPTION_CODES.has(code))) {
    throw new BudgetFormValidationError("selectedOptions", "选配项目无效");
  }
  const layout = optionalText(form.layout, 40, "layout", "户型最多填写 40 个字符");
  const style = optionalText(form.style, 40, "style", "风格最多填写 40 个字符");
  const demand = optionalText(form.demand, 1_000, "demand", "个性需求最多填写 1000 个字符");
  return {
    area,
    property_condition: form.propertyCondition,
    decoration_tier: form.decorationTier,
    decoration_scope: form.decorationScope,
    ...(layout ? { layout } : {}),
    ...(style ? { style } : {}),
    option_codes: optionCodes,
    ...(demand ? { demand } : {}),
  };
}

export function filterApplicableOptions(
  config: DouyinBudgetPublicConfig,
  form: BudgetFormValue,
): DouyinBudgetPublicOption[] {
  return config.options.filter((option) =>
    option.applicable_property_conditions.includes(form.propertyCondition)
    && option.applicable_decoration_tiers.includes(form.decorationTier)
    && option.applicable_decoration_scopes.includes(form.decorationScope));
}

export function reconcileSelectedOptions(
  config: DouyinBudgetPublicConfig,
  form: BudgetFormValue,
): DouyinBudgetOptionCode[] {
  const applicable = new Set(filterApplicableOptions(config, form).map((option) => option.code));
  return [...new Set(form.selectedOptions)].filter((code) => applicable.has(code));
}

export function updateBudgetSelection(
  config: DouyinBudgetPublicConfig,
  form: BudgetFormValue,
  field: BudgetChoiceField,
  rawValue: string,
): BudgetFormValue {
  const next = updateChoiceValue(form, field, rawValue);
  return { ...next, selectedOptions: reconcileSelectedOptions(config, next) };
}

function updateChoiceValue(
  form: BudgetFormValue,
  field: BudgetChoiceField,
  value: string,
): BudgetFormValue {
  if (field === "propertyCondition" && PROPERTY_CONDITIONS.has(value as DouyinPropertyCondition)) {
    return { ...form, propertyCondition: value as DouyinPropertyCondition };
  }
  if (field === "decorationTier" && DECORATION_TIERS.has(value as DouyinDecorationTier)) {
    return { ...form, decorationTier: value as DouyinDecorationTier };
  }
  if (field === "decorationScope" && DECORATION_SCOPES.has(value as DouyinDecorationScope)) {
    return { ...form, decorationScope: value as DouyinDecorationScope };
  }
  return form;
}

function optionalText(
  value: string,
  maximum: number,
  field: keyof BudgetFormValue,
  message: string,
): string | undefined {
  const normalized = value.trim();
  if (normalized.length > maximum) throw new BudgetFormValidationError(field, message);
  return normalized || undefined;
}
