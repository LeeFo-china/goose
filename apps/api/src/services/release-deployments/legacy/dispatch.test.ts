import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { GithubWorkflowRun } from "./types";

const SHA = "a".repeat(40);
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabasePublish = process.env.SUPABASE_PUBLISH;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let shared: typeof import("./shared");
let dispatchModule: typeof import("./dispatch");
let runsModule: typeof import("./runs");
let runtimeModule: typeof import("./runtime");

beforeAll(async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_PUBLISH = process.env.SUPABASE_PUBLISH || "test-publish";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role";
  shared = await import("./shared");
  dispatchModule = await import("./dispatch");
  runsModule = await import("./runs");
  runtimeModule = await import("./runtime");
});

afterAll(() => {
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabasePublish === undefined) delete process.env.SUPABASE_PUBLISH;
  else process.env.SUPABASE_PUBLISH = originalSupabasePublish;
  if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
});

function run(overrides: Partial<GithubWorkflowRun> = {}): GithubWorkflowRun {
  return {
    id: 100,
    name: "Release Production",
    display_title: "Production build api candidate v2026.07.13.1",
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    head_branch: "v2026.07.13.1",
    head_sha: SHA,
    html_url: "https://github.com/acme/repo/actions/runs/100",
    created_at: "2026-07-13T01:00:00Z",
    updated_at: "2026-07-13T01:10:00Z",
    run_started_at: "2026-07-13T01:01:00Z",
    ...overrides,
  };
}

describe("buildReleaseDispatchRequest", () => {
  test("targets the stable development release orchestrator", () => {
    const request = dispatchModule.buildReleaseDispatchRequest({
      environment: "dev",
      service: "api",
      ref_type: "branch",
      ref: "main",
      operation: "release",
      reason: "验证开发发布",
    });

    expect(request).toEqual({
      workflowId: "release-dev.yml",
      ref: "main",
      stage: "release",
      inputs: { service: "api", operation: "release", reason: "验证开发发布" },
    });
    expect(request.workflowId).not.toBe("deploy-dev.yml");
    expect(request.workflowId).not.toBe("build-docker-images.yml");
  });

  test("targets production candidate build with expanded services", () => {
    const request = dispatchModule.buildReleaseDispatchRequest({
      environment: "production",
      service: "all",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      operation: "release",
      reason: "候选构建",
      confirm_text: "确认构建生产候选",
    });

    expect(request).toEqual({
      workflowId: "release-production.yml",
      ref: "v2026.07.13.1",
      stage: "build",
      inputs: {
        operation: "build",
        service:
          "api,admin,social-video-worker,cos-reconcile-worker,billing-reconcile-worker",
        confirm_text: "确认构建生产候选",
        reason: "候选构建",
      },
    });
    expect(request.workflowId).not.toBe("deploy-dev.yml");
    expect(request.workflowId).not.toBe("build-docker-images.yml");
  });

  test("does not keep direct production publish copy in tag helpers", () => {
    const tagsSource = readFileSync(join(import.meta.dir, "tags.ts"), "utf8");
    expect(tagsSource).toContain("可以使用该 Tag 构建生产候选");
    expect(tagsSource).not.toContain("可以直接选择该 Tag 发起生产发布");
  });
});

describe("release workflow concurrency guard", () => {
  test("treats every incomplete GitHub workflow status as active", async () => {
    const activeStatuses = ["queued", "in_progress", "requested", "waiting", "pending"] as const;
    const requestedPaths: string[] = [];
    const githubRequest = mock(async (path: string) => {
      requestedPaths.push(path);
      return {
        workflow_runs: activeStatuses.map((status, index) => run({
          id: index + 1,
          status,
          conclusion: null,
        })),
      };
    });

    const result = await dispatchModule.listActiveRuns.call(
      { githubRequest },
      shared.RELEASE_WORKFLOWS.production,
    );

    expect(requestedPaths).toEqual([
      "/actions/workflows/release-production.yml/runs?event=workflow_dispatch&per_page=100",
    ]);
    expect(result.map((item) => item.status)).toEqual(activeStatuses);
  });

  test("ignores completed workflow runs", async () => {
    const githubRequest = mock(async () => ({
      workflow_runs: [run({ status: "completed", conclusion: "success" })],
    }));

    await expect(dispatchModule.assertWorkflowIdle.call(
      {
        githubRequest,
        listActiveRuns: dispatchModule.listActiveRuns,
      },
      shared.RELEASE_WORKFLOWS.production,
    )).resolves.toBeUndefined();
  });
});

