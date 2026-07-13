import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneDir = join(webDir, ".next", "standalone", "apps", "web");

function fail(message) {
  console.error(`Standalone asset verification failed: ${message}`);
  process.exitCode = 1;
}

function nonEmptyFiles(root, predicate = () => true) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => statSync(file).size > 0);
}

const staticDir = join(standaloneDir, ".next", "static");
const publicDir = join(standaloneDir, "public");
const cssFiles = nonEmptyFiles(staticDir, (name) => name.endsWith(".css"));
const staticFiles = nonEmptyFiles(staticDir, (name) => !name.endsWith(".css"));
const publicFiles = nonEmptyFiles(publicDir);

if (!existsSync(standaloneDir)) fail(`missing standalone directory ${standaloneDir}`);
if (cssFiles.length === 0) fail(`no non-empty CSS file found under ${staticDir}`);
if (staticFiles.length === 0) fail(`no non-empty static asset found under ${staticDir}`);
if (publicFiles.length === 0) fail(`no non-empty public asset found under ${publicDir}`);

if (!process.exitCode) {
  console.log(
    `Verified ${cssFiles.length} CSS file(s), ${staticFiles.length} static asset(s), and ${publicFiles.length} public asset(s).`,
  );
}
