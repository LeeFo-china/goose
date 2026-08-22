import type {
  DouyinBudgetEstimateRequest,
  DouyinBudgetLayoutCode,
  DouyinBudgetOptionCode,
  DouyinBudgetPublicConfig,
  DouyinBudgetPublicOption,
  DouyinBudgetStyleCode,
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
const CUSTOM_TEXT_CHOICE_VALUE = "__custom__";

export type BudgetTextChoice<Code extends string = string> = Readonly<{
  value: string;
  label: string;
  code: Code;
  custom: boolean;
}>;

export const BUDGET_LAYOUT_CHOICES: readonly BudgetTextChoice<DouyinBudgetLayoutCode>[] = [
  {
    value: "一室一厅",
    label: "一室一厅",
    code: "one_bedroom_one_living",
    custom: false,
  },
  {
    value: "两室一厅",
    label: "两室一厅",
    code: "two_bedroom_one_living",
    custom: false,
  },
  {
    value: "两室两厅",
    label: "两室两厅",
    code: "two_bedroom_two_living",
    custom: false,
  },
  {
    value: "三室一厅",
    label: "三室一厅",
    code: "three_bedroom_one_living",
    custom: false,
  },
  {
    value: "三室两厅",
    label: "三室两厅",
    code: "three_bedroom_two_living",
    custom: false,
  },
  {
    value: "四室两厅",
    label: "四室两厅",
    code: "four_bedroom_two_living",
    custom: false,
  },
  {
    value: "别墅/复式",
    label: "别墅/复式",
    code: "villa_duplex",
    custom: false,
  },
  { value: CUSTOM_TEXT_CHOICE_VALUE, label: "自定义", code: "custom", custom: true },
];

export const BUDGET_STYLE_CHOICES: readonly BudgetTextChoice<DouyinBudgetStyleCode>[] = [
  { value: "现代简约", label: "现代简约", code: "modern_simple", custom: false },
  { value: "奶油风", label: "奶油风", code: "cream", custom: false },
  { value: "新中式", label: "新中式", code: "new_chinese", custom: false },
  { value: "北欧", label: "北欧", code: "nordic", custom: false },
  { value: "轻奢", label: "轻奢", code: "light_luxury", custom: false },
  { value: "原木风", label: "原木风", code: "natural_wood", custom: false },
  { value: "美式", label: "美式", code: "american", custom: false },
  { value: "法式", label: "法式", code: "french", custom: false },
  { value: "侘寂风", label: "侘寂风", code: "wabi_sabi", custom: false },
  { value: CUSTOM_TEXT_CHOICE_VALUE, label: "自定义", code: "custom", custom: true },
];

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

export type BudgetOptionView = DouyinBudgetPublicOption & { selected: boolean };

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
  const optionCodes = form.decorationScope === "partial" ? [...new Set(form.selectedOptions)] : [];
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
    ...(layout ? { layout_code: layoutCodeFor(layout), layout } : {}),
    ...(style ? { style_code: styleCodeFor(style), style } : {}),
    option_codes: optionCodes,
    ...(demand ? { demand } : {}),
  };
}

export function filterApplicableOptions(
  config: DouyinBudgetPublicConfig,
  form: BudgetFormValue,
): DouyinBudgetPublicOption[] {
  if (form.decorationScope !== "partial") return [];
  return config.options.filter((option) =>
    option.applicable_property_conditions.includes(form.propertyCondition)
    && option.applicable_decoration_tiers.includes(form.decorationTier)
    && option.applicable_decoration_scopes.includes(form.decorationScope));
}

export function selectBudgetTextChoice(
  choices: readonly BudgetTextChoice[],
  rawIndex: string,
  customValue: string,
): { value: string; code: string; isCustom: boolean } {
  const index = Number(rawIndex);
  const choice = Number.isInteger(index) ? choices[index] : undefined;
  if (!choice) return { value: customValue.trim(), code: "custom", isCustom: true };
  if (choice.custom) return { value: customValue.trim(), code: choice.code, isCustom: true };
  return { value: choice.value, code: choice.code, isCustom: false };
}

export function normalizeBudgetFormForConfig(
  config: DouyinBudgetPublicConfig,
  form: BudgetFormValue,
): BudgetFormValue {
  const normalized = {
    ...form,
    propertyCondition: config.property_conditions.some(
      (item) => item.value === form.propertyCondition,
    ) ? form.propertyCondition : config.property_conditions[0]!.value,
    decorationTier: config.decoration_tiers.some(
      (item) => item.value === form.decorationTier,
    ) ? form.decorationTier : config.decoration_tiers[0]!.value,
    decorationScope: config.decoration_scopes.some(
      (item) => item.value === form.decorationScope,
    ) ? form.decorationScope : config.decoration_scopes[0]!.value,
  };
  return {
    ...normalized,
    selectedOptions: reconcileSelectedOptions(config, normalized),
  };
}

export function buildBudgetOptionViews(
  config: DouyinBudgetPublicConfig,
  form: BudgetFormValue,
): BudgetOptionView[] {
  const selected = new Set(form.selectedOptions);
  return filterApplicableOptions(config, form).map((option) => ({
    ...option,
    selected: selected.has(option.code),
  }));
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

function layoutCodeFor(value: string): DouyinBudgetLayoutCode {
  return BUDGET_LAYOUT_CHOICES.find(
    (choice) => !choice.custom && choice.value === value,
  )?.code ?? "custom";
}

function styleCodeFor(value: string): DouyinBudgetStyleCode {
  return BUDGET_STYLE_CHOICES.find(
    (choice) => !choice.custom && choice.value === value,
  )?.code ?? "custom";
}
