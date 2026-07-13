import { Unzip, UnzipInflate, unzipSync } from "fflate";

import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

const MAX_ARTIFACT_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_ARTIFACT_JSON_BYTES = 1024 * 1024;
// Keep each inflate callback bounded before the cumulative output guard can abort.
const ZIP_INPUT_CHUNK_BYTES = 256;
const ZIP_OUTPUT_TOO_LARGE = Symbol("ZIP_OUTPUT_TOO_LARGE");
const ZIP_TARGET_DUPLICATED = Symbol("ZIP_TARGET_DUPLICATED");

type GithubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  archive_download_url: string;
};

type DownloadArtifactJsonInput = {
  runId: string;
  artifactName: string;
  fileName: string;
};

export function getGithubConfig() {
  const token = process.env.GITHUB_RELEASE_TOKEN || process.env.GITHUB_TOKEN || "";
  const repository = process.env.GITHUB_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || "LeeFo-china/goose";

  if (!token) {
    throw Errors.business(
      500,
      "缺少 GitHub 发布令牌 GITHUB_RELEASE_TOKEN",
      ErrorCodes.RELEASE_CONFIG_MISSING,
    );
  }

  return {
    token,
    repository,
    apiBase: `https://api.github.com/repos/${repository}`,
    webBase: `https://github.com/${repository}`,
  };
}

export function normalizeGithubError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function githubHeaders(config: ReturnType<typeof getGithubConfig>, init?: RequestInit) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers || {}),
  };
}

function candidateError(statusCode: number, message: string) {
  return Errors.business(statusCode, message, ErrorCodes.RELEASE_CANDIDATE_INVALID);
}

