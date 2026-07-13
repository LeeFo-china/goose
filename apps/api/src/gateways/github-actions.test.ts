import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { zipSync } from "fflate";

import { Errors } from "@/errors/error-factory";

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

function installFetch(responses: Array<Response | Error>) {
  const fetchMock = mock(async (
    _input: Parameters<typeof fetch>[0],
    _init?: Parameters<typeof fetch>[1],
  ) => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected fetch");
    if (response instanceof Error) throw response;
    return response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function forgeCentralDirectoryUncompressedSize(archive: Uint8Array, size: number) {
  const forged = archive.slice();
  const view = new DataView(forged.buffer, forged.byteOffset, forged.byteLength);
  for (let offset = 0; offset <= forged.byteLength - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    view.setUint32(offset + 24, size, true);
  }
  return forged;
}

function replaceArchiveEntryName(archive: Uint8Array, from: string, to: string) {
  if (from.length !== to.length) throw new Error("entry names must have equal lengths");
  const renamed = archive.slice();
  const source = new TextEncoder().encode(from);
  const replacement = new TextEncoder().encode(to);
  for (let offset = 0; offset <= renamed.byteLength - source.byteLength; offset += 1) {
    if (!source.every((byte, index) => renamed[offset + index] === byte)) continue;
    renamed.set(replacement, offset);
    offset += source.byteLength - 1;
  }
  return renamed;
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
      "ignored.bin": new Uint8Array(2 * 1024 * 1024),
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

  test("rejects actual output larger than one MiB when the central directory understates it", async () => {
    const expanded = new Uint8Array(32 * 1024 * 1024).fill(0x20);
    expanded[0] = 0x7b;
    expanded[1] = 0x7d;
    const archive = forgeCentralDirectoryUncompressedSize(zipSync({
      "production-release-candidate.json": expanded,
    }), 2);
    installFetch([
      jsonResponse({ artifacts: [artifact({ size_in_bytes: archive.byteLength })] }),
      new Response(archive),
    ]);

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

  test("rejects duplicate target entries in the archive", async () => {
    const archive = replaceArchiveEntryName(zipSync({
      "production-release-candidate.json": encodeJson({ schema_version: 1 }),
      "xroduction-release-candidate.json": encodeJson({ schema_version: 1 }),
    }), "xroduction-release-candidate.json", "production-release-candidate.json");
    installFetch([
      jsonResponse({ artifacts: [artifact({ size_in_bytes: archive.byteLength })] }),
      new Response(archive),
    ]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });

  test("rejects a structurally damaged ZIP archive", async () => {
    installFetch([
      jsonResponse({ artifacts: [artifact({ size_in_bytes: 4 })] }),
      new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
    ]);
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

  test("rejects a malformed artifact collection", async () => {
    installFetch([jsonResponse({ artifacts: "not-an-array" })]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 409);
  });

  test("rejects unsafe artifact IDs and sizes before downloading", async () => {
    for (const invalidArtifact of [
      artifact({ id: 0 }),
      artifact({ id: Number.MAX_SAFE_INTEGER + 1 }),
      artifact({ size_in_bytes: -1 }),
      artifact({ size_in_bytes: Number.NaN }),
    ]) {
      installFetch([jsonResponse({ artifacts: [invalidArtifact] })]);
      await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
        runId: "123",
        artifactName: "production-release-candidate",
        fileName: "production-release-candidate.json",
      }), 409);
    }
  });

  test("wraps binary fetch network failures as invalid candidate evidence", async () => {
    installFetch([
      jsonResponse({ artifacts: [artifact()] }),
      new Error("network down"),
    ]);
    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 502);
  });

  test("rejects an oversized Content-Length before reading the body", async () => {
    let wasPulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        wasPulled = true;
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    }, { highWaterMark: 0 });
    installFetch([
      jsonResponse({ artifacts: [artifact()] }),
      new Response(body, { headers: { "Content-Length": String(5 * 1024 * 1024 + 1) } }),
    ]);

    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 413);
    expect(wasPulled).toBe(false);
  });

  test("cancels the binary stream as soon as cumulative bytes exceed five MiB", async () => {
    let pulls = 0;
    let wasCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 3) controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        else controller.close();
      },
      cancel() {
        wasCancelled = true;
      },
    }, { highWaterMark: 0 });
    installFetch([
      jsonResponse({ artifacts: [artifact()] }),
      new Response(body),
    ]);

    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 413);
    expect(wasCancelled).toBe(true);
    expect(pulls).toBe(2);
  });

  test("wraps binary stream read failures as invalid candidate evidence", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("read failed"));
      },
    });
    installFetch([
      jsonResponse({ artifacts: [artifact()] }),
      new Response(body),
    ]);

    await expectCandidateInvalid(githubActionsGateway.downloadArtifactJson({
      runId: "123",
      artifactName: "production-release-candidate",
      fileName: "production-release-candidate.json",
    }), 502);
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

  test("wraps fetch network failures with the release dispatch error code", async () => {
    installFetch([new Error("network down")]);

    await expect(githubActionsGateway.request("/actions/workflows/release-dev.yml/runs"))
      .rejects.toMatchObject({
        statusCode: 502,
        code: "RELEASE_DISPATCH_FAILED",
      });
  });

  test("wraps malformed successful JSON with the release dispatch error code", async () => {
    installFetch([new Response("{", { status: 200 })]);

    await expect(githubActionsGateway.request("/actions/workflows/release-dev.yml/runs"))
      .rejects.toMatchObject({
        statusCode: 502,
        code: "RELEASE_DISPATCH_FAILED",
      });
  });

  test("preserves AppError instances thrown by fetch", async () => {
    const originalError = Errors.business(429, "rate limited", "RATE_LIMITED");
    installFetch([originalError]);

    try {
      await githubActionsGateway.request("/actions/workflows/release-dev.yml/runs");
      throw new Error("expected request to fail");
    } catch (error) {
      expect(error).toBe(originalError);
    }
  });
});
