import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = join(webRoot, "../..");
const summaryPath = join(webRoot, "lighthouse-summary.json");
const baseUrl = (process.env.LIGHTHOUSE_BASE_URL ?? "http://127.0.0.1:3020").replace(/\/+$/u, "");
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

const lockPaths = lockFiles.map((fileName) => join(repositoryRoot, fileName));
const lockHashes = new Map(lockPaths.map((path) => [path, hashFile(path)]));
const routeResults = [];
let failed = false;

for (const route of routes) {
  const samples = [];
  for (let run = 1; run <= route.samples; run += 1) {
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
      console.error(`Lighthouse 执行失败: ${route.path} 第 ${run} 次`);
      process.exit(1);
    }
    samples.push(readMetrics(JSON.parse(readFileSync(reportPath, "utf8"))));
  }
  const metrics = aggregate(samples);
  if (!passes(metrics)) failed = true;
  routeResults.push({ path: route.path, samples: route.samples, ...metrics });
}

const summary = {
  lighthouseVersion: "12.8.2",
  profile: "mobile",
  thresholds,
  routes: routeResults,
};
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const changedLocks = lockPaths.filter((path) => lockHashes.get(path) !== hashFile(path));
if (changedLocks.length > 0) {
  console.error(`Lighthouse 修改了锁文件: ${changedLocks.join(", ")}`);
  failed = true;
}

for (const result of routeResults) console.log(JSON.stringify(result));
if (failed) {
  console.error("Lighthouse 发布质量门失败。");
  process.exitCode = 1;
} else {
  console.log("Lighthouse 发布质量门通过。");
}
