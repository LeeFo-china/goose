import type {
  DouyinBudgetAiAnalysis,
  DouyinBudgetAiExplanationResponse,
  DouyinBudgetAiStatus,
  DouyinBudgetCategoryCode,
  DouyinBudgetEstimateCategory,
  DouyinBudgetEstimateRequest,
  DouyinBudgetEstimateResult,
  DouyinBudgetOptionCode,
  DouyinBudgetPublicConfig,
  DouyinBudgetPublicOption,
  DouyinDecorationScope,
  DouyinDecorationTier,
  DouyinPropertyCondition,
} from "../models";
import { ApiClient, ApiRequestError } from "./request";

const PROPERTY_CONDITIONS = ["rough", "old_house"] as const;
const DECORATION_TIERS = ["economy", "comfortable", "quality"] as const;
const DECORATION_SCOPES = ["whole_house", "partial"] as const;
const OPTION_CODES = ["demolition", "water_electricity_upgrade", "custom_cabinet"] as const;
const CATEGORY_CODES = ["base", "water_electricity", "materials", "custom", "other"] as const;
const AI_STATUSES = ["pending", "succeeded", "failed", "skipped"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ESTIMATE_NO_PATTERN = /^DYYS-\d{8}-\d{6}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export async function fetchBudgetConfig(client: ApiClient): Promise<DouyinBudgetPublicConfig> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/budget-config",
    method: "GET",
  });
  const parsed = parseBudgetConfig(value);
  if (!parsed) throw invalidResponse();
  return parsed;
}

export async function createBudgetEstimate(
  client: ApiClient,
  input: DouyinBudgetEstimateRequest,
): Promise<DouyinBudgetEstimateResult> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/budget-estimates",
    method: "POST",
    data: input,
  });
  const parsed = parseEstimate(value);
  if (!parsed) throw invalidResponse();
  return parsed;
}

export async function fetchBudgetAiAnalysis(
  client: ApiClient,
  estimateId: string,
  retry = false,
  timeoutMs = 35_000,
): Promise<DouyinBudgetAiExplanationResponse> {
  if (!UUID_PATTERN.test(estimateId)) {
    throw new ApiRequestError(0, "INVALID_BUDGET_ESTIMATE_ID", "预算编号无效");
  }
  const value = await client.request<unknown>({
    path: `/douyin-mini/budget-estimates/${encodeURIComponent(estimateId)}/ai-analysis`,
    method: "POST",
    data: { retry },
    timeoutMs,
  });
  const parsed = parseAiResponse(value);
  if (!parsed || parsed.estimate.id !== estimateId) throw invalidResponse();
  return parsed;
}

function parseBudgetConfig(value: unknown): DouyinBudgetPublicConfig | null {
  if (!isStrictRecord(value, [
    "property_conditions", "decoration_tiers", "decoration_scopes", "options",
    "pricing_version", "effective_from", "effective_to", "disclaimer",
  ])) return null;
  const propertyConditions = parseLabeledTuple(value.property_conditions, PROPERTY_CONDITIONS);
  const decorationTiers = parseLabeledTuple(value.decoration_tiers, DECORATION_TIERS);
  const decorationScopes = parseLabeledTuple(value.decoration_scopes, DECORATION_SCOPES);
  const options = parseOptions(value.options);
  const effectiveFrom = parseDateTime(value.effective_from);
  const effectiveTo = value.effective_to === null ? null : parseDateTime(value.effective_to);
  const pricingVersion = boundedText(value.pricing_version, 1, 40);
  const disclaimer = boundedText(value.disclaimer, 1, 500);
  if (!propertyConditions || !decorationTiers || !decorationScopes || !options
    || !pricingVersion || !effectiveFrom || value.effective_to !== null && !effectiveTo
    || effectiveTo !== null && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)
    || !disclaimer) return null;
  return {
    property_conditions: propertyConditions,
    decoration_tiers: decorationTiers,
    decoration_scopes: decorationScopes,
    options,
    pricing_version: pricingVersion,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    disclaimer,
  };
}

function parseOptions(value: unknown): DouyinBudgetPublicOption[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const options: DouyinBudgetPublicOption[] = [];
  let lastIndex = -1;
  for (const raw of value) {
    if (!isStrictRecord(raw, [
      "code", "label", "applicable_property_conditions",
      "applicable_decoration_tiers", "applicable_decoration_scopes",
    ])) return null;
    const code = parseEnum(raw.code, OPTION_CODES);
    const label = boundedText(raw.label, 1, 40);
    const conditions = parseCanonicalEnumArray(raw.applicable_property_conditions, PROPERTY_CONDITIONS);
    const tiers = parseCanonicalEnumArray(raw.applicable_decoration_tiers, DECORATION_TIERS);
    const scopes = parseCanonicalEnumArray(raw.applicable_decoration_scopes, DECORATION_SCOPES);
    const index = code ? OPTION_CODES.indexOf(code) : -1;
    if (!code || !label || !conditions || !tiers || !scopes || index <= lastIndex) return null;
    lastIndex = index;
    options.push({
      code: code as DouyinBudgetOptionCode,
      label,
      applicable_property_conditions: conditions as DouyinPropertyCondition[],
      applicable_decoration_tiers: tiers as DouyinDecorationTier[],
      applicable_decoration_scopes: scopes as DouyinDecorationScope[],
    });
  }
  return options;
}

