import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { resolveDevChangePlan } from "./resolve-dev-change-plan.mjs";
import { verifyDevBuildPlan } from "./verify-dev-build-plan.mjs";

const metadata = {
  beforeSha: "1111111111111111111111111111111111111111",
  commitSha: "2222222222222222222222222222222222222222",
  workflowRunId: 123,
};
const repositoryRoot = new URL("..", import.meta.url);

function readRepositoryFile(path: string) {
  const file = new URL(path, repositoryRoot);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function resolveManual(mode: "build" | "deploy", service: string) {
  return Bun.spawnSync(
    ["node", "scripts/resolve-web-deployment.mjs", mode, service],
    {
      cwd: new URL("..", import.meta.url).pathname,
      stderr: "pipe",
      stdout: "pipe",
    },
  );
}

describe("H5 development build plan", () => {
  test("classifies H5 application changes as an independent service", () => {
    const plan = resolveDevChangePlan(["apps/h5/src/main.js"], metadata);

    expect(plan.classifications).toEqual(["h5"]);
    expect(plan.build_services).toEqual(["h5"]);
    expect(plan.deploy_services).toEqual(["h5"]);
    expect(
      verifyDevBuildPlan(plan, {
        commitSha: metadata.commitSha,
        workflowRunId: metadata.workflowRunId,
      }),
    ).toEqual(plan);
  });

  test("classifies the tracked development H5 route with the H5 service", () => {
    const plan = resolveDevChangePlan(
      ["deploy/nginx/gooes-dev.conf"],
      metadata,
    );

    expect(plan.classifications).toEqual(["h5"]);
    expect(plan.build_services).toEqual(["h5"]);
    expect(plan.deploy_services).toEqual(["h5"]);
  });

  test("supports explicit H5 build and deployment resolution", () => {
    const build = resolveManual("build", "h5");
    const deploy = resolveManual("deploy", "h5");

    expect(build.exitCode).toBe(0);
    expect(build.stdout.toString().trim()).toBe("h5");
    expect(deploy.exitCode).toBe(0);
    expect(deploy.stdout.toString().trim()).toBe("h5");
  });
});

describe("H5 development image", () => {
  test("builds and runs H5 as an independent immutable service", () => {
    const dockerfile = readRepositoryFile("docker/h5.Dockerfile");
    const compose = readRepositoryFile("deploy/docker-compose.dev.yml");
    const workflow = readRepositoryFile(
      ".github/workflows/build-docker-images.yml",
    );

    expect(dockerfile).toContain("FROM oven/bun:1.3 AS builder");
    expect(dockerfile).toContain('com.goodcms.service="h5"');
    expect(dockerfile).toContain("ENV GOOES_BUILD_SHA=${BUILD_SHA}");
    expect(dockerfile).toContain('CMD ["bun", "server.ts"]');

    expect(compose).toContain("gooes-h5-dev:");
    expect(compose).toContain(
      "image: ${GOOES_H5_IMAGE:?set GOOES_H5_IMAGE}",
    );
    expect(compose).toContain('"127.0.0.1:13030:3020"');
    expect(compose).toContain(
      'r.headers.get(\\"x-gooes-service\\") === \\"h5\\"',
    );

    expect(workflow).toContain(
      "- service: h5\n            image_repo: goose-h5",
    );
    expect(workflow).toContain(
      'build_services: ["api", "admin", "h5", "web", "social-video-worker"]',
    );
    expect(workflow).toContain(
      'ADMIN_API_URL=https://api-dev.goodcms.cn\n            ADMIN_H5_URL=https://h5-dev.goodcms.cn',
    );
    expect(workflow).toContain(
      'ADMIN_API_URL=https://api.goodcms.cn\n            ADMIN_H5_URL=https://h5.goodcms.cn',
    );
    expect(workflow).toContain(
      "h5)\n              docker build \\\n                -f docker/h5.Dockerfile",
    );
  });
});
