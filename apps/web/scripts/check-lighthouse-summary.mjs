import { readFileSync } from "node:fs";
import { join } from "node:path";

import { computeReleaseQualityDigests, webRoot } from "./release-quality-digest.mjs";

const summary = JSON.parse(readFileSync(join(webRoot, "lighthouse-summary.json"), "utf8"));
const expectedPaths = [
  "/",
  "/partners",
  "/articles/e2e-article",
  "/cases/e2e-case",
  "/cities/shanghai",
];
const expectedThresholds = {
  performance: 85,
  accessibility: 95,
  seo: 95,
  lcpMs: 2_500,
  tbtMs: 200,
  cls: 0.1,
};
const currentDigests = computeReleaseQualityDigests();
const thresholds = summary.thresholds ?? {};
const routes = Array.isArray(summary.routes) ? summary.routes : [];
const failures = [];

if (summary.lighthouseVersion !== "12.8.2" || summary.profile !== "mobile") {
  failures.push("Lighthouse 版本或 profile 不正确");
}
if (summary.baseUrl !== "http://127.0.0.1:3020") failures.push("Lighthouse baseUrl 不正确");
if (!Number.isFinite(Date.parse(summary.generatedAt))) failures.push("Lighthouse generatedAt 不正确");
if (!summary.buildId) failures.push("Lighthouse buildId 缺失");
if (summary.sourceDigest !== currentDigests.sourceDigest) failures.push("Lighthouse 源码摘要已过期");
if (summary.fixtureDigest !== currentDigests.fixtureDigest) failures.push("Lighthouse fixture 摘要已过期");
if (summary.revision !== summary.sourceDigest) failures.push("Lighthouse 运行 revision 与源码摘要不一致");
if (JSON.stringify(thresholds) !== JSON.stringify(expectedThresholds)) {
  failures.push("Lighthouse 阈值不正确");
}
if (JSON.stringify(routes.map((route) => route.path)) !== JSON.stringify(expectedPaths)) {
  failures.push("Lighthouse 路径集合不完整或顺序错误");
}
for (const route of routes) {
  const values = [
    route.samples,
    route.performance,
    route.accessibility,
    route.seo,
    route.lcpMs,
    route.tbtMs,
    route.cls,
  ];
  if (!values.every((value) => Number.isFinite(value))) {
    failures.push(`${route.path ?? "unknown"} 指标不完整`);
    continue;
  }
  if (route.performance < thresholds.performance) failures.push(`${route.path} performance 未过门`);
  if (route.accessibility < thresholds.accessibility) failures.push(`${route.path} accessibility 未过门`);
  if (route.seo < thresholds.seo) failures.push(`${route.path} seo 未过门`);
  if (route.lcpMs > thresholds.lcpMs) failures.push(`${route.path} LCP 未过门`);
  if (route.tbtMs > thresholds.tbtMs) failures.push(`${route.path} TBT 未过门`);
  if (route.cls > thresholds.cls) failures.push(`${route.path} CLS 未过门`);
}
if (routes.find((route) => route.path === "/cities/shanghai")?.samples < 3) {
  failures.push("城市页缺少三次稳定性样本");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log("Lighthouse summary check passed.");
}
