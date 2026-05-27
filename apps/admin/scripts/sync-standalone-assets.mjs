import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const adminDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneAdminDir = join(adminDir, ".next", "standalone", "apps", "admin");

const copies = [
  {
    from: join(adminDir, ".next", "static"),
    to: join(standaloneAdminDir, ".next", "static"),
  },
  {
    from: join(adminDir, "public"),
    to: join(standaloneAdminDir, "public"),
  },
];

for (const { from, to } of copies) {
  if (!existsSync(from) || !existsSync(standaloneAdminDir)) {
    continue;
  }

  rmSync(to, { force: true, recursive: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}
