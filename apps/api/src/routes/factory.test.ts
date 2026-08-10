import { describe, expect, test } from "bun:test";
import Fastify from "fastify";

import { BaseController } from "@/controllers/BaseController";
import { createResourceRoutes } from "./factory";

class TestResourceController extends BaseController {
  constructor() {
    super("test_resources");
  }

  override list = async () => ({ action: "list" });
  override getById = async () => ({ action: "get" });
  override create = async () => ({ action: "create" });
  override update = async () => ({ action: "update" });
}

describe("createResourceRoutes", () => {
  test("registers resource reads and writes with explicit Fastify config", async () => {
    const app = Fastify();
    const observed: Array<{
      method: string;
      url: string;
      tenantServiceAccess: unknown;
    }> = [];
    app.addHook("onRoute", (route) => {
      const methods = Array.isArray(route.method)
        ? route.method
        : [route.method];
      for (const method of methods) {
        observed.push({
          method,
          url: route.url,
          tenantServiceAccess: route.config?.tenantServiceAccess,
        });
      }
    });
    app.register(createResourceRoutes(
      "widgets",
      new TestResourceController(),
      { list: true, getById: true, create: true, update: true },
    ));

    try {
      await app.ready();

      expect(findAccess(observed, "GET", "/widgets")).toBe("read");
      expect(findAccess(observed, "HEAD", "/widgets")).toBe("read");
      expect(findAccess(observed, "GET", "/widgets/:id")).toBe("read");
      expect(findAccess(observed, "HEAD", "/widgets/:id")).toBe("read");
      expect(findAccess(observed, "POST", "/widgets")).toBe("write");
      expect(findAccess(observed, "PATCH", "/widgets/:id")).toBe("write");
      expect(findAccess(observed, "PUT", "/widgets/:id")).toBe("write");
    } finally {
      await app.close();
    }
  });
});

function findAccess(
  observed: Array<{
    method: string;
    url: string;
    tenantServiceAccess: unknown;
  }>,
  method: string,
  url: string,
) {
  return observed.find((route) => route.method === method && route.url === url)
    ?.tenantServiceAccess;
}
