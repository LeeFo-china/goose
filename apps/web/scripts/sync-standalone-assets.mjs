import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneWebDir = join(webDir, ".next", "standalone", "apps", "web");

const copies = [
  {
    from: join(webDir, ".next", "static"),
    to: join(standaloneWebDir, ".next", "static"),
  },
  {
    from: join(webDir, "public"),
    to: join(standaloneWebDir, "public"),
  },
];

for (const { from, to } of copies) {
  if (!existsSync(from) || !existsSync(standaloneWebDir)) {
    continue;
  }

  rmSync(to, { force: true, recursive: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}