async function fetchGithubJson(config: ReturnType<typeof getGithubConfig>, path: string, init: RequestInit) {
  try {
    return await fetch(`${config.apiBase}${path}`, {
      ...init,
      headers: githubHeaders(config, init),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.business(
      502,
      "GitHub Actions 请求失败",
      ErrorCodes.RELEASE_DISPATCH_FAILED,
    );
  }
}

export async function githubRequest<T>(path: string, init: RequestInit = {}) {
  const config = getGithubConfig();
  const response = await fetchGithubJson(config, path, init);

  if (response.status === 204) return null as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (response.ok) {
      throw Errors.business(
        502,
        "GitHub Actions 返回了无效 JSON",
        ErrorCodes.RELEASE_DISPATCH_FAILED,
      );
    }
    payload = null;
  }
  if (!response.ok) {
    throw Errors.business(
      response.status,
      normalizeGithubError(payload, "GitHub Actions 请求失败"),
      ErrorCodes.RELEASE_DISPATCH_FAILED,
      payload,
    );
  }

  return payload as T;
}

async function fetchGithubBinary(config: ReturnType<typeof getGithubConfig>, path: string) {
  try {
    return await fetch(`${config.apiBase}${path}`, {
      headers: githubHeaders(config),
      redirect: "follow",
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw candidateError(502, "发布证据下载失败");
  }
}

async function readBoundedResponseBody(response: Response) {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > MAX_ARTIFACT_ARCHIVE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw candidateError(413, "发布证据归档过大");
    }
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ARTIFACT_ARCHIVE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw candidateError(413, "发布证据归档过大");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    await reader.cancel().catch(() => undefined);
    throw candidateError(502, "发布证据读取失败");
  } finally {
    reader.releaseLock();
  }

  const archive = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return archive;
}

async function githubBinaryRequest(path: string) {
  const config = getGithubConfig();
  const response = await fetchGithubBinary(config, path);

  if (!response.ok) {
    throw candidateError(response.status, "发布证据下载失败");
  }

  return readBoundedResponseBody(response);
}

function parseGithubArtifacts(payload: unknown): GithubArtifact[] {
  if (!payload || typeof payload !== "object" || !("artifacts" in payload)) {
    throw candidateError(409, "发布证据元数据无效");
  }
  const artifacts = (payload as { artifacts?: unknown }).artifacts;
  if (!Array.isArray(artifacts)) {
    throw candidateError(409, "发布证据元数据无效");
  }

  return artifacts.map((item) => {
    if (!item || typeof item !== "object") {
      throw candidateError(409, "发布证据元数据无效");
    }
    const value = item as Partial<GithubArtifact>;
    if (
      !Number.isSafeInteger(value.id)
      || (value.id ?? 0) <= 0
      || typeof value.name !== "string"
      || !Number.isSafeInteger(value.size_in_bytes)
      || (value.size_in_bytes ?? -1) < 0
      || typeof value.expired !== "boolean"
      || typeof value.archive_download_url !== "string"
    ) {
      throw candidateError(409, "发布证据元数据无效");
    }
    return value as GithubArtifact;
  });
}

function validateArchiveDirectory(archive: Uint8Array, fileName: string) {
  let targetEntries = 0;
  try {
    unzipSync(archive, {
      filter: (entry) => {
        if (entry.name === fileName) targetEntries += 1;
        return false;
      },
    });
  } catch {
    throw candidateError(409, "发布证据归档无效");
  }
  if (targetEntries !== 1) {
    throw candidateError(409, "发布证据文件缺失或重复");
  }
}

function extractBoundedArchiveEntry(archive: Uint8Array, fileName: string) {
  validateArchiveDirectory(archive, fileName);

  const outputChunks: Uint8Array[] = [];
  let outputBytes = 0;
  let targetEntries = 0;
  let isTargetComplete = false;
  const unzipper = new Unzip((file) => {
    if (file.name !== fileName) return;
    targetEntries += 1;
    if (targetEntries !== 1) throw ZIP_TARGET_DUPLICATED;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_ARTIFACT_JSON_BYTES) {
        file.terminate();
        throw ZIP_OUTPUT_TOO_LARGE;
      }
      if (chunk.byteLength) outputChunks.push(chunk.slice());
      if (final) isTargetComplete = true;
    };
    file.start();
  });
  unzipper.register(UnzipInflate);

  try {
    if (!archive.byteLength) unzipper.push(archive, true);
    for (let offset = 0; offset < archive.byteLength; offset += ZIP_INPUT_CHUNK_BYTES) {
      const end = Math.min(offset + ZIP_INPUT_CHUNK_BYTES, archive.byteLength);
      unzipper.push(archive.subarray(offset, end), end === archive.byteLength);
    }
  } catch (error) {
    if (error === ZIP_OUTPUT_TOO_LARGE) {
      throw candidateError(409, "发布证据文件缺失或过大");
    }
    if (error === ZIP_TARGET_DUPLICATED) {
      throw candidateError(409, "发布证据文件缺失或重复");
    }
    throw candidateError(409, "发布证据归档无效");
  }

  if (targetEntries !== 1 || !isTargetComplete) {
    throw candidateError(409, "发布证据文件缺失或损坏");
  }

  const content = new Uint8Array(outputBytes);
  let offset = 0;
  for (const chunk of outputChunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return content;
}

async function downloadArtifactJson<T>({
  runId,
  artifactName,
  fileName,
}: DownloadArtifactJsonInput): Promise<T> {
  const payload = await githubRequest<unknown>(
    `/actions/runs/${encodeURIComponent(runId)}/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`,
  );
  const matches = parseGithubArtifacts(payload)
    .filter((item) => item.name === artifactName && !item.expired);

  if (matches.length !== 1) {
    throw Errors.business(
      409,
      "发布证据缺失、重复或已过期",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  const artifact = matches[0];
  if (!artifact || artifact.size_in_bytes > MAX_ARTIFACT_ARCHIVE_BYTES) {
    throw Errors.business(
      413,
      "发布证据归档过大",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  const archive = await githubBinaryRequest(`/actions/artifacts/${artifact.id}/zip`);
  const content = extractBoundedArchiveEntry(archive, fileName);

  try {
    return JSON.parse(new TextDecoder().decode(content)) as T;
  } catch {
    throw Errors.business(
      409,
      "发布证据 JSON 无效",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }
}

export const githubActionsGateway = {
  request: githubRequest,
  downloadArtifactJson,
  getConfig: getGithubConfig,
};
