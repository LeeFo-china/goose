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

  test("executes inherited handlers with instance binding and sibling isolation", async () => {
    class ParentController {
      protected owner = "parent";

      @Get("/decorator/inherited")
      inherited() {
        return { owner: this.owner, route: "inherited" };
      }
    }

    class ChildController extends ParentController {
      protected override owner = "child";

      @Post("/decorator/child")
      child() {
        return { owner: this.owner, route: "child" };
      }
    }

    class SiblingController extends ParentController {
      protected override owner = "sibling";

      @Get("/decorator/sibling")
      sibling() {
        return { owner: this.owner, route: "sibling" };
      }
    }

    const childApp = Fastify();
    const siblingApp = Fastify();

    try {
      registerRoutes(childApp, new ChildController());
      registerRoutes(siblingApp, new SiblingController());

      const inheritedFromChild = await childApp.inject({
        method: "GET",
        url: "/decorator/inherited",
      });
      const child = await childApp.inject({
        method: "POST",
        url: "/decorator/child",
      });
      const missingSibling = await childApp.inject({
        method: "GET",
        url: "/decorator/sibling",
      });
      const inheritedFromSibling = await siblingApp.inject({
        method: "GET",
        url: "/decorator/inherited",
      });
      const sibling = await siblingApp.inject({
        method: "GET",
        url: "/decorator/sibling",
      });
      const missingChild = await siblingApp.inject({
        method: "POST",
        url: "/decorator/child",
      });

      expect(inheritedFromChild.statusCode).toBe(200);
      expect(inheritedFromChild.body).toBe(JSON.stringify({
        owner: "child",
        route: "inherited",
      }));
      expect(child.statusCode).toBe(200);
      expect(child.body).toBe(JSON.stringify({
        owner: "child",
        route: "child",
      }));
      expect(missingSibling.statusCode).toBe(404);

      expect(inheritedFromSibling.statusCode).toBe(200);
      expect(inheritedFromSibling.body).toBe(JSON.stringify({
        owner: "sibling",
        route: "inherited",
      }));
      expect(sibling.statusCode).toBe(200);
      expect(sibling.body).toBe(JSON.stringify({
        owner: "sibling",
        route: "sibling",
      }));
      expect(missingChild.statusCode).toBe(404);
    } finally {
      await childApp.close();
      await siblingApp.close();
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
