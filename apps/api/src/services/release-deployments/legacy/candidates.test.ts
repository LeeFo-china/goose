import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { zipSync } from "fflate";

import { githubActionsGateway } from "@/gateways/github-actions";
import type { AuthContext } from "@/services/authorization";
import type { GithubCommit, GithubWorkflowRun } from "./types";

const SHA = "b".repeat(40);
const DIGEST = `sha256:${"c".repeat(64)}`;
const AUTH_CONTEXT: AuthContext = {
  authUserId: "user_1",
  employeeId: "emp_1",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "Admin",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
};
const originalFetch = globalThis.fetch;
const originalGithubReleaseToken = process.env.GITHUB_RELEASE_TOKEN;
const originalGithubReleaseRepository = process.env.GITHUB_RELEASE_REPOSITORY;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabasePublish = process.env.SUPABASE_PUBLISH;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let candidates: typeof import("./candidates");

const encodeJson = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function run(overrides: Partial<GithubWorkflowRun & { workflow_id: number }> = {}) {
  return {
    id: 321,
    workflow_id: 999,
    name: "Release Production",
    display_title: "Production build api candidate v2026.07.13.1",
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    head_branch: "v2026.07.13.1",
    head_sha: SHA,
    html_url: "https://github.com/acme/repo/actions/runs/321",
    created_at: "2026-07-13T01:00:00Z",
    updated_at: "2026-07-13T01:10:00Z",
    run_started_at: "2026-07-13T01:01:00Z",
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    build_run_id: 321,
    tag: "v2026.07.13.1",
    commit_sha: SHA,
    requested_services: ["api"],
    build_services: ["api"],
    target_environment: "production",
    build_plan_artifact: "production-build-plan",
    ...overrides,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    workflow_run_id: 321,
    commit_sha: SHA,
    target_environment: "production",
    no_op: false,
    build_services: ["api"],
    deploy_services: ["api"],
    ...overrides,
  };
}

function manifest(service = "api", overrides: Record<string, unknown> = {}) {
  return {
    service,
    image: `registry.example.com/${service}:${SHA}`,
    digest: DIGEST,
    commit_sha: SHA,
    target_environment: "production",
    ...overrides,
  };
}

function artifactMeta(id: number, name: string, expired = false) {
  return {
    id,
    name,
    size_in_bytes: 512,
    expired,
    archive_download_url: `https://api.github.com/repos/acme/repo/actions/artifacts/${id}/zip`,
  };
}

function mockedGateway(overrides: {
  run?: Partial<GithubWorkflowRun & { workflow_id: number }>;
  artifacts?: Record<string, unknown>;
  receiptArtifacts?: unknown[];
  receipt?: Record<string, unknown>;
} = {}) {
  const artifacts: Record<string, unknown> = {
    "production-release-candidate:production-release-candidate.json": candidate(),
    "production-build-plan:build-plan.json": plan(),
    "image-manifest-api:image-manifest-api.json": manifest("api"),
    ...overrides.artifacts,
  };
  const request = mock(async (path: string) => {
    if (path === "/actions/runs/321") return run(overrides.run);
    if (path === "/actions/workflows/999") {
      return { id: 999, path: ".github/workflows/release-production.yml" };
    }
    if (path.startsWith("/actions/artifacts?name=production-deployment-receipt-321")) {
      return { artifacts: overrides.receiptArtifacts || [] };
    }
    if (path === "/actions/workflows/release-production.yml/dispatches") return null;
    throw new Error(`unexpected request ${path}`);
  });
  const downloadArtifactJson = mock(async ({ artifactName, fileName }: {
    artifactName: string;
    fileName: string;
  }) => {
    const key = `${artifactName}:${fileName}`;
    if (!(key in artifacts)) {
      throw Object.assign(new Error("missing artifact"), {
        statusCode: 409,
        code: "RELEASE_CANDIDATE_INVALID",
      });
    }
    return artifacts[key];
  });
  const downloadArtifactJsonById = mock(async () => ({
    schema_version: 1,
    build_run_id: 321,
    deploy_run_id: 654,
    tag: "v2026.07.13.1",
    commit_sha: SHA,
    services: ["api"],
    completed_at: "2026-07-13T02:00:00Z",
    ...overrides.receipt,
  }));
  return { request, downloadArtifactJson, downloadArtifactJsonById };
}

function context(gateway: unknown = mockedGateway(), extras: Record<string, unknown> = {}) {
  return {
    githubActionsGateway: gateway,
    getProductionCandidate: candidates?.getProductionCandidate,
    resolveCommit: mock(async (): Promise<GithubCommit> => ({ sha: SHA })),
    assertWorkflowIdle: mock(async () => undefined),
    findRecentRun: mock(async () => null),
    ...extras,
  };
}

beforeAll(async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_PUBLISH = process.env.SUPABASE_PUBLISH || "test-publish";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role";
  process.env.GITHUB_RELEASE_TOKEN = "test-token";
  process.env.GITHUB_RELEASE_REPOSITORY = "acme/repo";
  candidates = await import("./candidates");
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalGithubReleaseToken === undefined) delete process.env.GITHUB_RELEASE_TOKEN;
  else process.env.GITHUB_RELEASE_TOKEN = originalGithubReleaseToken;
  if (originalGithubReleaseRepository === undefined) delete process.env.GITHUB_RELEASE_REPOSITORY;
  else process.env.GITHUB_RELEASE_REPOSITORY = originalGithubReleaseRepository;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabasePublish === undefined) delete process.env.SUPABASE_PUBLISH;
  else process.env.SUPABASE_PUBLISH = originalSupabasePublish;
  if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
});

