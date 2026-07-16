# Root Test Orchestration Design

**Date:** 2026-07-16

## Problem

Running `bun test` at the repository root is not a valid monorepo-wide test command. Bun discovers
tests across workspaces while resolving package-local aliases from the wrong working directory.
This creates false `Cannot find module '@/...'` errors. Broad package scans can also load Playwright
E2E specs as Bun tests.

The repository currently has no root `test` script. The stable baselines are:

- root release contract tests under `scripts/*.test.ts`;
- Domain tests under `packages/domain/src`;
- the existing Web unit contract entrypoint, `apps/web/tests`.

API and Admin contain real unit-test failures on current `main`. Those failures must remain visible,
but they must not make the default stable gate unusable while they are repaired separately.

## Goals

1. Provide one green root command for stable unit and release-contract tests.
2. Provide one diagnostic command that runs every Bun unit-test workspace with the correct `cwd`.
3. Continue all diagnostic suites after a failure and return a final nonzero exit code.
4. Keep Playwright E2E suites outside Bun unit-test orchestration.
5. Add no dependency and change no production behavior.

## Non-Goals

- Fix existing API or Admin test failures.
- Run browser E2E tests from the root unit-test command.
- Change package aliases, Bun configuration, application code, or CI deployment workflows.
- Claim `test:all` is green before the existing API/Admin failures are resolved.

## Commands

The root `package.json` will expose:

```text
bun run test       -> stable mode
bun run test:all   -> diagnostic all-workspace mode
```

Stable mode runs these suites sequentially:

| Suite | Working directory | Bun test targets |
| --- | --- | --- |
| release-contracts | repository root | the sorted top-level `./scripts/*.test.ts` files |
| domain | `packages/domain` | `./src` |
| web | `apps/web` | `./tests` |

All-workspace mode runs the stable suites plus:

| Suite | Working directory | Bun test targets |
| --- | --- | --- |
| api | `apps/api` | `./src` |
| admin | `apps/admin` | `./app ./components ./lib ./tests` |
| web | `apps/web` | `./tests ./components` |

Bun uses path substring filters, so every directory target uses a `./` prefix to avoid matching ancestor paths and collecting E2E files.
The explicit Admin and Web targets exclude their `e2e` directories. Web all-mode replaces the
stable Web suite instead of running it twice.

## Runner

Add `scripts/run-workspace-tests.ts` with two modes: `--stable` and `--all`.

The runner owns a typed suite definition containing a display name, working directory, and Bun test
arguments. It discovers only root-level `scripts/*.test.ts` contract files and emits sorted
`./scripts/*.test.ts` targets, anchoring each concrete file target to the repository root. It launches
every suite with `Bun.spawn` without a shell. Child output is inherited so failure details remain
visible.

Suites run sequentially to keep logs readable and avoid cross-process resource contention. The
runner records each exit code, continues after failures, prints one final summary, and exits:

- `0` when every selected suite passes;
- `1` when one or more suites fail;
- `2` for an unsupported CLI mode or invalid runner configuration.

## Testing

Add `scripts/run-workspace-tests.test.ts` before implementing the runner.

The contract test will verify:

- root `test` and `test:all` scripts call the runner with the correct modes;
- stable mode contains exactly release-contracts, Domain, and Web;
- all mode contains release-contracts, Domain, API, Admin, and expanded Web targets;
- no suite target contains an `e2e` directory;
- invalid modes fail before spawning a child;
- aggregate status is nonzero when any child fails while later suites still run.

Verification after implementation:

1. Run the runner contract test and observe red, then green.
2. Run `bun run test`; it must pass.
3. Run `bun run test:all`; it is expected to finish all suites and return nonzero while current
   API/Admin failures remain. Its summary must identify those failing suites.
4. Run `git diff --check` and confirm no package lock changes or new dependency.

## Rollout

The default `test` command can be adopted as the stable local and CI unit-test gate. `test:all` is an
explicit debt-audit command until API/Admin reach a green baseline. Moving a workspace from
diagnostic-only coverage into the stable gate requires that workspace's complete configured suite to
pass on `main` first.
