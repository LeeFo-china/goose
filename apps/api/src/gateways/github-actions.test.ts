import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { zipSync } from "fflate";

import { githubActionsGateway } from "./github-actions";

const originalFetch = globalThis.fetch;
const originalGithubReleaseToken = process.env.GITHUB_RELEASE_TOKEN;
const originalGithubReleaseRepository = process.env.GITHUB_RELEASE_REPOSITORY;
const encodeJson = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const artifact = (overrides: Record<string, unknown> = {}) => ({
  id: 99,
  name: "production-release-candidate",
  size_in_bytes: 1024,
  expired: false,
  archive_download_url: "https://api.github.com/repos/acme/repo/actions/artifacts/99/zip",
  ...overrides,
});

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function installFetch(responses: Response[]) {
  const fetchMock = mock(async (
    _input: Parameters<typeof fetch>[0],
    _init?: Parameters<typeof fetch>[1],
  ) => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected fetch");
    return response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function expectCandidateInvalid(promise: Promise<unknown>, statusCode: number) {
  await expect(promise).rejects.toMatchObject({
    statusCode,
    code: "RELEASE_CANDIDATE_INVALID",
  });
}

beforeEach(() => {
  process.env.GITHUB_RELEASE_TOKEN = "test-token";
  process.env.GITHUB_RELEASE_REPOSITORY = "acme/repo";
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalGithubReleaseToken === undefined) delete process.env.GITHUB_RELEASE_TOKEN;
  else process.env.GITHUB_RELEASE_TOKEN = originalGithubReleaseToken;
  if (originalGithubReleaseRepository === undefined) delete process.env.GITHUB_RELEASE_REPOSITORY;
  else process.env.GITHUB_RELEASE_REPOSITORY = originalGithubReleaseRepository;
});

describe("githubActionsGateway.downloadArtifactJson", () => {
  test("selects the unique exact non-expired artifact and decodes its JSON file", async () => {
    const archive = zipSync({
      "production-release-candidate.json": encodeJson({ schema_version: 1, build_run_id: 123 }),
    });
    const fetchMock = installFetch([
      jsonResponse({
        artifacts: [
          artifact({ id: 10, name: "production-release-candidate-extra" }),
          artifact({ id: 11, expired: true }),
          artifact(),
        ],
      }),
      new Response(archive),
    ]);

    expect(await githubActionsGateway.downloadArtifactJson<{
      schema_version: number;
      build_run_id: number;
    }>({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    })).toEqual({ schema_version: 1, build_run_id: 123 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/acme/repo/actions/runs/123/artifacts?name=production-release-candidate&per_page=100",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.github.com/repos/acme/repo/actions/artifacts/99/zip",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ redirect: "follow" });
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe("Bearer test-token");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("X-GitHub-Api-Version")).toBe("2022-11-28");
  });

  test("rejects missing artifacts", async () => {
    installFetch([jsonResponse({ artifacts: [] })]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });

  test("rejects expired artifacts", async () => {
    installFetch([jsonResponse({ artifacts: [artifact({ expired: true })] })]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });

  test("rejects duplicate exact artifacts", async () => {
    installFetch([jsonResponse({ artifacts: [artifact(), artifact({ id: 100 })] })]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });

  test("rejects an archive reported larger than five MiB", async () => {
    installFetch([jsonResponse({ artifacts: [artifact({ size_in_bytes: 5 * 1024 * 1024 + 1 })] })]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 413);
  });

  test("rejects a downloaded archive larger than five MiB", async () => {
    installFetch([
      jsonResponse({ artifacts: [artifact()] }),
      new Response(new Uint8Array(5 * 1024 * 1024 + 1)),
    ]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 413);
  });

  test("rejects a JSON entry larger than one MiB", async () => {
    const archive = zipSync({
      "production-release-candidate.json": new Uint8Array(1024 * 1024 + 1),
    });
    installFetch([jsonResponse({ artifacts: [artifact()] }), new Response(archive)]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });

  test("rejects an archive missing the requested file", async () => {
    const archive = zipSync({ "other.json": encodeJson({ ok: true }) });
    installFetch([jsonResponse({ artifacts: [artifact()] }), new Response(archive)]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });

  test("rejects malformed candidate JSON", async () => {
    const archive = zipSync({
      "production-release-candidate.json": new TextEncoder().encode("{not-json"),
    });
    installFetch([jsonResponse({ artifacts: [artifact()] }), new Response(archive)]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });
});

describe("githubActionsGateway.request", () => {
  test("wraps GitHub JSON errors with the release dispatch error code", async () => {
    installFetch([jsonResponse({ message: "workflow unavailable" }, { status: 503 })]);

    await expect(githubActionsGateway.request("/actions/workflows/release-dev.yml/runs"))
      .rejects.toMatchObject({
        statusCode: 503,
        code: "RELEASE_DISPATCH_FAILED",
        message: "workflow unavailable",
        details: { message: "workflow unavailable" },
      });
  });
});
