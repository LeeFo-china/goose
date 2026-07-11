import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneWebDir = join(webDir, ".next", "standalone", "apps", "web");
const staticDir = join(webDir, ".next", "static");

if (!existsSync(standaloneWebDir)) {
  throw new Error(`Missing required standalone output: ${standaloneWebDir}`);
}

if (!existsSync(staticDir)) {
  throw new Error(`Missing required static assets: ${staticDir}`);
}

const copyDirectory = (from, to) => {
  rmSync(to, { force: true, recursive: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
};

copyDirectory(staticDir, join(standaloneWebDir, ".next", "static"));

const publicDir = join(webDir, "public");
if (existsSync(publicDir)) {
  copyDirectory(publicDir, join(standaloneWebDir, "public"));
}
