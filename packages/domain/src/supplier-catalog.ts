export const CATALOG_SPEC_VALUE_TYPE_VALUES = [
  "text",
  "number",
  "boolean",
  "single_enum",
  "multi_enum",
  "date",
] as const;

export type CatalogSpecValueType =
  (typeof CATALOG_SPEC_VALUE_TYPE_VALUES)[number];

export type CatalogSpecValue = string | number | boolean | string[];

export type CatalogSpecValueMap = Record<string, CatalogSpecValue>;

export type UnitConversionEdge = {
  fromUnitId: string;
  toUnitId: string;
  factor: string;
};