function parseEstimate(value: unknown): DouyinBudgetEstimateResult | null {
  if (!isStrictRecord(value, [
    "id", "estimate_no", "minimum_total", "maximum_total", "categories",
    "calculation_basis", "included_items", "excluded_items", "pricing_version",
    "pricing_effective_from", "pricing_effective_to", "disclaimer", "ai_status",
  ])) return null;
  const minimumTotal = parseMoney(value.minimum_total);
  const maximumTotal = parseMoney(value.maximum_total);
  const categories = parseCategories(value.categories);
  const calculationBasis = parseTextList(value.calculation_basis, 20);
  const includedItems = parseTextList(value.included_items, 50);
  const excludedItems = parseTextList(value.excluded_items, 50);
  const pricingVersion = boundedText(value.pricing_version, 1, 40);
  const effectiveFrom = parseDateTime(value.pricing_effective_from);
  const effectiveTo = value.pricing_effective_to === null
    ? null
    : parseDateTime(value.pricing_effective_to);
  const disclaimer = boundedText(value.disclaimer, 1, 500);
  const aiStatus = parseEnum(value.ai_status, AI_STATUSES);
  if (typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || typeof value.estimate_no !== "string" || !ESTIMATE_NO_PATTERN.test(value.estimate_no)
    || minimumTotal === null || maximumTotal === null || minimumTotal > maximumTotal
    || !categories || !calculationBasis || !includedItems || !excludedItems
    || !pricingVersion || !effectiveFrom || value.pricing_effective_to !== null && !effectiveTo
    || effectiveTo !== null && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)
    || !disclaimer || !aiStatus) return null;
  return {
    id: value.id,
    estimate_no: value.estimate_no,
    minimum_total: minimumTotal,
    maximum_total: maximumTotal,
    categories,
    calculation_basis: calculationBasis,
    included_items: includedItems,
    excluded_items: excludedItems,
    pricing_version: pricingVersion,
    pricing_effective_from: effectiveFrom,
    pricing_effective_to: effectiveTo,
    disclaimer,
    ai_status: aiStatus as DouyinBudgetAiStatus,
  };
}

function parseCategories(value: unknown): DouyinBudgetEstimateCategory[] | null {
  if (!Array.isArray(value) || value.length > CATEGORY_CODES.length) return null;
  const categories: DouyinBudgetEstimateCategory[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!isStrictRecord(raw, ["category_code", "label", "minimum_amount", "maximum_amount"])) return null;
    const code = parseEnum(raw.category_code, CATEGORY_CODES);
    const label = boundedText(raw.label, 1, 40);
    const minimum = parseMoney(raw.minimum_amount);
    const maximum = parseMoney(raw.maximum_amount);
    if (!code || seen.has(code) || !label || minimum === null || maximum === null
      || minimum > maximum) return null;
    seen.add(code);
    categories.push({
      category_code: code as DouyinBudgetCategoryCode,
      label,
      minimum_amount: minimum,
      maximum_amount: maximum,
    });
  }
  return categories;
}

function parseAiResponse(value: unknown): DouyinBudgetAiExplanationResponse | null {
  if (!isStrictRecord(value, ["estimate", "ai_analysis"])) return null;
  const estimate = parseEstimate(value.estimate);
  const analysis = value.ai_analysis === null ? null : parseAiAnalysis(value.ai_analysis);
  if (!estimate || value.ai_analysis !== null && !analysis
    || (estimate.ai_status === "succeeded") !== (analysis !== null)) return null;
  return { estimate, ai_analysis: analysis };
}

function parseAiAnalysis(value: unknown): DouyinBudgetAiAnalysis | null {
  if (!isStrictRecord(value, [
    "summary", "allocation_advice", "risk_factors", "onsite_questions",
  ])) return null;
  const summary = boundedText(value.summary, 1, 1_000);
  const allocationAdvice = parseTextList(value.allocation_advice, 10);
  const riskFactors = parseTextList(value.risk_factors, 10);
  const onsiteQuestions = parseTextList(value.onsite_questions, 10);
  return summary && allocationAdvice && riskFactors && onsiteQuestions
    ? {
      summary,
      allocation_advice: allocationAdvice,
      risk_factors: riskFactors,
      onsite_questions: onsiteQuestions,
    }
    : null;
}

function parseLabeledTuple<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): Array<{ value: Values[number]; label: string }> | null {
  if (!Array.isArray(value) || value.length !== values.length) return null;
  const result: Array<{ value: Values[number]; label: string }> = [];
  for (let index = 0; index < values.length; index += 1) {
    const item = value[index];
    if (!isStrictRecord(item, ["value", "label"]) || item.value !== values[index]) return null;
    const label = boundedText(item.label, 1, 40);
    if (!label) return null;
    result.push({ value: values[index]!, label });
  }
  return result;
}

function parseCanonicalEnumArray<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): Values[number][] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > values.length) return null;
  const result: Values[number][] = [];
  let lastIndex = -1;
  for (const raw of value) {
    const parsed = parseEnum(raw, values);
    const index = parsed ? values.indexOf(parsed) : -1;
    if (!parsed || index <= lastIndex) return null;
    lastIndex = index;
    result.push(parsed);
  }
  return result;
}

function parseTextList(value: unknown, maximumItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const parsed = value.map((item) => boundedText(item, 1, 300));
  return parsed.every((item): item is string => item !== null) ? parsed : null;
}

function parseMoney(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseDateTime(value: unknown): string | null {
  return typeof value === "string" && DATE_TIME_PATTERN.test(value)
    && Number.isFinite(Date.parse(value)) ? value : null;
}

function boundedText(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= minimum && text.length <= maximum ? text : null;
}

function parseEnum<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): Values[number] | null {
  return typeof value === "string" && values.includes(value)
    ? value as Values[number]
    : null;
}

function isStrictRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "预算数据无效");
}
