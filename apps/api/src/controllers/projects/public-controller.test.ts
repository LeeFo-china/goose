import { describe, expect, test } from "bun:test";
import { PublicProjectsQuerySchema } from "./public-controller";

describe("public project list query", () => {
  test("uses page 1 and pageSize 20 by default", () => {
    expect(PublicProjectsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  test("rejects pageSize above 100", () => {
    expect(() => PublicProjectsQuerySchema.parse({ pageSize: 101 })).toThrow();
  });
});
