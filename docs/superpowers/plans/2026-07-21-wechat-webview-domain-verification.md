# WeChat WebView Domain Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the WeChat WebView verification file `jLSkeG7x43.txt` with its exact 32-byte content from both `https://h5.goodcms.cn/` and `https://h5-dev.goodcms.cn/`.

**Architecture:** Production H5 is an Nginx static site built from `apps/h5`, while development H5 currently proxies to the standalone Next.js app in `apps/web`. Store the same verification artifact in both source trees, copy it into the H5 build output, teach the production deploy workflow to install it, and publish it directly to both running environments for immediate verification.

**Tech Stack:** Bun tests, Node.js H5 build script, Next.js public assets, GitHub Actions, Nginx, Docker, SSH.

---

### Task 1: Lock the artifact and deployment contract

**Files:**
- Create: `scripts/webview-verification-contract.test.ts`

- [x] Write a Bun test that reads both source artifacts as raw bytes and expects the exact token `6925d140a8ba805235b2f820b5d4f55d` without a trailing newline.
- [x] Assert that `apps/h5/scripts/build.mjs` copies `jLSkeG7x43.txt` to the root of `apps/h5/dist`.
- [x] Assert that `.github/workflows/deploy.yml` installs the built file into the production H5 document root.
- [x] Run `bun test scripts/webview-verification-contract.test.ts` and confirm it fails because the source artifacts and build/deploy wiring do not exist yet.

### Task 2: Add the persistent verification artifacts

**Files:**
- Create: `apps/h5/jLSkeG7x43.txt`
- Create: `apps/web/public/jLSkeG7x43.txt`
- Modify: `apps/h5/scripts/build.mjs`
- Modify: `.github/workflows/deploy.yml`

- [x] Copy the downloaded 32-byte token into both source files without adding whitespace or a trailing newline.
- [x] Add the following H5 build copy after `config.js` is copied:

```js
await cp(
  resolve(root, "jLSkeG7x43.txt"),
  resolve(dist, "jLSkeG7x43.txt"),
);
```

- [x] Add the following production deployment install alongside the other H5 artifacts:

```bash
install -m 0644 "$H5_DIST_DIR/jLSkeG7x43.txt" "$H5_TARGET_DIR/jLSkeG7x43.txt"
```

- [x] Run the contract test and confirm it passes.
- [x] Run `bun run h5:build` and compare the built file byte-for-byte with the downloaded source file.
- [x] Run the Web static checks and production build so the Next.js standalone output is proven to include the public file.

### Task 3: Publish and verify both domains

**Files:**
- Runtime production target: `/opt/supabase/docker/volumes/gooes/h5/jLSkeG7x43.txt` on `gooes-prod-supabase`.
- Runtime development target: `/app/apps/web/public/jLSkeG7x43.txt` in container `gooes-web-dev` on `gooes-dev`.

- [x] Stream the downloaded file to the production H5 document root with mode `0644`.
- [x] Stream the downloaded file into the running development Web container with mode `0644`.
- [x] Request both public HTTPS URLs with cache-busting query parameters.
- [x] Verify both return `200`, `Content-Type: text/plain`, exactly 32 bytes, and the exact expected token.

### Task 4: Review and commit

**Files:**
- Review only the files listed in Tasks 1-2 plus this plan.

- [x] Run `git diff --check` on the scoped changes.
- [x] Confirm pre-existing `.codex/skills/wechatpay-payment-integration` changes remain unstaged and untouched.
- [x] Commit only the scoped files with `chore(web): 添加 WebView 域名校验文件`.
