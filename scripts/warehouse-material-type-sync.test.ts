import { expect, test } from "bun:test";
import { syncSelectedDatabaseTypes } from "./warehouse-material-type-sync";

const original = `export type Database = {
  public: {
    Tables: {
      alpha: { Row: { old: string } }
      unrelated: { Row: { mustRemain: string } }
    }
    Functions: {
      run: { Args: { old: string }; Returns: string }
    }
  }
}`;
const generated = original.replace("old: string", "fresh: boolean")
  .replace("mustRemain: string", "unwantedDrift: number")
  .replace("      unrelated:", "      middle: { Row: { id: string } }\n      unrelated:");

test("syncs only selected real generated entries, retaining unrelated historical types", () => {
  const result = syncSelectedDatabaseTypes(original, generated, { Tables: ["alpha", "middle"] });
  expect(result).toContain("fresh: boolean");
  expect(result).toContain("mustRemain: string");
  expect(result).not.toContain("unwantedDrift");
  expect(result.indexOf("middle:")).toBeLessThan(result.indexOf("unrelated:"));
  expect(result).toContain("run: { Args: { old: string }; Returns: string }");
  expect(syncSelectedDatabaseTypes(result, generated, { Tables: ["alpha", "middle"] })).toBe(result);
});

test("fails closed on absent generated table or malformed database shape", () => {
  expect(() => syncSelectedDatabaseTypes(original, generated, { Tables: ["missing"] })).toThrow();
  expect(() => syncSelectedDatabaseTypes(original, "export type Database = number", { Tables: ["alpha"] })).toThrow();
});

test("preserves pre-existing member order even when historical entries are not sorted", () => {
  const unsorted = original.replace("      alpha: { Row: { old: string } }\n", "")
    .replace("      unrelated:", "      zebra: { Row: { keep: boolean } }\n      alpha: { Row: { old: string } }\n      unrelated:");
  expect(syncSelectedDatabaseTypes(unsorted, generated, { Tables: ["alpha"] }))
    .toBe(unsorted.replace("old: string", "fresh: boolean"));
});
