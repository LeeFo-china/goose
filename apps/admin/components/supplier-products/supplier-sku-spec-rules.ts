export type SupplierSkuSpecDefinition = {
  id: string;
  code: string;
  name: string;
  value_type: "text" | "number" | "boolean" | "single_enum" | "multi_enum" | "date";
  required: boolean;
  enum_options: string[];
  unit_dimension: string | null;
  participates_in_sku_name: boolean;
};

export type SupplierSkuSpecValue =
  | string
  | number
  | boolean
  | string[];

export function suggestedSkuName(
  specs: readonly SupplierSkuSpecDefinition[],
  values: Record<string, SupplierSkuSpecValue | undefined>,
  baseName: string,
): string {
  const segments = specs
    .filter((spec) => spec.participates_in_sku_name)
    .map((spec) => values[spec.name])
    .filter((value) => value !== undefined && value !== "" && value !== null)
    .map((value) => Array.isArray(value) ? value.join(" ") : String(value));

  return [baseName.trim(), ...segments].filter(Boolean).join(" ");
}

export function collectSpecValues(
  specs: readonly SupplierSkuSpecDefinition[],
  rawValues: Record<string, unknown>,
): Record<string, SupplierSkuSpecValue> {
  const result: Record<string, SupplierSkuSpecValue> = {};
  for (const spec of specs) {
    const raw = rawValues[spec.name];
    if (raw === undefined || raw === "" || raw === null) continue;
    if (spec.value_type === "number") {
      const number = Number(raw);
      if (Number.isFinite(number)) result[spec.name] = number;
    } else if (spec.value_type === "boolean") {
      result[spec.name] = raw === true;
    } else if (spec.value_type === "multi_enum") {
      result[spec.name] = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    } else {
      result[spec.name] = String(raw);
    }
  }
  return result;
}
