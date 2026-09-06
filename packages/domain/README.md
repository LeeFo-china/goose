# @gooes/domain

Shared domain constants, literal unions, config maps, and type guards for Gooes.

## Install

```bash
npm install @gooes/domain@1.20.0
```

## Usage

```ts
import {
  PROJECT_STATUS_VALUES,
  ProjectStatusConfig,
  type ProjectStatus,
} from "@gooes/domain";

const options = PROJECT_STATUS_VALUES.map((value) => ({
  label: ProjectStatusConfig[value].label,
  value,
}));
```

## Scope

This package only contains:

- business enums
- literal value arrays
- config maps
- type guards
- shared DTOs and Zod input/result schemas

It does not contain:

- database clients
- Fastify code
- Supabase types
- environment-dependent runtime logic

## Local client handoff

`1.20.0` adds the customer-lead source, employee permissions, paginated DTOs,
command schemas and error catalog. Existing exports remain available. See
`docs/2026-09-06-customer-leads-miniprogram-handoff.md` in the Gooes repository.
The version is a local tarball delivery; the install example above requires
that your registry actually hosts this version.

From the repository root:

```bash
bun run --cwd packages/domain build
bun run --cwd packages/domain verify:packed-consumer
mkdir -p .artifacts/domain
npm pack ./packages/domain --ignore-scripts --pack-destination .artifacts/domain
shasum -a 256 .artifacts/domain/gooes-domain-1.20.0.tgz
```

Build before packing. `--ignore-scripts` intentionally avoids the legacy
`prepack` clean command, which removes earlier tarballs from the package folder.
The consumer verifier builds and packs into an isolated temporary directory,
then checks declaration imports and runtime schema identity with external Zod.
Keep tarballs out of Git; deliver the version, artifact and checksum together.
Client dependency installation belongs to the client repository's owning team.
