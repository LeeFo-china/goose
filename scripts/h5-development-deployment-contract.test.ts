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
    const dockerignore = readRepositoryFile(".dockerignore");
    const compose = readRepositoryFile("deploy/docker-compose.dev.yml");
    const workflow = readRepositoryFile(
      ".github/workflows/build-docker-images.yml",
    );

    expect(dockerfile).toContain("FROM oven/bun:1.3 AS builder");
    expect(dockerfile).toContain('com.goodcms.service="h5"');
    expect(dockerfile).toContain("ENV GOOES_BUILD_SHA=${BUILD_SHA}");
    expect(dockerfile).toContain('CMD ["bun", "server.ts"]');
    expect(dockerignore.split(/\r?\n/)).not.toContain("apps/h5");

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

describe("H5 development hostname cutover", () => {
  test("routes H5 pages to H5 and compatibility APIs to API", () => {
    const nginx = readRepositoryFile("deploy/nginx/gooes-dev.conf");
    const workflow = readRepositoryFile(".github/workflows/deploy-dev.yml");
    const apiServer = nginx.slice(
      nginx.indexOf("server_name api-dev.goodcms.cn;"),
      nginx.indexOf("server_name admin-dev.goodcms.cn;"),
    );
    const adminServer = nginx.slice(
      nginx.indexOf("server_name admin-dev.goodcms.cn;"),
      nginx.indexOf("server_name h5-dev.goodcms.cn;"),
    );

    expect(apiServer).toContain("proxy_pass http://127.0.0.1:13000;");
    expect(adminServer).toContain("proxy_pass http://127.0.0.1:13010;");
    expect(nginx).toContain("server_name h5-dev.goodcms.cn;");
    expect(nginx).toContain("location = /public/marketing-pages {");
    expect(nginx).toContain("location ^~ /public/marketing-pages/ {");
    expect(nginx).toContain("location ^~ /public/tenants/ {");
    expect(nginx).toContain("location = /wechat/h5-session {");
    expect(nginx.match(/proxy_pass http:\/\/127\.0\.0\.1:13000;/g)).toHaveLength(
      5,
    );
    expect(nginx).toContain(
      "location / {\n        proxy_pass http://127.0.0.1:13030;",
    );

    expect(workflow).toContain(
      "options: [api, admin, h5, web, social-video-worker, cos-reconcile-worker, billing-reconcile-worker]",
    );
    expect(workflow).toContain(
      "h5) DEPLOY_SERVICES=h5; MANIFEST_SERVICE=h5 ;;",
    );
    expect(workflow).toContain("h5) manifest_repository=goose-h5 ;;");
    expect(workflow).toContain(
      'export GOOES_H5_IMAGE="${image_base}/goose-h5:${SOURCE_SHA}"',
    );
    expect(workflow).toContain(
      'h5) compose_service=gooes-h5-dev; export GOOES_H5_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
    );
    expect(workflow).toContain(
      "h5) container=gooes-h5-dev; url=https://h5-dev.goodcms.cn/config.js ;;",
    );
    expect(workflow).toContain("- name: Cut over dev H5 route");
    expect(workflow).toContain(
      'nginx_target="/etc/nginx/conf.d/gooes-dev.conf"',
    );
    expect(workflow).toContain(
      'sudo install -m 0644 deploy/nginx/gooes-dev.conf "${nginx_target}"',
    );
    expect(workflow).toContain("sudo nginx -t");
    expect(workflow).toContain("sudo systemctl reload nginx");
    expect(workflow).toContain("route_ready=false");
    expect(workflow).toContain("--noproxy '*'");
    expect(workflow).toContain(
      "--resolve h5-dev.goodcms.cn:443:127.0.0.1",
    );
    expect(workflow).toContain(
      "https://h5-dev.goodcms.cn/p/h5-deployment-smoke",
    );
    expect(workflow).toContain('restore_h5_nginx "external smoke failed"');
  });
});
