import { describe, expect, test } from "bun:test";
import ProjectLogController from ".";

describe("ProjectLogController routes", () => {
  test("does not expose legacy snake_case project log routes", () => {
    const legacyPrefix = "/project" + "_logs";
    const registeredPaths: string[] = [];
    const fastify = {
      get: (path: string) => {
        registeredPaths.push(path);
      },
    };

    ProjectLogController.registerExtraRoutes(fastify as any);

    expect(registeredPaths).toContain("/project-logs/projects");
    expect(registeredPaths).toContain("/project-logs/projects/calendar");
    expect(registeredPaths.some((path) => path.startsWith(legacyPrefix))).toBe(false);
  });
});
