import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("tenant service area field contract", () => {
  test("keeps database schema and repository tenant projection complete", () => {
    const migration = readSource("../../../../supabase/migrations/20260604170000_create_tenant_service_areas.sql");
    const repository = readSource("./tenant-service-areas.ts");

    for (const field of [
      "province",
      "city",
      "district",
      "adcode",
      "center_latitude",
      "center_longitude",
      "service_radius_km",
      "priority",
      "status",
    ]) {
      expect(migration).toContain(field);
    }

    for (const field of [
      "address_title",
      "address_poi_id",
      "address_province",
      "address_city",
      "address_district",
      "address_adcode",
      "address_latitude",
      "address_longitude",
      "address_source",
      "address_confidence",
      "address_confirmed_at",
    ]) {
      expect(repository).toContain(field);
    }
  });
});
