import { describe, expect, test } from "bun:test";
import Fastify from "fastify";

import { Delete, Get, Post, registerRoutes } from "./route";

describe("route decorators", () => {
  test("register default and explicit tenant access in real Fastify config", async () => {
    class TestController {
      @Get("/decorator/read")
      read() {
        return { ok: true };
      }

      @Post("/decorator/write")
      write() {
        return { ok: true };
      }

      @Delete("/decorator/delete")
      delete() {
        return { ok: true };
      }

      @Post("/decorator/recover", { tenantServiceAccess: "recovery" })
      recover() {
        return { ok: true };
      }
    }

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

    try {
      registerRoutes(app, new TestController());
      await app.ready();

      expect(findAccess(observed, "GET", "/decorator/read")).toBe("read");
      expect(findAccess(observed, "HEAD", "/decorator/read")).toBe("read");
      expect(findAccess(observed, "POST", "/decorator/write")).toBe("write");
      expect(findAccess(observed, "DELETE", "/decorator/delete")).toBe("write");
      expect(findAccess(observed, "POST", "/decorator/recover"))
        .toBe("recovery");
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