describe("getProductionCandidate", () => {
  test("validates a successful production candidate with real ZIP artifact parsing", async () => {
    const fetchMock = mock(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/actions/runs/321")) return jsonResponse(run());
      if (url.endsWith("/actions/workflows/999")) {
        return jsonResponse({ id: 999, path: ".github/workflows/release-production.yml" });
      }
      if (url.includes("/actions/runs/321/artifacts?name=production-release-candidate")) {
        return jsonResponse({ artifacts: [artifactMeta(1, "production-release-candidate")] });
      }
      if (url.endsWith("/actions/artifacts/1/zip")) {
        return new Response(zipSync({ "production-release-candidate.json": encodeJson(candidate()) }));
      }
      if (url.includes("/actions/runs/321/artifacts?name=production-build-plan")) {
        return jsonResponse({ artifacts: [artifactMeta(2, "production-build-plan")] });
      }
      if (url.endsWith("/actions/artifacts/2/zip")) {
        return new Response(zipSync({ "build-plan.json": encodeJson(plan()) }));
      }
      if (url.includes("/actions/runs/321/artifacts?name=image-manifest-api")) {
        return jsonResponse({ artifacts: [artifactMeta(3, "image-manifest-api")] });
      }
      if (url.endsWith("/actions/artifacts/3/zip")) {
        return new Response(zipSync({ "image-manifest-api.json": encodeJson(manifest("api")) }));
      }
      if (url.includes("/actions/artifacts?name=production-deployment-receipt-321")) {
        return jsonResponse({ artifacts: [] });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await candidates.getProductionCandidate.call(
      context(githubActionsGateway),
      "321",
    );

    expect(result).toMatchObject({
      build_run_id: "321",
      tag: "v2026.07.13.1",
      commit_sha: SHA,
      services: ["api"],
      build_services: ["api"],
      target_environment: "production",
      manifest_verified: true,
      ready_to_deploy: true,
      already_deployed: false,
      blocked_reason: null,
      run_url: "https://github.com/acme/repo/actions/runs/321",
      created_at: "2026-07-13T01:00:00Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  test("rejects missing candidate artifacts as invalid evidence", async () => {
    const gateway = mockedGateway({
      artifacts: {
        "production-release-candidate:production-release-candidate.json": undefined,
      },
    });
    await expect(candidates.getProductionCandidate.call(context(gateway), "321"))
      .rejects.toMatchObject({ code: "RELEASE_CANDIDATE_INVALID" });
  });

  test("rejects failed or in-progress build runs as not ready", async () => {
    await expect(candidates.getProductionCandidate.call(context(mockedGateway({
      run: { conclusion: "failure" },
    })), "321")).rejects.toMatchObject({ code: "RELEASE_CANDIDATE_NOT_READY" });
    await expect(candidates.getProductionCandidate.call(context(mockedGateway({
      run: { status: "in_progress", conclusion: null },
    })), "321")).rejects.toMatchObject({ code: "RELEASE_CANDIDATE_NOT_READY" });
  });

  test("returns an already-deployed readable state for an existing receipt", async () => {
    const gateway = mockedGateway({
      receiptArtifacts: [artifactMeta(10, "production-deployment-receipt-321")],
    });
    const result = await candidates.getProductionCandidate.call(context(gateway), "321");

    expect(result.already_deployed).toBe(true);
    expect(result.ready_to_deploy).toBe(false);
    expect(result.blocked_reason).toContain("已部署");
    expect(gateway.downloadArtifactJsonById).toHaveBeenCalledWith({
      artifactId: 10,
      fileName: "production-deployment-receipt.json",
    });
  });
});

describe("dispatchProductionCandidate", () => {
  test("rejects client service choices that differ from candidate evidence", async () => {
    const gateway = mockedGateway();
    await expect(candidates.dispatchProductionCandidate.call(
      context(gateway),
      AUTH_CONTEXT,
      "321",
      { services: ["admin"], confirm_text: "确认部署生产环境" },
    )).rejects.toMatchObject({ code: "RELEASE_CANDIDATE_INVALID" });
  });

  test("rejects an already deployed candidate", async () => {
    const gateway = mockedGateway({
      receiptArtifacts: [artifactMeta(10, "production-deployment-receipt-321")],
    });
    await expect(candidates.dispatchProductionCandidate.call(
      context(gateway),
      AUTH_CONTEXT,
      "321",
      { services: ["api"], confirm_text: "确认部署生产环境" },
    )).rejects.toMatchObject({ code: "RELEASE_CANDIDATE_ALREADY_DEPLOYED" });
  });

  test("dispatches deploy with server-verified tag, SHA, build run, services, confirmation, reason and audit", async () => {
    const gateway = mockedGateway();
    const audit = mock(async (_payload: { metadata?: Record<string, unknown> }) => undefined);
    const ctx = context(gateway, { recordAudit: audit });

    const result = await candidates.dispatchProductionCandidate.call(
      ctx,
      AUTH_CONTEXT,
      "321",
      {
        services: ["api"],
        confirm_text: "确认部署生产环境",
        reason: "灰度完成",
      },
    );

    expect(gateway.request).toHaveBeenCalledWith(
      "/actions/workflows/release-production.yml/dispatches",
      {
        method: "POST",
        body: JSON.stringify({
          ref: "v2026.07.13.1",
          inputs: {
            operation: "deploy",
            service: "api",
            build_run_id: "321",
            commit_sha: SHA,
            confirm_text: "确认部署生产环境",
            reason: "灰度完成",
          },
        }),
      },
    );
    expect(audit.mock.calls[0]?.[0]?.metadata).toMatchObject({
      stage: "deploy",
      build_run_id: "321",
    });
    expect(result).toMatchObject({
      stage: "deploy",
      ref: "v2026.07.13.1",
      services: ["api"],
      workflow_id: "release-production.yml",
    });
  });
});