describe("runtime service version contracts", () => {
  test("includes the billing reconcile worker in release and runtime scopes", () => {
    expect(shared.RELEASE_WORKFLOWS.dev.services).toContain(
      "billing-reconcile-worker" as never,
    );
    expect(shared.RELEASE_WORKFLOWS.production.services).toContain(
      "billing-reconcile-worker" as never,
    );
    expect(shared.expandAdminReleaseServices(["all"]).at(-1)).toBe(
      "billing-reconcile-worker",
    );
    expect(shared.getRuntimeService("gooes-billing-reconcile-worker")).toBe(
      "billing-reconcile-worker",
    );
    expect(shared.getRuntimeService("gooes-billing-reconcile-worker-dev")).toBe(
      "billing-reconcile-worker",
    );
  });

  test("recognizes official website containers as runtime-only services", () => {
    expect(shared.getRuntimeService("gooes-web")).toBe("web");
    expect(shared.getRuntimeService("gooes-web-dev")).toBe("web");
    expect(shared.getReleaseServiceOrder("web" as never)).toBeGreaterThan(shared.getReleaseServiceOrder("admin"));
  });

  test("keeps official website out of existing admin release service options", () => {
    expect(shared.RELEASE_WORKFLOWS.dev.services as string[]).not.toContain("web");
    expect(shared.RELEASE_WORKFLOWS.production.services as string[]).not.toContain("web");
    expect(shared.expandAdminReleaseServices(["all"])).not.toContain("web" as never);
  });
});

describe("release run stages", () => {
  test("marks old workflows as visible legacy runs", () => {
    const normalized = shared.normalizeWorkflowRun(shared.LEGACY_RELEASE_WORKFLOWS[0]!, run({
      display_title: "Dev deploy api aaaaaaa",
    }));

    expect(normalized.stage).toBe("legacy");
    expect(normalized.stage_label).toBe("历史记录");
    expect(normalized.legacy).toBe(true);
  });

  test("marks production migration runs outside the release stage model", () => {
    const normalized = shared.normalizeWorkflowRun(shared.PRODUCTION_MIGRATION_WORKFLOW, run({
      display_title: "Production database migration plan",
    }));

    expect(normalized.stage).toBe("legacy");
    expect(normalized.legacy).toBe(true);
  });

  test("normalizes production build lifecycle", () => {
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      status: "queued",
      conclusion: null,
    })).stage).toBe("build_queued");
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      status: "in_progress",
      conclusion: null,
    })).stage).toBe("building");
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      status: "completed",
      conclusion: "failure",
    })).stage).toBe("build_failed");
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run()).stage).toBe("ready_to_deploy");
  });

  test("normalizes production deploy lifecycle", () => {
    const deployTitle = "Production deploy api candidate 123";
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      display_title: deployTitle,
      status: "queued",
      conclusion: null,
    })).stage).toBe("deploy_queued");
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      display_title: deployTitle,
      status: "in_progress",
      conclusion: null,
    })).stage).toBe("deploying");
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      display_title: deployTitle,
      status: "completed",
      conclusion: "failure",
    })).stage).toBe("deploy_failed");
    expect(shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      display_title: deployTitle,
    })).stage).toBe("deployed");
  });

  test("normalizes development orchestrator success as deployed", () => {
    const normalized = shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.dev, run({
      display_title: "Dev release api from main",
    }));

    expect(normalized.stage).toBe("deployed");
    expect(normalized.stage_label).toBe("已部署");
    expect(normalized.legacy).toBe(false);
  });

  test("filters recent production runs by build or deploy stage", () => {
    const buildRun = shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      display_title: "Production build api candidate v2026.07.13.1",
    }));
    const deployRun = shared.normalizeWorkflowRun(shared.RELEASE_WORKFLOWS.production, run({
      display_title: "Production deploy api candidate 321",
    }));

    expect(dispatchModule.matchesRecentRunStage(buildRun, "build")).toBe(true);
    expect(dispatchModule.matchesRecentRunStage(buildRun, "deploy")).toBe(false);
    expect(dispatchModule.matchesRecentRunStage(deployRun, "deploy")).toBe(true);
    expect(dispatchModule.matchesRecentRunStage(deployRun, "build")).toBe(false);
  });
});

