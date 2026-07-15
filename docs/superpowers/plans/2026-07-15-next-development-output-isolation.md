# Next.js Development Output Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Next.js development servers write to `.next-dev` while production builds and standalone startup continue using `.next`.

**Architecture:** Each app's `next.config.ts` becomes a phase-aware configuration factory. Development selects `NEXT_DIST_DIR` or `.next-dev`, preserving admin E2E's `.next-e2e` override; every non-development phase is pinned to `.next` so a leaked environment variable cannot redirect production output.

**Tech Stack:** Bun tests, TypeScript, Next.js 15.5.20, pnpm workspace scripts

---

## File map

- `apps/admin/next.config.ts`: Owns admin development/production output selection.
- `apps/web/next.config.ts`: Owns website development/production output selection.
- `apps/admin/tests/next-output-isolation.test.ts`: Exercises the admin config for default development, E2E override, and production pinning.
- `apps/web/tests/release-quality-contract.test.ts`: Extends the existing website release contract with the same output rules while retaining production E2E checks.
- `apps/admin/tsconfig.json`: Predeclares generated type directories so Next does not append them during normal runs.
- `apps/web/tsconfig.json`: Predeclares website development generated types.
- `apps/admin/scripts/check-file-size.mjs`: Excludes all Next output directories from recursive source-size checks.
- `scripts/check-file-size.ts`: Excludes all admin Next output directories from staged source detection.
- `.gitignore`: Ignores `.next-dev` for every app.

### Task 1: Add failing output-directory contracts

**Files:**
- Create: `apps/admin/tests/next-output-isolation.test.ts`
- Modify: `apps/web/tests/release-quality-contract.test.ts`

- [ ] **Step 1: Write the admin configuration contract**

Create `apps/admin/tests/next-output-isolation.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

import createNextConfig from "../next.config";

describe("admin Next output isolation", () => {
  test("separates normal development, E2E, and production outputs", () => {
    const previousDistDir = process.env.NEXT_DIST_DIR;

    try {
      delete process.env.NEXT_DIST_DIR;
      expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");

      process.env.NEXT_DIST_DIR = ".next-e2e";
      expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-e2e");
      expect(createNextConfig(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
    } finally {
      if (previousDistDir === undefined) {
        delete process.env.NEXT_DIST_DIR;
      } else {
        process.env.NEXT_DIST_DIR = previousDistDir;
      }
    }
  });
});
```

- [ ] **Step 2: Extend the website release contract**

Add imports to `apps/web/tests/release-quality-contract.test.ts`:

```ts
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

import createNextConfig from "../next.config";
```

Add this test inside the existing `describe` block:

```ts
test("separates development and production Next outputs", () => {
  const previousDistDir = process.env.NEXT_DIST_DIR;

  try {
    delete process.env.NEXT_DIST_DIR;
    expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");

    process.env.NEXT_DIST_DIR = ".next-custom";
    expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-custom");
    expect(createNextConfig(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
  } finally {
    if (previousDistDir === undefined) {
      delete process.env.NEXT_DIST_DIR;
    } else {
      process.env.NEXT_DIST_DIR = previousDistDir;
    }
  }
});
```

In the existing `isolates E2E data cache from local and production builds` test, remove only these obsolete assertions:

```ts
expect(nextConfig).not.toContain("distDir");
expect(nextConfig).not.toContain("GOOES_WEB_DIST_DIR");
```

Keep the Playwright runner assertions unchanged.

- [ ] **Step 3: Run the contracts and verify they fail for the current object exports**

Run:

```bash
bun test apps/admin/tests/next-output-isolation.test.ts apps/web/tests/release-quality-contract.test.ts
```

Expected: FAIL because both current default exports are configuration objects rather than callable phase-aware factories.

- [ ] **Step 4: Commit the red tests**

```bash
git add apps/admin/tests/next-output-isolation.test.ts apps/web/tests/release-quality-contract.test.ts
git commit -m "test(next): 覆盖开发产物隔离规则"
```

### Task 2: Implement phase-aware output selection

**Files:**
- Modify: `apps/admin/next.config.ts`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Convert the admin config to a phase-aware factory**

Replace `apps/admin/next.config.ts` with:

```ts
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const createNextConfig = (phase: string): NextConfig => ({
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER
      ? process.env.NEXT_DIST_DIR ?? ".next-dev"
      : ".next",
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: join(appDir, "../.."),
});

export default createNextConfig;
```

- [ ] **Step 2: Convert the website config without changing its headers**

Replace `apps/web/next.config.ts` with this phase-aware equivalent:

```ts
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const buildRevision = process.env.GOOES_BUILD_SHA ?? "unknown";

const createNextConfig = (phase: string): NextConfig => ({
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER
      ? process.env.NEXT_DIST_DIR ?? ".next-dev"
      : ".next",
  // SEO 稳定性优先：等待动态 metadata 后再输出 HTML，避免普通 Chrome/Lighthouse 把标签放进 body。
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: join(appDir, "../.."),
  async headers() {
    return [
      {
        source: "/preview-error",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Gooes-Service", value: "web" },
          { key: "X-Gooes-Revision", value: buildRevision },
        ],
      },
    ];
  },
});

export default createNextConfig;
```

- [ ] **Step 3: Run the focused contracts and verify green**

Run:

```bash
bun test apps/admin/tests/next-output-isolation.test.ts apps/web/tests/release-quality-contract.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 4: Commit the configuration fix**

```bash
git add apps/admin/next.config.ts apps/web/next.config.ts
git commit -m "fix(next): 隔离开发与生产构建产物"
```

### Task 3: Align ignored paths and generated type inputs

**Files:**
- Modify: `.gitignore`
- Modify: `apps/admin/tsconfig.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/admin/scripts/check-file-size.mjs`
- Modify: `scripts/check-file-size.ts`
- Modify: `apps/admin/tests/next-output-isolation.test.ts`

- [ ] **Step 1: Extend the admin contract for repository guards**

Add imports and a second test to `apps/admin/tests/next-output-isolation.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("keeps development outputs out of Git and source-size scans", () => {
  const repoRoot = join(import.meta.dir, "../../..");
  const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
  const packageScanner = readFileSync(
    join(repoRoot, "apps/admin/scripts/check-file-size.mjs"),
    "utf8",
  );
  const rootScanner = readFileSync(join(repoRoot, "scripts/check-file-size.ts"), "utf8");

  expect(gitignore).toContain("apps/*/.next-dev");
  expect(packageScanner).toContain('".next-dev"');
  expect(packageScanner).toContain('".next-e2e"');
  expect(rootScanner).toContain("\\.next-dev");
  expect(rootScanner).toContain("\\.next-e2e");
});
```

- [ ] **Step 2: Run the new guard test and verify red**

Run:

```bash
bun test apps/admin/tests/next-output-isolation.test.ts
```

Expected: FAIL because `.next-dev` is not ignored and the scanners do not exclude it.

- [ ] **Step 3: Add generated directories to repository configuration**

Make these exact changes:

```gitignore
.next
apps/*/.next
apps/*/.next-dev
apps/*/.next-e2e
```

Use this `include` value in `apps/admin/tsconfig.json`:

```json
[
  "next-env.d.ts",
  "**/*.ts",
  "**/*.tsx",
  ".next/types/**/*.ts",
  ".next-dev/types/**/*.ts",
  ".next-e2e/types/**/*.ts"
]
```

Use this `include` value in `apps/web/tsconfig.json`:

```json
[
  "next-env.d.ts",
  "**/*.ts",
  "**/*.tsx",
  ".next/types/**/*.ts",
  ".next-dev/types/**/*.ts"
]
```

Use these exact scanner declarations:

```js
const EXCLUDED_DIRS = new Set([
  ".next",
  ".next-dev",
  ".next-e2e",
  "dist",
  "node_modules",
]);
```

```ts
const ADMIN_EXCLUDED_RE =
  /^apps\/admin\/(\.next|\.next-dev|\.next-e2e|dist|node_modules)\//;
```

- [ ] **Step 4: Run guards, type checks, and file-size checks**

Run:

```bash
bun test apps/admin/tests/next-output-isolation.test.ts apps/web/tests/release-quality-contract.test.ts
pnpm --dir apps/admin run typecheck
pnpm --dir apps/web run typecheck
pnpm --dir apps/admin run check:file-size
```

Expected: every command exits 0.

- [ ] **Step 5: Commit repository guards**

```bash
git add .gitignore apps/admin/tsconfig.json apps/web/tsconfig.json apps/admin/scripts/check-file-size.mjs scripts/check-file-size.ts apps/admin/tests/next-output-isolation.test.ts
git commit -m "chore(next): 忽略开发构建产物"
```

### Task 4: Prove development and production outputs do not collide

**Files:**
- Verify only; Next may regenerate `apps/admin/next-env.d.ts` and `apps/web/next-env.d.ts` during the commands.

- [ ] **Step 1: Record the current tracked-file state**

Run:

```bash
git status --short
git diff -- apps/admin/next-env.d.ts apps/web/next-env.d.ts apps/admin/tsconfig.json apps/web/tsconfig.json
```

Expected: no unplanned changes in these four tracked files.

- [ ] **Step 2: Start admin development once**

Run `pnpm --dir apps/admin exec next dev -H 127.0.0.1 -p 3110`, wait for `Ready`, then stop it with `Ctrl-C`.

Run:

```bash
test -d apps/admin/.next-dev/server
test ! -e apps/admin/.next-dev/BUILD_ID
```

Expected: both checks exit 0; development output exists only in `.next-dev` and has no production build ID.

- [ ] **Step 3: Start website development once**

Run `pnpm --dir apps/web exec next dev -H 127.0.0.1 -p 3120`, wait for `Ready`, then stop it with `Ctrl-C`.

Run:

```bash
test -d apps/web/.next-dev/server
test ! -e apps/web/.next-dev/BUILD_ID
```

Expected: both checks exit 0.

- [ ] **Step 4: Build both production applications**

Run:

```bash
pnpm --dir apps/admin run build
pnpm --dir apps/web run build
test -f apps/admin/.next/BUILD_ID
test -f apps/admin/.next/standalone/apps/admin/server.js
test -f apps/web/.next/BUILD_ID
test -f apps/web/.next/standalone/apps/web/server.js
```

Expected: all commands exit 0 and production artifacts remain under `.next`.

- [ ] **Step 5: Run final verification and inspect scope**

Run:

```bash
bun test apps/admin/tests/next-output-isolation.test.ts apps/web/tests/release-quality-contract.test.ts
pnpm --dir apps/admin run typecheck
pnpm --dir apps/web run typecheck
git diff --check
git status --short
```

Expected: tests and type checks exit 0; only the pre-existing unrelated untracked documents remain, and `next-env.d.ts` points back to `.next` after production builds.

If a development command changed a tracked generated file and the production build did not restore it, restore only the generated reference through `apply_patch`, rerun the relevant type check, and document the deviation.
