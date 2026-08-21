import { Errors } from "@/errors/error-factory";
import { CatalogSpecDefinitionFinalSchema } from "@/schema/supplier-catalog";

type SpecState = {
  code: string;
  name: string;
  value_type: string;
  enum_options: string[];
  unit_dimension: string | null;
  is_required: boolean;
  participates_in_sku_name: boolean;
  is_filterable: boolean;
  sort_order: number;
  status: "active" | "inactive";
};

export function validateCatalogSpecFinalState(input: SpecState) {
  const parsed = CatalogSpecDefinitionFinalSchema.safeParse({
    code: input.code,
    name: input.name,
    value_type: input.value_type,
    enum_options: input.enum_options,
    unit_dimension: input.unit_dimension,
    is_required: input.is_required,
    participates_in_sku_name: input.participates_in_sku_name,
    is_filterable: input.is_filterable,
    sort_order: input.sort_order,
    status: input.status,
  });
  if (parsed.success) return parsed.data;
  throw Errors.fromZod(parsed.error);
}
