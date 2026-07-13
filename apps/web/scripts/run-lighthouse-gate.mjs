import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeReleaseQualityDigests,
  repositoryRoot,
  webRoot,
} from "./release-quality-digest.mjs";

const summaryPath = join(webRoot, "lighthouse-summary.json");
const baseUrl = "http://127.0.0.1:3020";
const chromePath = process.env.LIGHTHOUSE_CHROME_PATH?.trim();
const cityRuns = 3;
const thresholds = {
  performance: 85,
  accessibility: 95,
  seo: 95,
  lcpMs: 2_500,
  tbtMs: 200,
  cls: 0.1,
};
const routes = [
  { name: "home", path: "/", samples: 1 },
  { name: "partners", path: "/partners", samples: 1 },
  { name: "article", path: "/articles/e2e-article", samples: 1 },
  { name: "case", path: "/cases/e2e-case", samples: 1 },
  { name: "city", path: "/cities/shanghai", samples: cityRuns },
];
const lockFiles = ["pnpm-lock.yaml", "bun.lock"];
const children = [];

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function score(category) {
  return Math.round((category?.score ?? 0) * 100);
}

function readMetrics(report) {
  return {
    performance: score(report.categories.performance),
    accessibility: score(report.categories.accessibility),
    seo: score(report.categories.seo),
    lcpMs: Math.round(report.audits["largest-contentful-paint"].numericValue),
    tbtMs: Math.round(report.audits["total-blocking-time"].numericValue),
    cls: Number(report.audits["cumulative-layout-shift"].numericValue.toFixed(4)),
  };
}

function aggregate(samples) {
  return samples.reduce((result, sample) => ({
    performance: Math.min(result.performance, sample.performance),
    accessibility: Math.min(result.accessibility, sample.accessibility),
    seo: Math.min(result.seo, sample.seo),
    lcpMs: Math.max(result.lcpMs, sample.lcpMs),
    tbtMs: Math.max(result.tbtMs, sample.tbtMs),
    cls: Math.max(result.cls, sample.cls),
  }));
}

function passes(metrics) {
  return metrics.performance >= thresholds.performance
    && metrics.accessibility >= thresholds.accessibility
    && metrics.seo >= thresholds.seo
    && metrics.lcpMs <= thresholds.lcpMs
    && metrics.tbtMs <= thresholds.tbtMs
    && metrics.cls <= thresholds.cls;
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`端口 ${port} 已被占用，请停止已有服务后重试。`)));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: webRoot,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
  children.push(child);
  return child;
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return response;
    } catch {
      // 服务启动期间连接失败属于预期重试路径。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待服务超时: ${url}`);
}

function stopChildren() {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
}

function runLighthouse(route, run) {
  const reportPath = join(tmpdir(), `gooes-lighthouse-${route.name}-${run}.json`);
  const args = [
    "dlx",
    "lighthouse@12.8.2",
    `${baseUrl}${route.path}`,
    "--output=json",
    `--output-path=${reportPath}`,
    "--only-categories=performance,accessibility,seo",
    "--form-factor=mobile",
    "--chrome-flags=--headless --no-sandbox",
    "--quiet",
  ];
  if (chromePath) args.push(`--chrome-path=${chromePath}`);
  const result = spawnSync("pnpm", args, { cwd: repositoryRoot, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    throw new Error(`Lighthouse 执行失败: ${route.path} 第 ${run} 次`);
  }
  return readMetrics(JSON.parse(readFileSync(reportPath, "utf8")));
}

async function main() {
  await Promise.all([assertPortAvailable(3020), assertPortAvailable(3900)]);
  const lockPaths = lockFiles.map((fileName) => join(repositoryRoot, fileName));
  const lockHashes = new Map(lockPaths.map((path) => [path, hashFile(path)]));
  const digests = computeReleaseQualityDigests();
  const environment = {
    ...process.env,
    GOOES_API_BASE_URL: "http://127.0.0.1:3900",
    GOOES_BUILD_SHA: digests.sourceDigest,
    GOOES_WEB_PROXY_SHARED_SECRET: "e2e-shared-secret",
    GOOES_PREVIEW_SHARED_SECRET: "e2e-preview-shared-secret-that-is-long",
    GOOES_PREVIEW_SESSION_SECRET: "e2e-preview-session-secret-that-is-long",
  };

  rmSync(join(webRoot, ".next"), { force: true, recursive: true });
  startProcess("node", ["e2e/upstream-stub.mjs"]);
  await waitForUrl("http://127.0.0.1:3900");

  const build = spawnSync("pnpm", ["run", "build"], {
    cwd: webRoot,
    env: environment,
    stdio: "inherit",
  });
  if (build.error || build.status !== 0) throw new Error("Lighthouse production 构建失败。");

  const buildId = readFileSync(join(webRoot, ".next/BUILD_ID"), "utf8").trim();
  startProcess("node", [".next/standalone/apps/web/server.js"], { env: { ...environment, PORT: "3020", HOSTNAME: "127.0.0.1" } });
  const health = await waitForUrl(baseUrl);
  const revision = health.headers.get("x-gooes-revision");
  if (revision !== digests.sourceDigest) {
    throw new Error(`运行 revision 与源码摘要不一致: ${revision ?? "missing"}`);
  }

  const routeResults = [];
  let failed = false;
  for (const route of routes) {
    const samples = [];
    for (let run = 1; run <= route.samples; run += 1) samples.push(runLighthouse(route, run));
    const metrics = aggregate(samples);
    if (!passes(metrics)) failed = true;
    routeResults.push({ path: route.path, samples: route.samples, ...metrics });
  }

  const changedLocks = lockPaths.filter((path) => lockHashes.get(path) !== hashFile(path));
  if (changedLocks.length > 0) {
    throw new Error(`Lighthouse 修改了锁文件: ${changedLocks.join(", ")}`);
  }

  writeFileSync(summaryPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    ...digests,
    buildId,
    revision,
    lighthouseVersion: "12.8.2",
    profile: "mobile",
    thresholds,
    routes: routeResults,
  }, null, 2)}\n`);

  for (const result of routeResults) console.log(JSON.stringify(result));
  if (failed) throw new Error("Lighthouse 发布质量门失败。");
  console.log("Lighthouse 发布质量门通过。");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopChildren();
}
