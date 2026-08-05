import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

type ControllerBoundary = {
  file: string;
  permissions: string[];
  forbidLegacyGuard?: boolean;
};

const controllerBoundaries: ControllerBoundary[] = [
  {
    file: "controllers/platform-tenants/index.ts",
    permissions: [
      "platform.tenant.read",
      "platform.tenant.manage",
      "platform.tenant.status.manage",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-audit-logs/index.ts",
    permissions: ["platform.audit.read"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-location/index.ts",
    permissions: ["platform.location.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/picture-library/index.ts",
    permissions: ["platform.picture.read", "platform.picture.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-service-orders/index.ts",
    permissions: ["platform.service_order.read"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/admin-ops/index.ts",
    permissions: ["platform.ops.execute"],
  },
  {
    file: "controllers/platform-partners/index.ts",
    permissions: [
      "platform.partner.read",
      "platform.partner.manage",
      "platform.partner.binding.manage",
    ],
    forbidLegacyGuard: true,
  },
];

describe("platform permission boundaries", () => {
  test.each(controllerBoundaries)(
    "$file declares concrete platform permission checks",
    (boundary) => {
      const source = readFileSync(
        new URL(`../${boundary.file}`, import.meta.url),
        "utf8",
      );

      for (const permission of boundary.permissions) {
        expect(source).toContain(permission);
      }
      expect(source).toContain("getRequiredPlatformPermissionContext");
      if (boundary.forbidLegacyGuard) {
        expect(source).not.toContain("getRequiredPlatformAdminContext(request)");
      }
    },
  );

  test("platform audit service checks audit permission instead of legacy admin flag", () => {
    const source = readFileSync(
      new URL("../services/platform-audit-logs.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.audit.read");
    expect(source).toContain("platformAuthorizationService.assertPermission");
    expect(source).not.toContain("authContext.isPlatformAdmin");
  });

  test("platform partners service checks concrete partner permissions", () => {
    const source = readFileSync(
      new URL("../services/platform-partners.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.partner.read");
    expect(source).toContain("platform.partner.manage");
    expect(source).toContain("platform.partner.binding.manage");
    expect(source).not.toContain("assertPlatformAdmin");
  });
});
