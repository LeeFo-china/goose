import type { AdministrativeAreaOption } from "@/components/platform-partners/platform-partner-types";

export function collectPartnerRegionCodes(
  ...collections: Array<Array<{ region_codes: string[] }>>
) {
  return Array.from(
    new Set(
      collections.flatMap((collection) =>
        collection.flatMap((item) => item.region_codes)
      ),
    ),
  ).sort();
}

export function attachRegionAreas<T extends { region_codes: string[] }>(
  records: T[],
  areaByCode: Map<string, AdministrativeAreaOption>,
) {
  return records.map((record) => ({
    ...record,
    region_areas: record.region_codes
      .map((code) => areaByCode.get(code))
      .filter((area): area is AdministrativeAreaOption => Boolean(area)),
  }));
}