describe("listSuccessfulRefs", () => {
  test("includes automatic development deployments before older manual releases", async () => {
    const autoSha = "5".repeat(40);
    const manualSha = "6".repeat(40);
    const requestedPaths: string[] = [];
    const githubRequest = mock(async (path: string) => {
      requestedPaths.push(path);
      if (path.includes("auto-deploy-dev.yml")) {
        return { workflow_runs: [run({
          id: 11,
          name: "Auto Deploy Dev",
          display_title: "Auto dev deploy 5555555555555555555555555555555555555555",
          event: "workflow_run",
          head_branch: "main",
          head_sha: autoSha,
          created_at: "2026-08-22T16:18:21Z",
        })] };
      }
      if (path.includes("release-dev.yml")) {
        return { workflow_runs: [run({
          id: 12,
          display_title: "Dev release admin from main",
          head_branch: "main",
          head_sha: manualSha,
          created_at: "2026-08-22T12:51:37Z",
        })] };
      }
      if (path.includes("release-production.yml")) {
        return { workflow_runs: [] };
      }
      return { workflow_runs: [] };
    });

    const result = await runsModule.listSuccessfulRefs.call(
      { githubRequest },
      { page: 1, pageSize: 5, environment: "dev" },
    );

    expect(requestedPaths.some((path) => path.includes("auto-deploy-dev.yml"))).toBe(true);
    expect(result.list.map((item) => item.head_sha)).toEqual([autoSha, manualSha]);
    expect(result.list[0]?.workflow_id).toBe("auto-deploy-dev.yml");
    expect(result.list[0]?.workflow_label).toBe("开发环境自动部署");
  });

  test("does not include automatic development deployments in production sources", async () => {
    const requestedPaths: string[] = [];
    const githubRequest = mock(async (path: string) => {
      requestedPaths.push(path);
      return { workflow_runs: [] };
    });

    await runsModule.listSuccessfulRefs.call(
      { githubRequest },
      { page: 1, pageSize: 5, environment: "production" },
    );

    expect(requestedPaths.some((path) => path.includes("auto-deploy-dev.yml"))).toBe(false);
    expect(requestedPaths).toEqual([
      "/actions/workflows/release-production.yml/runs?status=completed&per_page=100",
    ]);
  });

  test("keeps only deployed stable orchestrator runs", async () => {
    const githubRequest = mock(async (path: string) => {
      if (path.includes("release-dev.yml")) {
        return { workflow_runs: [run({
          id: 1,
          display_title: "Dev release api from main",
          head_branch: "main",
        })] };
      }
      if (path.includes("release-production.yml")) {
        return { workflow_runs: [
          run({
            id: 2,
            display_title: "Production build api candidate v2026.07.13.1",
            head_branch: "v2026.07.13.1",
            head_sha: "b".repeat(40),
          }),
          run({
            id: 3,
            display_title: "Production deploy api candidate 2",
            head_branch: "v2026.07.13.1",
            head_sha: "c".repeat(40),
          }),
        ] };
      }
      if (path.includes("auto-deploy-dev.yml")) {
        return { workflow_runs: [] };
      }
      return { workflow_runs: [run({
        id: 4,
        display_title: "Build production all",
        head_sha: "d".repeat(40),
      })] };
    });

    const result = await runsModule.listSuccessfulRefs.call(
      { githubRequest },
      { page: 1, pageSize: 10 },
    );

    expect(result.list.map((item) => item.id).sort()).toEqual(["1", "3"]);
  });

  test("uses automatic development deployment as latest development runtime source", async () => {
    const autoSha = "7".repeat(40);
    const manualSha = "8".repeat(40);
    const requestedPaths: string[] = [];
    const githubRequest = mock(async (path: string) => {
      requestedPaths.push(path);
      if (path.includes("auto-deploy-dev.yml")) {
        return { workflow_runs: [run({
          id: 21,
          name: "Auto Deploy Dev",
          display_title: "Auto dev deploy 7777777777777777777777777777777777777777",
          event: "workflow_run",
          head_branch: "main",
          head_sha: autoSha,
          created_at: "2026-08-22T16:18:21Z",
        })] };
      }
      if (path.includes("release-dev.yml")) {
        return { workflow_runs: [run({
          id: 22,
          display_title: "Dev release admin from main",
          head_branch: "main",
          head_sha: manualSha,
          created_at: "2026-08-22T12:51:37Z",
        })] };
      }
      if (path.includes("release-production.yml")) {
        return { workflow_runs: [] };
      }
      return { workflow_runs: [] };
    });

    const result = await runtimeModule.getLatestSuccessfulRefsByEnvironment.call({ githubRequest });

    expect(requestedPaths.some((path) => path.includes("auto-deploy-dev.yml"))).toBe(true);
    expect(result.dev?.head_sha).toBe(autoSha);
    expect(result.dev?.workflow_id).toBe("auto-deploy-dev.yml");
  });
});
