import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const version = (
  process.env.GITHUB_SHA ||
  process.env.H5_ASSET_VERSION ||
  String(Date.now())
).slice(0, 12);

function withAssetVersion(html) {
  return html
    .replace("/assets/styles.css", `/assets/styles.css?v=${version}`)
    .replace("/assets/main.js", `/assets/main.js?v=${version}`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "assets"), { recursive: true });
await writeFile(
  resolve(dist, "index.html"),
  withAssetVersion(readFileSync(resolve(root, "index.html"), "utf8")),
);
await cp(resolve(root, "config.js"), resolve(dist, "config.js"));
await cp(
  resolve(root, "jLSkeG7x43.txt"),
  resolve(dist, "jLSkeG7x43.txt"),
);
await cp(resolve(root, "src/styles.css"), resolve(dist, "assets/styles.css"));
await cp(resolve(root, "src/main.js"), resolve(dist, "assets/main.js"));

console.log(`H5 build completed with asset version ${version}`);
