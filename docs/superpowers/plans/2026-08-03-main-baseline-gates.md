# Main Baseline Gates Implementation Plan

> **Goal:** Restore the latest `main` test and API image build baseline before integrating the Douyin mini-app work.

## Scope

- Update stale deployment contract assertions so they reflect the already-merged independent H5 service.
- Replace the brittle explicit-transaction migration count assertion with a behavioral guard that still exercises every matching migration.
- Remove the duplicate domain export binding that fails under the CI image's Bun 1.3.14 runtime while preserving the public export.
- Do not change migrations, databases, deployments, production, Orange, or Douyin code in this prerequisite branch.

## Tasks

1. Reproduce the nine baseline test failures and the domain build failure with Bun 1.3.14.
2. Canonicalize `VIRTUAL_PAYMENT_ENVIRONMENTS` through `virtual-product.ts`, then verify direct and package-root exports plus the exact CI-runtime build.
3. Align Web/H5 deployment contract expectations with the current workflow and resolver behavior.
4. Make the migration helper contract assert that the exercised set is non-empty and validate every discovered explicit-transaction migration without pinning repository growth to a fixed count.
5. Run focused tests, domain tests/builds, repository type checks, full tests, and builds.
6. Review the diff, commit the isolated baseline fix, push `fix/main-baseline-gates`, and create a PR against `main`.

## Verification

```bash
npx --yes bun@1.3.14 run build
bun test packages/domain/src/branding-virtual-payment.test.ts packages/domain/src/virtual-product.test.ts
bun test apps/web/tests/seo-deploy-contract.test.ts apps/web/tests/automatic-dev-deployment-contract.test.ts apps/web/tests/deploy-service-resolver.test.ts apps/web/tests/web-deployment-gate-contract.test.ts apps/web/tests/dev-change-plan.test.ts apps/web/tests/production-web-cutover-contract.test.ts scripts/release-orchestration-contract.test.ts
bun run test
bun run api:typecheck
bun run admin:check
bun run web:check
pnpm --dir apps/web lighthouse:gate
bun run api:build
bun run admin:build
bun run web:build
bun run h5:build
```

## Existing non-stable suite debt

`bun run test:all` was also executed. The repository's non-default aggregate mode remains red on the unmodified latest-main test surface: API reports 154 aggregate failures and Admin reports 9. An isolated API file inventory still finds 93 independently failing files, including live database dependencies, expired evidence fixtures, and stale mocks. This prerequisite change does not skip, rewrite, or suppress those unrelated failures; the authoritative repository-default `bun run test` stable gate must remain green.
