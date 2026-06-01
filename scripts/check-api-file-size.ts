import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const THRESHOLD = 500;
const API_ROOT = "apps/api";
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);
const INCLUDED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const EXEMPTIONS = new Map<string, string>([
  ["apps/api/src/types/database.ts", "generated Supabase database types"],
  ["apps/api/src/services/system-settings/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/billing/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/projects/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/marketing-pages/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/services/marketing-pages/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/project-cameras/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/release-deployments/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/permissions/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/services/social-video-transcriptions/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/employee-project-detail-bootstrap/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/expense-requests/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/billing/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/projects/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/services/social-video-scripts/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/project-cameras/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/project-acceptances/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/customer-project-log-share-campaigns/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/platform-tenants/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/services/marketing-page-ai/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/files/platform-file-storage/legacy-service.ts", "legacy storage implementation tracked in large-file governance plan"],
  ["apps/api/src/scripts/storage-migration-dry-run/legacy-script.ts", "legacy migration script tracked in large-file governance plan"],
  ["apps/api/src/services/construction-stage-status/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/wechat-customer-identities/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/repositories/tenant-devices/legacy-repository.ts", "legacy repository implementation tracked in large-file governance plan"],
  ["apps/api/src/services/sms/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/gateways/tencent-iot-video.ts", "third-party gateway implementation isolated from service layer and tracked for future split"],
  ["apps/api/src/services/tenant-devices/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/usage/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/wechat-rebind-requests/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/task-center/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/customer-service-tickets/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/plugins/auth/legacy-plugin.ts", "legacy auth plugin implementation tracked in large-file governance plan"],
  ["apps/api/src/scripts/storage-migration-upload/legacy-script.ts", "legacy migration script tracked in large-file governance plan"],
  ["apps/api/src/services/customer-core/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/services/authorization/legacy-service.ts", "legacy facade implementation tracked in large-file governance plan"],
  ["apps/api/src/scripts/storage-migration-final-verify/legacy-script.ts", "legacy migration script tracked in large-file governance plan"],
]);

function getRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(join(cwd, API_ROOT))) {
    return cwd;
  }

  return resolve(cwd, "../..");
}

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}

function getExtension(path: string) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] || "";
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...await collectFiles(join(dir, entry.name)));
      continue;
    }

    if (entry.isFile() && INCLUDED_EXTENSIONS.has(getExtension(entry.name))) {
      files.push(join(dir, entry.name));
    }
  }

  return files;
}

function countLines(content: string) {
  if (!content) {
    return 0;
  }

  const newlineCount = content.match(/\n/g)?.length || 0;
  return content.endsWith("\n") ? newlineCount : newlineCount + 1;
}

const repoRoot = getRepoRoot();
const apiRoot = join(repoRoot, API_ROOT);
const files = await collectFiles(apiRoot);
const violations: Array<{ lines: number; path: string }> = [];
const oversizedExemptions: Array<{ lines: number; path: string; reason: string }> = [];

for (const file of files) {
  const relativePath = toPosixPath(relative(repoRoot, file));
  const lines = countLines(await readFile(file, "utf8"));

  if (lines < THRESHOLD) {
    continue;
  }

  const exemption = EXEMPTIONS.get(relativePath);
  if (exemption) {
    oversizedExemptions.push({ lines, path: relativePath, reason: exemption });
    continue;
  }

  violations.push({ lines, path: relativePath });
}

violations.sort((left, right) => right.lines - left.lines);
oversizedExemptions.sort((left, right) => right.lines - left.lines);

if (oversizedExemptions.length > 0) {
  console.log("Exempt oversized API files:");
  for (const item of oversizedExemptions) {
    console.log(`${item.lines} ${item.path} - ${item.reason}`);
  }
}

if (violations.length > 0) {
  console.error("Non-exempt oversized API files:");
  for (const item of violations) {
    console.error(`${item.lines} ${item.path}`);
  }
  process.exit(1);
}

console.log(`API file size check passed. threshold=${THRESHOLD}, exemptions=${oversizedExemptions.length}`);
