import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

type SpecValue = string | number | boolean | string[];
type SpecDefinition = {
  code: string;
  value_type: string;
  enum_options: string[];
  unit_dimension: string | null;
  is_required: boolean;
};

export function validateSupplierSkuSpecValues(
  values: Record<string, SpecValue>,
  definitions: SpecDefinition[],
): void {
  const byCode = new Map(definitions.map((definition) => [
    definition.code,
    definition,
  ]));

  for (const code of Object.keys(values)) {
    if (!byCode.has(code)) fail(code, "规格字段不在当前有效模板中");
  }

  for (const definition of definitions) {
    const value = values[definition.code];
    if (value === undefined) {
      if (definition.is_required) fail(definition.code, "缺少必填规格值");
      continue;
    }
    if (!isValidValue(value, definition)) {
      fail(definition.code, "规格值类型或枚举选项无效");
    }
  }
}

function isValidValue(value: SpecValue, definition: SpecDefinition): boolean {
  switch (definition.value_type) {
    case "text":
      return typeof value === "string" && value.trim() !== "";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "single_enum":
      return typeof value === "string" && definition.enum_options.includes(value);
    case "multi_enum":
      return Array.isArray(value)
        && (!definition.is_required || value.length > 0)
        && value.every((item) => definition.enum_options.includes(item))
        && new Set(value).size === value.length;
    case "date":
      return typeof value === "string" && isIsoDate(value);
    default:
      return false;
  }
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function fail(code: string, reason: string): never {
  throw Errors.business(
    409,
    `SKU 规格 [${code}] 不符合当前分类模板`,
    ErrorCodes.SPEC_TEMPLATE_VALIDATION_ERROR,
    { code, reason },
  );
}
