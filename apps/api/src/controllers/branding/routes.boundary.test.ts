import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("BrandingController architecture boundary", () => {
  test("stays controller-only and is registered by the API route index", () => {
    const controllerSource = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const routesSource = readFileSync(
      new URL("../../routes/index.ts", import.meta.url),
      "utf8",
    );
    expect(controllerSource).not.toContain("@/repositories/");
    expect(controllerSource).not.toContain("@/utils/supabase");
    expect(controllerSource).not.toContain(".from(");
    expect(routesSource).toContain(
      'import BrandingController from "@/controllers/branding";',
    );
    expect(routesSource).toContain(
      "BrandingController.registerExtraRoutes(app);",
    );
  });
});
