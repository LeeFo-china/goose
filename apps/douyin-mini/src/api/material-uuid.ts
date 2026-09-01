const MATERIAL_UUID_PATTERN = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

export function isMaterialUuid(value: unknown): value is string {
  return typeof value === "string" && MATERIAL_UUID_PATTERN.test(value);
}

export function normalizeMaterialUuid(value: unknown): string | null {
  return isMaterialUuid(value) ? value.toLowerCase() : null;
}
